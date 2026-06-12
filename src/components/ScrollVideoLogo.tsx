import { useRef, useEffect, useCallback } from "react";

interface ScrollVideoLogoProps {
  onStart: () => void;
}

const INVERT = true; // end of video = assembled shield

export default function ScrollVideoLogo({ onStart }: ScrollVideoLogoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef     = useRef<HTMLVideoElement>(null);
  const promptRef    = useRef<HTMLDivElement>(null);

  const targetProg  = useRef(0);
  const currentProg = useRef(0);
  const lastSeekT   = useRef(-1);
  const lastSeekTime = useRef(0);
  const rafId       = useRef(0);
  const entered     = useRef(false);
  const durRef      = useRef(0);
  const videoLoaded = useRef(false);
  const videoErrored = useRef(false);
  const keysPressed = useRef<{ [key: string]: boolean }>({});

  const revealVideo = useCallback(() => {
    if (videoErrored.current) return;
    videoLoaded.current = true;
    if (videoRef.current && videoRef.current.style) {
      videoRef.current.style.opacity = "1";
    }
  }, []);

  // ── VIDEO INIT ───────────────────────────────────────────────────────────
  useEffect(() => {
    // 1. Show scroll prompt shortly after
    const promptTimer = setTimeout(() => {
      if (promptRef.current) promptRef.current.style.opacity = "1";
    }, 300);

    // 2. Try to load video in the background
    const video = videoRef.current;
    if (!video) return;

    const setupVideo = () => {
      const dur = video.duration;
      if (!dur || isNaN(dur) || !isFinite(dur) || dur <= 0) return;
      durRef.current = dur;
      const initT = INVERT ? Math.max(0.01, dur - 0.08) : 0.02;
      video.addEventListener("seeked", revealVideo, { once: true });
      video.currentTime = initT;
      lastSeekT.current = initT;
    };

    const onError = () => {
      videoErrored.current = true;
      console.warn("SVL: video failed");
    };

    video.addEventListener("loadeddata",     setupVideo, { once: true });
    video.addEventListener("loadedmetadata", setupVideo, { once: true });
    video.addEventListener("error",          onError);
    
    if (video.readyState >= 2) setupVideo();
    else if (video.readyState >= 1) setupVideo();

    return () => {
      clearTimeout(promptTimer);
      video.removeEventListener("loadeddata",     setupVideo);
      video.removeEventListener("loadedmetadata", setupVideo);
      video.removeEventListener("error",          onError);
    };
  }, [revealVideo]);

  // ── KEYBOARD LISTENERS ───────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        e.preventDefault();
        keysPressed.current[e.key] = true;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        keysPressed.current[e.key] = false;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup",   handleKeyUp);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup",   handleKeyUp);
    };
  }, []);

  // ── SCROLL / TOUCH ──────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let primed = false;
    const prime = () => {
      if (primed) return;
      primed = true;
      revealVideo();
      const v = videoRef.current;
      if (v) {
        v.play().then(() => setTimeout(() => v.pause(), 40)).catch(() => {});
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      prime();
      const norm = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
      // Normalized step: base 0.04 scaled slightly based on deltaY magnitude to feel natural
      const baseStep = 0.04;
      const step = baseStep * Math.max(0.5, Math.min(2.0, Math.abs(e.deltaY) / 60));
      targetProg.current = Math.max(0, Math.min(1, targetProg.current + norm * step));
    };

    let lastTY = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) { lastTY = e.touches[0].clientY; prime(); }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const dy = lastTY - e.touches[0].clientY;
      lastTY   = e.touches[0].clientY;
      targetProg.current = Math.max(0, Math.min(1, targetProg.current + (dy / window.innerHeight) * 2.0));
    };
    // Click/tap to progress (mobile fallback)
    const onClick = () => {
      targetProg.current = Math.min(1, targetProg.current + 0.15);
    };

    el.addEventListener("wheel",      onWheel,      { passive: false });
    el.addEventListener("touchstart", onTouchStart, { passive: true  });
    el.addEventListener("touchmove",  onTouchMove,  { passive: false });
    el.addEventListener("click",      onClick);
    return () => {
      el.removeEventListener("wheel",      onWheel);
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove",  onTouchMove);
      el.removeEventListener("click",      onClick);
    };
  }, [revealVideo]);

  // ── rAF LOOP ────────────────────────────────────────────────────────────
  useEffect(() => {
    const tick = () => {
      // Keyboard input handling
      if (keysPressed.current["ArrowUp"]) {
        const v = videoRef.current;
        if (v) {
          v.play().then(() => setTimeout(() => v.pause(), 40)).catch(() => {});
        }
        targetProg.current = Math.min(1, targetProg.current + 0.008);
      }
      if (keysPressed.current["ArrowDown"]) {
        targetProg.current = Math.max(0, targetProg.current - 0.008);
      }

      // Dynamic duration check (polls element if durRef.current is not set or invalid yet)
      const v = videoRef.current;
      if (v && (!durRef.current || !isFinite(durRef.current) || durRef.current <= 0)) {
        const d = v.duration;
        if (d && !isNaN(d) && isFinite(d) && d > 0) {
          durRef.current = d;
          const initT = INVERT ? Math.max(0.01, d - 0.08) : 0.02;
          v.currentTime = initT;
          lastSeekT.current = initT;
          revealVideo();
        }
      }

      const diff = targetProg.current - currentProg.current;
      if (Math.abs(diff) > 0.0001) {
        currentProg.current += diff * 0.09;
        currentProg.current  = Math.max(0, Math.min(1, currentProg.current));
        const p = currentProg.current;

        // Seek video (throttled to avoid hardware decoder starvation)
        const dur = durRef.current;
        const now = performance.now();
        if (dur && isFinite(dur) && dur > 0 && v && !v.seeking && now - lastSeekTime.current > 30) {
          const mapped  = INVERT
            ? Math.max(0.01, (1 - p) * dur - 0.04)
            : Math.min(dur - 0.04, p * dur + 0.01);
          const clamped = Math.max(0.01, Math.min(dur - 0.04, mapped));
          if (Math.abs(clamped - lastSeekT.current) > 0.01) {
            v.currentTime   = clamped;
            lastSeekT.current = clamped;
            lastSeekTime.current = now;
          }
        }

        // Fade video out as user scrolls (stays fully visible until 80% scroll)
        let opacity = "1";
        if (p > 0.8) {
          opacity = String(Math.max(0, 1 - (p - 0.8) * 5));
        }
        if (videoLoaded.current && v) {
          v.style.opacity = opacity;
        }

        // Fade indicator
        if (promptRef.current)
          promptRef.current.style.opacity = p < 0.2 ? String(1 - p * 5) : "0";

        // Auto-enter
        if (p >= 0.93 && !entered.current) {
          entered.current = true;
          onStart();
        }
      }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [onStart, revealVideo]);

  // ── RENDER ───────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute", inset: 0, overflow: "hidden",
        cursor: "pointer", userSelect: "none", WebkitUserSelect: "none",
      }}
    >
      {/* Deep space background */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(ellipse 90% 90% at 50% 50%, #0a1628 0%, #040810 100%)",
        zIndex: 0,
      }} />

      {/* Argentine flag bands */}
      {[0, 1].map(i => (
        <div key={i} style={{
          position: "absolute",
          ...(i === 0 ? { top: 0 } : { bottom: 0 }),
          left: 0, right: 0, height: "3px",
          background: "linear-gradient(90deg, transparent, #74acdf 30%, #fff 50%, #74acdf 70%, transparent)",
          opacity: 0.55, zIndex: 1,
          animation: `svl-band 4s ease-in-out ${i === 1 ? "0.5s" : "0s"} infinite`,
        }} />
      ))}

      {/* Particles */}
      <div style={{ position: "absolute", inset: 0, zIndex: 1, pointerEvents: "none" }}>
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} style={{
            position: "absolute",
            left: `${(i * 37 + 11) % 100}%`,
            top:  `${(i * 53 + 23) % 100}%`,
            width: `${1 + (i % 3)}px`,
            height: `${1 + (i % 3)}px`,
            borderRadius: "50%",
            background: (["#74acdf", "#ffffff", "#f6b800"] as string[])[i % 3],
            opacity: 0,
            animation: `svl-star ${3 + (i % 5)}s ease-in-out ${(i * 0.3) % 4}s infinite`,
          }} />
        ))}
      </div>

      {/* No fallback image - use video directly */}

      {/* Video — loads in background, fades in over image if it works */}
      <video
        ref={videoRef}
        src="/logo.mp4"
        muted
        playsInline
        preload="auto"
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "contain", objectPosition: "center",
          pointerEvents: "none", zIndex: 3, opacity: 0,
          transition: "opacity 0.6s ease",
          willChange: "transform", transform: "translateZ(0)",
        }}
      />

      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none",
        background: "radial-gradient(ellipse 75% 75% at 50% 48%, transparent 25%, rgba(4,8,16,0.75) 100%)",
      }} />

      {/* Scroll indicator */}
      <div
        ref={promptRef}
        style={{
          position: "absolute",
          bottom: "clamp(22px, 4.5vh, 48px)",
          left: "50%", transform: "translateX(-50%)",
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: "10px",
          pointerEvents: "none", zIndex: 6,
          color: "#74acdf",
          textShadow: "0 0 14px rgba(116,172,223,0.9)",
          opacity: 0, transition: "opacity 0.3s ease",
        }}
      >
        <div style={{
          width: "20px", height: "32px",
          border: "2px solid rgba(116,172,223,0.8)",
          borderRadius: "12px", display: "flex",
          justifyContent: "center", paddingTop: "6px",
          boxSizing: "border-box",
          boxShadow: "0 0 12px rgba(116,172,223,0.4)",
        }}>
          <div style={{
            width: "4px", height: "7px", borderRadius: "3px",
            background: "#74acdf", boxShadow: "0 0 6px #74acdf",
            animation: "svl-wheel 1.5s ease-in-out infinite",
          }} />
        </div>
        <span style={{
          fontSize: "clamp(9px, 1.6vw, 11px)", fontWeight: 700,
          letterSpacing: "2.5px", textTransform: "uppercase",
          textAlign: "center", whiteSpace: "nowrap",
        }}>
          Desplaza para ingresar a la web
        </span>
      </div>

      <style>{`
        @keyframes svl-wheel {
          0%   { opacity: 0; transform: translateY(0); }
          20%  { opacity: 1; }
          80%  { opacity: 0.15; transform: translateY(10px); }
          100% { opacity: 0; transform: translateY(0); }
        }
        @keyframes svl-star {
          0%, 100% { opacity: 0; transform: scale(0.5); }
          50%       { opacity: 0.5; transform: scale(1); }
        }
        @keyframes svl-band {
          0%, 100% { opacity: 0.2; transform: scaleX(0.6); }
          50%       { opacity: 0.6; transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}
