import { useRef, useEffect } from "react";

interface ScrollVideoLogoProps {
  onStart: () => void;
  /** If true: video starts at the END (shield assembled) and scrolling down disassembles it. */
  invertDirection?: boolean;
}

export default function ScrollVideoLogo({ onStart, invertDirection = true }: ScrollVideoLogoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef    = useRef<HTMLVideoElement>(null);
  const canvasRef   = useRef<HTMLCanvasElement>(null);

  // All progress tracking lives in refs — never in React state — to avoid re-renders in the rAF loop
  const targetProgress  = useRef(0);
  const currentProgress = useRef(0);
  const lastSeekTime    = useRef(-1);     // tracks last video.currentTime we wrote
  const frameId         = useRef(0);
  const enteredRef      = useRef(false);  // guard: only fire onStart once

  // ── VIDEO LOAD & DECODER INIT ──────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onMeta = () => {
      const dur = video.duration;
      if (!dur || isNaN(dur)) return;

      // Set initial frame immediately (no React state)
      const initTime = invertDirection ? dur - 0.04 : 0.01;
      video.currentTime = initTime;
      lastSeekTime.current = initTime;

      // Play→pause cycle primes the hardware decoder (required on Chrome mobile)
      video.play().then(() => {
        video.pause();
        video.currentTime = initTime;
      }).catch(() => {
        video.currentTime = initTime;
      });

      // Show video
      video.style.opacity = "1";

      // Hide loading placeholder
      const placeholder = containerRef.current?.querySelector<HTMLDivElement>(".vml-loading");
      if (placeholder) placeholder.style.display = "none";
    };

    if (video.readyState >= 1 && video.duration) {
      onMeta();
    } else {
      video.addEventListener("loadedmetadata", onMeta, { once: true });
    }

    return () => video.removeEventListener("loadedmetadata", onMeta);
  }, [invertDirection]);

  // ── SCROLL / TOUCH INPUT ──────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Wheel (mouse & trackpad)
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Normalize: mouse wheels give ~100 per notch, trackpads give 1-5
      const normalised = e.deltaY / Math.max(Math.abs(e.deltaY), 1);
      const delta = normalised * 0.015;   // 0.015 per "click" → ~67 clicks to traverse
      targetProgress.current = Math.max(0, Math.min(1, targetProgress.current + delta));
    };

    // Touch (swipe up = disassemble)
    let lastTouchY = 0;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) lastTouchY = e.touches[0].clientY;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const dy = lastTouchY - e.touches[0].clientY; // + = swipe up
      lastTouchY = e.touches[0].clientY;
      const delta = (dy / window.innerHeight) * 1.8; // one full-screen swipe ≈ 1.8× range
      targetProgress.current = Math.max(0, Math.min(1, targetProgress.current + delta));
    };

    container.addEventListener("wheel",      onWheel,      { passive: false });
    container.addEventListener("touchstart", onTouchStart, { passive: true  });
    container.addEventListener("touchmove",  onTouchMove,  { passive: false });
    return () => {
      container.removeEventListener("wheel",      onWheel);
      container.removeEventListener("touchstart", onTouchStart);
      container.removeEventListener("touchmove",  onTouchMove);
    };
  }, []);

  // ── rAF LOOP — zero React state mutations ─────────────────────────────
  useEffect(() => {
    const LERP_SPEED     = 0.10;   // lower = smoother but slower response
    const SEEK_THRESHOLD = 0.003;  // only seek if mapped time changed by >3ms
    const AUTO_TRIGGER   = 0.97;   // fire onStart when progress reaches this

    const tick = () => {
      const video = videoRef.current;
      if (video && video.duration && !isNaN(video.duration)) {
        const diff = targetProgress.current - currentProgress.current;

        if (Math.abs(diff) > 0.0005) {
          currentProgress.current += diff * LERP_SPEED;
          currentProgress.current = Math.max(0, Math.min(1, currentProgress.current));

          const p = currentProgress.current;

          // Map to video time
          const mapped = invertDirection
            ? (1 - p) * video.duration
            : p * video.duration;
          const clamped = Math.max(0, Math.min(video.duration - 0.04, mapped));

          // Only write currentTime if it actually moved — avoids seek thrash
          if (Math.abs(clamped - lastSeekTime.current) > SEEK_THRESHOLD) {
            video.currentTime = clamped;
            lastSeekTime.current = clamped;
          }

          // Update scroll indicator opacity (direct DOM mutation — no React state)
          const indicator = containerRef.current?.querySelector<HTMLElement>(".vml-indicator");
          if (indicator) {
            indicator.style.opacity = p < 0.15 ? String(1 - p * 6.6) : "0";
          }

          // Auto-enter when shield is fully disassembled
          if (p >= AUTO_TRIGGER && !enteredRef.current) {
            enteredRef.current = true;
            onStart();
          }
        }
      }

      frameId.current = requestAnimationFrame(tick);
    };

    frameId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId.current);
  }, [invertDirection, onStart]);

  // ── RENDER ────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: "#000",
        // Promote to GPU layer for zero-cost compositing
        willChange: "transform",
        transform: "translateZ(0)",
      }}
    >
      {/* Loading placeholder */}
      <div
        className="vml-loading"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255,255,255,0.4)",
          fontSize: "14px",
          letterSpacing: "2px",
          textTransform: "uppercase",
          zIndex: 2,
        }}
      >
        Cargando…
      </div>

      {/* Video — GPU layer, cover the full screen */}
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
          objectFit: "cover",
          pointerEvents: "none",
          opacity: 0,                     // shown once loaded (set inline by effect)
          transition: "opacity 0.5s ease",
          willChange: "transform",
          transform: "translateZ(0)",
        }}
      />

      {/* Vignette overlay */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0,0,0,0.65) 100%)",
          pointerEvents: "none",
          zIndex: 2,
        }}
      />

      {/* Scroll indicator — opacity mutated directly in rAF */}
      <div
        className="vml-indicator"
        style={{
          position: "absolute",
          bottom: "clamp(24px, 5vh, 48px)",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "8px",
          pointerEvents: "none",
          zIndex: 5,
          color: "var(--cyan, #00f2fe)",
          textShadow: "0 0 12px rgba(0,242,254,0.9)",
          opacity: 1,
          transition: "opacity 0.2s ease",
        }}
      >
        <div
          style={{
            width: "18px",
            height: "28px",
            border: "2px solid currentColor",
            borderRadius: "10px",
            display: "flex",
            justifyContent: "center",
            paddingTop: "5px",
          }}
        >
          <div
            style={{
              width: "4px",
              height: "6px",
              borderRadius: "3px",
              background: "currentColor",
              animation: "vml-wheel 1.4s ease-in-out infinite",
            }}
          />
        </div>
        <span
          style={{
            fontSize: "clamp(9px, 1.5vw, 11px)",
            fontWeight: 700,
            letterSpacing: "2px",
            textTransform: "uppercase",
          }}
        >
          Desliza para desarmar
        </span>
      </div>

      {/* Keyframe for wheel dot — injected once via style tag */}
      <style>{`
        @keyframes vml-wheel {
          0%   { opacity: 0;   transform: translateY(0); }
          25%  { opacity: 1; }
          75%  { opacity: 0.2; transform: translateY(8px); }
          100% { opacity: 0;   transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
