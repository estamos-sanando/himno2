import { useRef, useEffect, useCallback } from "react";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";

interface ScrollVideoLogoProps {
  onStart: () => void;
  /** Live MediaPipe hand landmarks — pinch gesture controls shield assembly */
  handLandmarks?: HandLandmarkerResult | null;
}

// Pinch distance thresholds (normalised MediaPipe space)
// Closed fist / pinch → PINCH_CLOSED  → progress 0 → video at t=0  (shield assembled)
// Spread fingers       → PINCH_OPEN   → progress 1 → video at end  (shield disassembled)
const PINCH_CLOSED = 0.04;
const PINCH_OPEN   = 0.22;

export default function ScrollVideoLogo({ onStart, handLandmarks }: ScrollVideoLogoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef     = useRef<HTMLVideoElement>(null);

  const targetProg   = useRef(0);   // 0 = assembled (t=0), 1 = disassembled (t=end)
  const currentProg  = useRef(0);
  const lastSeekT    = useRef(-1);
  const lastSeekTime = useRef(0);
  const rafId        = useRef(0);
  const durRef       = useRef(0);
  const videoReady   = useRef(false);
  const primedRef    = useRef(false);

  // Always keep latest landmarks accessible in the rAF loop without closure stale value
  const landmarksRef = useRef<HandLandmarkerResult | null>(null);
  useEffect(() => {
    landmarksRef.current = handLandmarks ?? null;
  }, [handLandmarks]);

  // ── VIDEO REVEAL ─────────────────────────────────────────────────────────
  const revealVideo = useCallback(() => {
    videoReady.current = true;
    if (videoRef.current) videoRef.current.style.opacity = "1";
  }, []);

  // Prime the hardware decoder on first hand detection
  const prime = useCallback(() => {
    if (primedRef.current) return;
    primedRef.current = true;
    revealVideo();
    const v = videoRef.current;
    if (v) v.play().then(() => setTimeout(() => v.pause(), 40)).catch(() => {});
  }, [revealVideo]);

  // ── VIDEO INIT ───────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const setup = () => {
      const dur = video.duration;
      if (!dur || !isFinite(dur) || dur <= 0) return;
      durRef.current = dur;
      // Start at t=0 → shield assembled
      video.addEventListener("seeked", revealVideo, { once: true });
      video.currentTime = 0.01;
      lastSeekT.current = 0.01;
    };

    video.addEventListener("loadeddata",     setup, { once: true });
    video.addEventListener("loadedmetadata", setup, { once: true });
    if (video.readyState >= 2) setup();
    else if (video.readyState >= 1) setup();

    return () => {
      video.removeEventListener("loadeddata",     setup);
      video.removeEventListener("loadedmetadata", setup);
    };
  }, [revealVideo]);

  // ── rAF LOOP — pinch gesture is the ONLY input ───────────────────────────
  useEffect(() => {
    const tick = () => {
      const lmResult = landmarksRef.current;
      let pinchActive = false;

      if (lmResult && lmResult.landmarks && lmResult.landmarks.length > 0) {
        let bestPinch: number | null = null;

        for (const marks of lmResult.landmarks) {
          if (marks.length < 21) continue;
          const thumb = marks[4]; // THUMB_TIP
          const index = marks[8]; // INDEX_FINGER_TIP
          const dx = thumb.x - index.x;
          const dy = thumb.y - index.y;
          const dz = (thumb.z ?? 0) - (index.z ?? 0);
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (bestPinch === null || dist < bestPinch) bestPinch = dist;
        }

        if (bestPinch !== null) {
          // Map distance → normalised progress [0..1]
          // 0 = closed pinch = assembled (t=0)
          // 1 = open spread  = disassembled (t=end)
          const normalised = Math.max(0, Math.min(1,
            (bestPinch - PINCH_CLOSED) / (PINCH_OPEN - PINCH_CLOSED)
          ));
          targetProg.current = normalised;
          pinchActive = true;
          prime(); // warm decoder on first detection
        }
      }

      // Dynamic duration poll
      const v = videoRef.current;
      if (v && (!durRef.current || !isFinite(durRef.current) || durRef.current <= 0)) {
        const d = v.duration;
        if (d && !isNaN(d) && isFinite(d) && d > 0) {
          durRef.current = d;
          v.currentTime = 0.01;
          lastSeekT.current = 0.01;
          revealVideo();
        }
      }

      const diff = targetProg.current - currentProg.current;
      if (Math.abs(diff) > 0.0001) {
        // Tighter lerp when pinch active for crisp real-time response
        currentProg.current += diff * (pinchActive ? 0.20 : 0.09);
        currentProg.current  = Math.max(0, Math.min(1, currentProg.current));
        const p = currentProg.current;

        // Seek video: p=0 → t=0 (assembled), p=1 → t=end (disassembled)
        const dur = durRef.current;
        const now = performance.now();
        const seekThrottle = pinchActive ? 16 : 30; // 60fps seeks when hand active
        if (dur && isFinite(dur) && dur > 0 && v && !v.seeking && now - lastSeekTime.current > seekThrottle) {
          const target  = Math.max(0.01, Math.min(dur - 0.04, p * dur));
          if (Math.abs(target - lastSeekT.current) > 0.005) {
            v.currentTime    = target;
            lastSeekT.current = target;
            lastSeekTime.current = now;
          }
        }
      }

      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [revealVideo, prime]);

  // ── RENDER ───────────────────────────────────────────────────────────────
  const handVisible = !!(handLandmarks && handLandmarks.landmarks && handLandmarks.landmarks.length > 0);

  return (
    <div
      ref={containerRef}
      style={{
        position: "absolute", inset: 0, overflow: "hidden",
        userSelect: "none", WebkitUserSelect: "none",
        background: "#000", // pure black so mix-blend-mode:screen works perfectly
      }}
    >
      {/* Video del escudo — mix-blend-mode:screen elimina el fondo negro de TouchDesigner */}
      <video
        ref={videoRef}
        src="/logo.mp4"
        muted
        playsInline
        preload="auto"
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "contain", objectPosition: "center",
          pointerEvents: "none", zIndex: 2, opacity: 0,
          transition: "opacity 0.6s ease",
          willChange: "transform", transform: "translateZ(0)",
          mixBlendMode: "screen",
        }}
      />

      {/* Subtle vignette to frame the shield */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none",
        background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 35%, rgba(0,0,0,0.85) 100%)",
      }} />

      {/* Hand detection status indicator (top-center) */}
      <div style={{
        position: "absolute",
        top: "clamp(20px, 3.5vh, 40px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 8,
        color: handVisible ? "rgba(116,172,223,0.9)" : "rgba(116,172,223,0.35)",
        fontSize: "clamp(10px, 1.4vw, 13px)",
        fontWeight: 700,
        letterSpacing: "2.5px",
        textTransform: "uppercase",
        textShadow: handVisible ? "0 0 16px rgba(116,172,223,0.7)" : "none",
        pointerEvents: "none",
        transition: "all 0.4s ease",
        whiteSpace: "nowrap",
      }}>
        {handVisible
          ? "✋ Mano detectada — abrí o cerrá los dedos"
          : "Mostrá la mano a la cámara"}
      </div>

      {/* Pinch visualizer — small indicator at bottom showing current pinch level */}
      <div style={{
        position: "absolute",
        bottom: "clamp(100px, 16vh, 160px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 8,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "8px",
        pointerEvents: "none",
        opacity: handVisible ? 1 : 0,
        transition: "opacity 0.4s ease",
      }}>
        <div style={{
          width: "120px",
          height: "4px",
          borderRadius: "2px",
          background: "rgba(116,172,223,0.2)",
          border: "1px solid rgba(116,172,223,0.3)",
          overflow: "hidden",
        }}>
          <div style={{
            height: "100%",
            width: `${currentProg.current * 100}%`,
            background: "linear-gradient(90deg, #74acdf, #ffffff)",
            borderRadius: "2px",
            transition: "width 0.05s linear",
          }} />
        </div>
        <span style={{
          fontSize: "9px",
          letterSpacing: "2px",
          color: "rgba(116,172,223,0.6)",
          textTransform: "uppercase",
          fontWeight: 700,
        }}>
          🤏 ← cerrar · abrir → ✋
        </span>
      </div>

      {/* Ingresar button */}
      <button
        onClick={onStart}
        style={{
          position: "absolute",
          bottom: "clamp(30px, 7vh, 70px)",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 10,
          background: "linear-gradient(135deg, rgba(116,172,223,0.15) 0%, rgba(116,172,223,0.05) 100%)",
          border: "1px solid rgba(116,172,223,0.5)",
          borderRadius: "30px",
          padding: "14px 48px",
          color: "#ffffff",
          fontFamily: "inherit",
          fontSize: "clamp(12px, 1.6vw, 14px)",
          fontWeight: 700,
          letterSpacing: "3px",
          textTransform: "uppercase",
          cursor: "pointer",
          boxShadow: "0 0 20px rgba(116,172,223,0.2), inset 0 0 10px rgba(116,172,223,0.1)",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
          animation: "svl-btn-fadein 1.2s ease forwards, svl-btn-pulse 2.5s infinite alternate",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "linear-gradient(135deg, rgba(116,172,223,0.3) 0%, rgba(116,172,223,0.1) 100%)";
          e.currentTarget.style.border = "1px solid rgba(116,172,223,0.8)";
          e.currentTarget.style.boxShadow = "0 0 30px rgba(116,172,223,0.5), inset 0 0 15px rgba(116,172,223,0.2)";
          e.currentTarget.style.transform = "translateX(-50%) scale(1.05)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "linear-gradient(135deg, rgba(116,172,223,0.15) 0%, rgba(116,172,223,0.05) 100%)";
          e.currentTarget.style.border = "1px solid rgba(116,172,223,0.5)";
          e.currentTarget.style.boxShadow = "0 0 20px rgba(116,172,223,0.2), inset 0 0 10px rgba(116,172,223,0.1)";
          e.currentTarget.style.transform = "translateX(-50%) scale(1)";
        }}
      >
        Ingresar
      </button>

      <style>{`
        @keyframes svl-btn-fadein {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to   { opacity: 1; transform: translate(-50%, 0); }
        }
        @keyframes svl-btn-pulse {
          0%   { box-shadow: 0 0 20px rgba(116,172,223,0.2), inset 0 0 10px rgba(116,172,223,0.1); }
          100% { box-shadow: 0 0 30px rgba(116,172,223,0.4), inset 0 0 15px rgba(116,172,223,0.2); }
        }
      `}</style>
    </div>
  );
}
