import { useRef, useEffect } from "react";

interface ScrollVideoLogoProps {
  onStart: () => void;
}

/**
 * Fullscreen scroll-driven video intro.
 *
 * Strategy that actually works cross-browser:
 * 1. Video starts PLAYING (autoplay muted) so the decoder warms up immediately.
 * 2. Once video can play through, we PAUSE it and hand control to scroll.
 * 3. Scroll maps forward → toward end of video (disassemble).
 * 4. At 94 % progress onStart() fires automatically.
 *
 * The "assembled → disassemble" direction:
 *   If your video starts disassembled and ends assembled → we play through
 *   to near the END, then scroll backward to disassemble.
 *   invertDir = true below.
 *   Change to false if your video starts assembled and ends disassembled.
 */
const INVERT = true; // true = end of video = assembled shield; scroll disassembles

export default function ScrollVideoLogo({ onStart }: ScrollVideoLogoProps) {
  const containerRef  = useRef<HTMLDivElement>(null);
  const videoRef      = useRef<HTMLVideoElement>(null);
  const overlayRef    = useRef<HTMLDivElement>(null); // "Cargando" overlay
  const indicatorRef  = useRef<HTMLDivElement>(null);
  const canvasRef     = useRef<HTMLCanvasElement>(null);

  const targetProg  = useRef(0);
  const currentProg = useRef(0);
  const lastSeekT   = useRef(-1);
  const rafId       = useRef(0);
  const entered     = useRef(false);
  const durRef      = useRef(0);
  const scrollReady = useRef(false); // true once we've handed off to scroll

  // ── STEP 1: let the video play briefly so decoder has hot frames ──────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const startupPlay = () => {
      durRef.current = video.duration;
      if (!durRef.current || isNaN(durRef.current)) return;

      // Seek to 10 % of video to warm up the decoder there
      const warmFrame = durRef.current * 0.1;
      video.currentTime = warmFrame;
      lastSeekT.current = warmFrame;

      // Play the video forward; once it can play through, pause near end
      video.play().catch(() => {});
    };

    const onCanPlay = () => {
      startupPlay();
      video.removeEventListener("canplaythrough", onCanPlay);
      video.removeEventListener("canplay",        onCanPlay);
    };

    const onTimeUpdate = () => {
      if (!scrollReady.current && durRef.current > 0) {
        // After 0.8s of playback, pause and jump to the "assembled" frame
        const frac = video.currentTime / durRef.current;
        if (frac >= 0.15) {   // played 15% of the video
          video.pause();
          // Go to initial display position
          const initT = INVERT
            ? durRef.current * 0.92   // near end = assembled
            : durRef.current * 0.05;  // near start = assembled
          video.currentTime = initT;
          lastSeekT.current = initT;
          targetProg.current = INVERT ? 0 : 0;
          currentProg.current = 0;
          scrollReady.current = true;

          // Hide loading overlay now
          if (overlayRef.current) {
            overlayRef.current.style.opacity = "0";
            setTimeout(() => {
              if (overlayRef.current) overlayRef.current.style.display = "none";
            }, 500);
          }

          video.removeEventListener("timeupdate", onTimeUpdate);
        }
      }
    };

    video.addEventListener("canplaythrough", onCanPlay);
    video.addEventListener("canplay",        onCanPlay);
    video.addEventListener("timeupdate",     onTimeUpdate);

    if (video.readyState >= 4) onCanPlay(); // already ready
    else if (video.readyState >= 3) onCanPlay();

    return () => {
      video.removeEventListener("canplaythrough", onCanPlay);
      video.removeEventListener("canplay",        onCanPlay);
      video.removeEventListener("timeupdate",     onTimeUpdate);
    };
  }, []);

  // ── STEP 2: scroll / touch input ────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!scrollReady.current) return;
      const norm  = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
      const speed = Math.min(Math.abs(e.deltaY), 100) / 100;
      targetProg.current = Math.max(0, Math.min(1, targetProg.current + norm * speed * 0.022));
    };

    let lastTY = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) lastTY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      if (!scrollReady.current) return;
      const dy    = lastTY - e.touches[0].clientY;
      lastTY      = e.touches[0].clientY;
      const delta = (dy / window.innerHeight) * 2.0;
      targetProg.current = Math.max(0, Math.min(1, targetProg.current + delta));
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

  // ── STEP 3: rAF loop — direct DOM mutations only ─────────────────────
  useEffect(() => {
    const LERP      = 0.08;
    const SEEK_TH   = 0.004; // only write currentTime if moved > 4ms
    const ENTER_AT  = 0.93;

    const tick = () => {
      const dur = durRef.current;
      if (dur && scrollReady.current) {
        const diff = targetProg.current - currentProg.current;
        if (Math.abs(diff) > 0.0003) {
          currentProg.current += diff * LERP;
          currentProg.current  = Math.max(0, Math.min(1, currentProg.current));
          const p = currentProg.current;

          // Map progress to video time
          // INVERT=true: p=0 → near end (assembled), p=1 → near 0 (disassembled)
          const mapped = INVERT
            ? (1 - p) * dur * 0.92        // stays in 0..92% range
            : p * dur;
          const clamped = Math.max(0.01, Math.min(dur - 0.04, mapped));

          const video = videoRef.current;
          if (video && Math.abs(clamped - lastSeekT.current) > SEEK_TH) {
            video.currentTime = clamped;
            lastSeekT.current = clamped;
          }

          // Fade out indicator
          if (indicatorRef.current) {
            indicatorRef.current.style.opacity = p < 0.2 ? String(1 - p * 5) : "0";
          }

          // Auto-enter
          if (p >= ENTER_AT && !entered.current) {
            entered.current = true;
            onStart();
          }
        }
      }
      rafId.current = requestAnimationFrame(tick);
    };

    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [onStart]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        cursor: "ns-resize",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* ── Cinematic background: deep space gradient ── */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse 90% 90% at 50% 50%, #0a1628 0%, #040810 100%)",
        zIndex: 0,
      }} />

      {/* ── Animated Argentine flag color bands ── */}
      <div style={{
        position: "absolute",
        top: 0, left: 0, right: 0, height: "3px",
        background: "linear-gradient(90deg, transparent, #74acdf 30%, #ffffff 50%, #74acdf 70%, transparent)",
        opacity: 0.6,
        animation: "svl-band 4s ease-in-out infinite",
        zIndex: 1,
      }} />
      <div style={{
        position: "absolute",
        bottom: 0, left: 0, right: 0, height: "3px",
        background: "linear-gradient(90deg, transparent, #74acdf 30%, #ffffff 50%, #74acdf 70%, transparent)",
        opacity: 0.6,
        animation: "svl-band 4s ease-in-out infinite 0.5s",
        zIndex: 1,
      }} />

      {/* ── Particle field (CSS only, no JS) ── */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
        {Array.from({ length: 40 }).map((_, i) => {
          const x = (i * 37 + 11) % 100;
          const y = (i * 53 + 23) % 100;
          const size = 1 + (i % 3);
          const dur  = 3 + (i % 5);
          const del  = (i * 0.3) % 4;
          return (
            <div key={i} style={{
              position: "absolute",
              left: `${x}%`,
              top: `${y}%`,
              width: `${size}px`,
              height: `${size}px`,
              borderRadius: "50%",
              background: i % 3 === 0 ? "#74acdf" : i % 3 === 1 ? "#ffffff" : "#f6b800",
              opacity: 0,
              animation: `svl-star ${dur}s ease-in-out ${del}s infinite`,
            }} />
          );
        })}
      </div>

      {/* ── Video element ── */}
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
          objectFit: "contain",
          objectPosition: "center",
          pointerEvents: "none",
          zIndex: 3,
          // Start visible — we'll fade in the overlay away instead
          opacity: 1,
          willChange: "transform",
          transform: "translateZ(0)",
        }}
      />

      {/* ── Loading overlay (hides while video primes) ── */}
      <div
        ref={overlayRef}
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(ellipse 90% 90% at 50% 50%, #0a1628 0%, #040810 100%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "20px",
          zIndex: 10,
          transition: "opacity 0.5s ease",
        }}
      >
        {/* Spinning ring */}
        <div style={{
          width: "64px",
          height: "64px",
          border: "3px solid rgba(116,172,223,0.15)",
          borderTop: "3px solid #74acdf",
          borderRadius: "50%",
          animation: "svl-spin 1s linear infinite",
        }} />
        <span style={{
          color: "rgba(116,172,223,0.7)",
          fontSize: "12px",
          letterSpacing: "3px",
          textTransform: "uppercase",
        }}>
          Cargando escudo…
        </span>
      </div>

      {/* ── Vignette ── */}
      <div style={{
        position: "absolute",
        inset: 0,
        background: "radial-gradient(ellipse 75% 75% at 50% 48%, transparent 25%, rgba(4,8,16,0.75) 100%)",
        pointerEvents: "none",
        zIndex: 4,
      }} />

      {/* ── Scroll indicator ── */}
      <div
        ref={indicatorRef}
        style={{
          position: "absolute",
          bottom: "clamp(22px, 4.5vh, 48px)",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "10px",
          pointerEvents: "none",
          zIndex: 6,
          color: "#74acdf",
          transition: "opacity 0.3s ease",
        }}
      >
        <div style={{
          width: "20px",
          height: "32px",
          border: "2px solid rgba(116,172,223,0.8)",
          borderRadius: "12px",
          display: "flex",
          justifyContent: "center",
          paddingTop: "6px",
          boxSizing: "border-box",
          boxShadow: "0 0 12px rgba(116,172,223,0.4)",
        }}>
          <div style={{
            width: "4px",
            height: "7px",
            borderRadius: "3px",
            background: "#74acdf",
            boxShadow: "0 0 6px #74acdf",
            animation: "svl-wheel 1.5s ease-in-out infinite",
          }} />
        </div>
        <span style={{
          fontSize: "clamp(9px, 1.6vw, 11px)",
          fontWeight: 700,
          letterSpacing: "2.5px",
          textTransform: "uppercase",
          textAlign: "center",
          textShadow: "0 0 16px rgba(116,172,223,0.8)",
          whiteSpace: "nowrap",
        }}>
          Desplaza para ingresar a la web
        </span>
      </div>

      {/* ── Keyframes ── */}
      <style>{`
        @keyframes svl-wheel {
          0%   { opacity: 0; transform: translateY(0); }
          20%  { opacity: 1; }
          80%  { opacity: 0.15; transform: translateY(10px); }
          100% { opacity: 0; transform: translateY(0); }
        }
        @keyframes svl-star {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50%       { opacity: 0.6; transform: scale(1); }
        }
        @keyframes svl-band {
          0%, 100% { opacity: 0.2; transform: scaleX(0.5); }
          50%       { opacity: 0.7; transform: scaleX(1); }
        }
        @keyframes svl-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
