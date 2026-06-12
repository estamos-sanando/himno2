import { useRef, useEffect } from "react";

interface ScrollVideoLogoProps {
  onStart: () => void;
  /**
   * true  = video frame 0 is DISASSEMBLED and end frame is ASSEMBLED
   *         (scroll DOWN → re-assembles, auto-enter when assembled)
   * false = video frame 0 is ASSEMBLED and end frame is DISASSEMBLED
   *         (scroll DOWN → disassembles, auto-enter when disassembled)
   */
  invertDirection?: boolean;
}

export default function ScrollVideoLogo({
  onStart,
  invertDirection = false, // default: start assembled (frame 0), scroll to disassemble
}: ScrollVideoLogoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef     = useRef<HTMLVideoElement>(null);
  const loadingRef   = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLDivElement>(null);

  const targetProgress  = useRef(0);
  const currentProgress = useRef(0);
  const lastSeekTime    = useRef(-1);
  const rafId           = useRef(0);
  const enteredRef      = useRef(false);
  const durationRef     = useRef(0);
  const readyRef        = useRef(false);   // true once first frame is painted

  // ── VIDEO INIT ──────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const showVideo = () => {
      if (readyRef.current) return;
      readyRef.current = true;
      video.style.opacity = "1";
      if (loadingRef.current) loadingRef.current.style.display = "none";
    };

    const onMeta = () => {
      const dur = video.duration;
      if (!dur || isNaN(dur)) return;
      durationRef.current = dur;

      // Seek to the initial frame (assembled shield)
      const initTime = invertDirection ? dur - 0.05 : 0.02;
      lastSeekTime.current = initTime;

      // seeked fires once the frame is actually decoded → safe to show
      const onFirstSeek = () => {
        showVideo();
        video.removeEventListener("seeked", onFirstSeek);
      };
      video.addEventListener("seeked", onFirstSeek);
      video.currentTime = initTime;

      // Fallback: play→pause to prime hardware decoder, then show if seeked hasn't fired yet
      video.play()
        .then(() => { video.pause(); video.currentTime = initTime; })
        .catch(() => {});

      // Hard fallback: show after 600 ms no matter what
      setTimeout(showVideo, 600);
    };

    // Listen for both loadedmetadata and loadeddata for maximum compat
    video.addEventListener("loadedmetadata", onMeta, { once: true });
    video.addEventListener("loadeddata",     showVideo,  { once: true });

    if (video.readyState >= 2) {
      onMeta();
      showVideo();
    } else if (video.readyState >= 1) {
      onMeta();
    }

    return () => {
      video.removeEventListener("loadedmetadata", onMeta);
      video.removeEventListener("loadeddata",     showVideo);
    };
  }, [invertDirection]);

  // ── SCROLL / TOUCH INPUT ────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Normalise so 1 mouse-notch ≈ 0.015, big trackpad flicks don't skip too far
      const raw   = e.deltaY;
      const norm  = raw === 0 ? 0 : (raw > 0 ? 1 : -1);
      const speed = Math.min(Math.abs(raw), 120) / 120; // cap at 1
      const delta = norm * speed * 0.025;
      targetProgress.current = Math.max(0, Math.min(1, targetProgress.current + delta));
    };

    let lastTY = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) lastTY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const dy  = lastTY - e.touches[0].clientY; // positive = swipe up = disassemble
      lastTY    = e.touches[0].clientY;
      const delta = (dy / window.innerHeight) * 2.2;
      targetProgress.current = Math.max(0, Math.min(1, targetProgress.current + delta));
    };

    el.addEventListener("wheel",      onWheel,      { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true  });
    el.addEventListener("touchmove",  onTouchMove,  { passive: false });
    return () => {
      el.removeEventListener("wheel",      onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove",  onTouchMove);
    };
  }, []);

  // ── rAF LOOP — zero React state mutations ───────────────────────────────
  useEffect(() => {
    const LERP         = 0.09;        // smooth but responsive
    const SEEK_THRESH  = 0.003;       // skip write if < 3 ms change
    const AUTO_ENTER   = 0.94;        // fire onStart at 94 % progress

    const tick = () => {
      const dur = durationRef.current;
      if (dur && !isNaN(dur)) {
        const diff = targetProgress.current - currentProgress.current;
        if (Math.abs(diff) > 0.0004) {
          currentProgress.current += diff * LERP;
          currentProgress.current  = Math.max(0, Math.min(1, currentProgress.current));
          const p = currentProgress.current;

          // Map progress → video time
          const mapped  = invertDirection
            ? (1 - p) * dur          // invert: p=0 → end, p=1 → start
            : p * dur;               // normal: p=0 → start, p=1 → end
          const clamped = Math.max(0.01, Math.min(dur - 0.04, mapped));

          const video = videoRef.current;
          if (video && Math.abs(clamped - lastSeekTime.current) > SEEK_THRESH) {
            video.currentTime  = clamped;
            lastSeekTime.current = clamped;
          }

          // Scroll indicator fade-out
          if (indicatorRef.current) {
            indicatorRef.current.style.opacity =
              p < 0.18 ? String(1 - p * 5.5) : "0";
          }

          // Auto-enter on full disassemble
          if (p >= AUTO_ENTER && !enteredRef.current) {
            enteredRef.current = true;
            onStart();
          }
        }
      }
      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [invertDirection, onStart]);

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "#050a12",
        willChange: "transform",
        WebkitTransform: "translateZ(0)",
        transform: "translateZ(0)",
        cursor: "ns-resize",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* Loading label */}
      <div
        ref={loadingRef}
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(116,172,223,0.5)",
          fontSize: "13px",
          letterSpacing: "3px",
          textTransform: "uppercase",
          zIndex: 3,
        }}
      >
        Cargando…
      </div>

      {/* Video — promoted to its own GPU compositor layer */}
      <video
        ref={videoRef}
        src="/logo.mp4"
        muted
        playsInline
        preload="auto"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",   // contain keeps full shield visible without cropping
          objectPosition: "center",
          pointerEvents: "none",
          opacity: 0,             // revealed by JS after first seeked event
          transition: "opacity 0.6s ease",
          willChange: "transform",
          WebkitTransform: "translateZ(0)",
          transform: "translateZ(0)",
          background: "#050a12",
        }}
      />

      {/* Vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 35%, rgba(0,0,0,0.7) 100%)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* Scroll indicator */}
      <div
        ref={indicatorRef}
        style={{
          position: "absolute",
          bottom: "clamp(20px, 4vh, 44px)",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
          pointerEvents: "none",
          zIndex: 5,
          color: "#74acdf",
          textShadow: "0 0 14px rgba(116,172,223,0.9)",
          opacity: 1,
          transition: "opacity 0.25s ease",
        }}
      >
        {/* Mouse icon */}
        <div
          style={{
            width: "18px",
            height: "28px",
            border: "2px solid currentColor",
            borderRadius: "10px",
            display: "flex",
            justifyContent: "center",
            paddingTop: "5px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              width: "4px",
              height: "6px",
              borderRadius: "3px",
              background: "currentColor",
              animation: "svl-wheel 1.4s ease-in-out infinite",
            }}
          />
        </div>
        <span
          style={{
            fontSize: "clamp(9px, 1.8vw, 11px)",
            fontWeight: 700,
            letterSpacing: "2px",
            textTransform: "uppercase",
            textAlign: "center",
          }}
        >
          Desplaza para ingresar a la web
        </span>
      </div>

      {/* Keyframe for wheel dot animation */}
      <style>{`
        @keyframes svl-wheel {
          0%   { opacity: 0;   transform: translateY(0); }
          20%  { opacity: 1; }
          80%  { opacity: 0.1; transform: translateY(9px); }
          100% { opacity: 0;   transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
