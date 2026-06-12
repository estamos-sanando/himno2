import { useRef, useEffect, useCallback } from "react";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";

interface ScrollVideoLogoProps {
  onStart: () => void;
  /** Live MediaPipe hand landmarks — pinch gesture controls shield assembly */
  handLandmarks?: HandLandmarkerResult | null;
  /**
   * The hidden video element that feeds MediaPipe during intro.
   * We reuse it here to show a small live webcam preview in the corner.
   */
  webcamVideoRef?: React.RefObject<HTMLVideoElement | null>;
}

/**
 * Video direction (confirmed from TouchDesigner output):
 *   t = 0        → escudo DESARMADO (piezas separadas)
 *   t = duration → escudo ARMADO (completo)
 *
 * Therefore INVERT = true:
 *   progress 0  → t=end  → shield ASSEMBLED (closed pinch / start state)
 *   progress 1  → t=0    → shield DISASSEMBLED (open fingers)
 */
const INVERT = true;

// Pinch distance thresholds (normalised MediaPipe space ~0..1)
const PINCH_CLOSED = 0.04; // fingers touching  → progress 0 → assembled
const PINCH_OPEN   = 0.22; // fingers spread     → progress 1 → disassembled

export default function ScrollVideoLogo({ onStart, handLandmarks, webcamVideoRef }: ScrollVideoLogoProps) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const webcamCanvasRef = useRef<HTMLCanvasElement>(null);

  const targetProg   = useRef(0);   // 0 = assembled, 1 = disassembled
  const currentProg  = useRef(0);
  const lastSeekT    = useRef(-1);
  const lastSeekTime = useRef(0);
  const rafId        = useRef(0);
  const durRef       = useRef(0);
  const videoReady   = useRef(false);
  const primedRef    = useRef(false);

  // Pinch bar width for the UI indicator (0-100)
  const pinchBarRef  = useRef<HTMLDivElement>(null);

  // Mirror latest landmarks into a ref for the rAF loop
  const landmarksRef = useRef<HandLandmarkerResult | null>(null);
  useEffect(() => {
    landmarksRef.current = handLandmarks ?? null;
  }, [handLandmarks]);

  // ── VIDEO REVEAL ─────────────────────────────────────────────────────────
  const revealVideo = useCallback(() => {
    videoReady.current = true;
    if (videoRef.current) videoRef.current.style.opacity = "1";
  }, []);

  /** Prime the hardware decoder so seeks are instant */
  const prime = useCallback(() => {
    if (primedRef.current) return;
    primedRef.current = true;
    const v = videoRef.current;
    if (v) {
      v.play()
        .then(() => setTimeout(() => { v.pause(); revealVideo(); }, 80))
        .catch(() => revealVideo());
    }
  }, [revealVideo]);

  // ── VIDEO INIT ───────────────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const setup = () => {
      const dur = video.duration;
      if (!dur || !isFinite(dur) || dur <= 0) return;
      durRef.current = dur;

      // INVERT=true → start near the END (assembled shield)
      const initT = Math.max(0.01, dur - 0.08);
      video.addEventListener("seeked", revealVideo, { once: true });
      video.currentTime = initT;
      lastSeekT.current = initT;
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

  // ── WEBCAM MIRROR → CANVAS ───────────────────────────────────────────────
  // Draw the intro webcam feed into a small canvas for the mini-preview
  useEffect(() => {
    const canvas = webcamCanvasRef.current;
    if (!canvas || !webcamVideoRef) return;

    let active = true;
    const drawFrame = () => {
      if (!active) return;
      const vid = webcamVideoRef.current;
      const ctx = canvas.getContext("2d");
      if (vid && ctx && vid.readyState >= 2) {
        canvas.width  = vid.videoWidth  || 320;
        canvas.height = vid.videoHeight || 240;
        // Mirror horizontally (natural mirror effect)
        ctx.save();
        ctx.scale(-1, 1);
        ctx.translate(-canvas.width, 0);
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      requestAnimationFrame(drawFrame);
    };
    requestAnimationFrame(drawFrame);

    return () => { active = false; };
  }, [webcamVideoRef]);

  // ── rAF LOOP ─────────────────────────────────────────────────────────────
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
          /**
           * pinchNorm = 0 → dedos juntos  → progress 0 → INVERT → t=end → ARMADO ✓
           * pinchNorm = 1 → dedos abiertos → progress 1 → INVERT → t=0  → DESARMADO ✓
           */
          const pinchNorm = Math.max(0, Math.min(1,
            (bestPinch - PINCH_CLOSED) / (PINCH_OPEN - PINCH_CLOSED)
          ));
          targetProg.current = pinchNorm;
          pinchActive = true;
          prime(); // warm decoder on first detection
        }
      }

      // Dynamic duration poll (for browsers that don't fire loadedmetadata before play)
      const v = videoRef.current;
      if (v && (!durRef.current || !isFinite(durRef.current) || durRef.current <= 0)) {
        const d = v.duration;
        if (d && !isNaN(d) && isFinite(d) && d > 0) {
          durRef.current = d;
          const initT = Math.max(0.01, d - 0.08);
          v.currentTime = initT;
          lastSeekT.current = initT;
          revealVideo();
        }
      }

      const diff = targetProg.current - currentProg.current;
      if (Math.abs(diff) > 0.0001) {
        currentProg.current += diff * (pinchActive ? 0.20 : 0.09);
        currentProg.current  = Math.max(0, Math.min(1, currentProg.current));
        const p = currentProg.current;

        // Update pinch bar UI
        if (pinchBarRef.current) {
          pinchBarRef.current.style.width = `${p * 100}%`;
        }

        const dur = durRef.current;
        const now = performance.now();
        const seekThrottle = pinchActive ? 16 : 30;

        if (dur && isFinite(dur) && dur > 0 && v && !v.seeking && now - lastSeekTime.current > seekThrottle) {
          // INVERT=true: p=0 → t=end (assembled), p=1 → t=0 (disassembled)
          const mapped  = Math.max(0.01, (1 - p) * dur - 0.04);
          const clamped = Math.max(0.01, Math.min(dur - 0.04, mapped));

          if (Math.abs(clamped - lastSeekT.current) > 0.005) {
            v.currentTime    = clamped;
            lastSeekT.current = clamped;
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
  const handVisible = !!(handLandmarks?.landmarks && handLandmarks.landmarks.length > 0);

  return (
    <div
      style={{
        position: "absolute", inset: 0, overflow: "hidden",
        userSelect: "none", WebkitUserSelect: "none",
        background: "#000000", // pure black required for mix-blend-mode: screen
      }}
    >
      {/* Shield video — mix-blend-mode:screen removes TouchDesigner black background */}
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
          transition: "opacity 0.8s ease",
          willChange: "transform", transform: "translateZ(0)",
          mixBlendMode: "screen",
        }}
      />

      {/* Vignette */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 3, pointerEvents: "none",
        background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 30%, rgba(0,0,0,0.7) 100%)",
      }} />

      {/* ── MINI WEBCAM PREVIEW (bottom-right corner) ───────────────────── */}
      <div style={{
        position: "absolute",
        bottom: "clamp(100px, 14vh, 140px)",
        right: "clamp(16px, 2.5vw, 32px)",
        zIndex: 10,
        width: "clamp(120px, 16vw, 200px)",
        aspectRatio: "4/3",
        borderRadius: "12px",
        overflow: "hidden",
        border: "1px solid rgba(116,172,223,0.4)",
        boxShadow: "0 0 20px rgba(116,172,223,0.15), 0 4px 24px rgba(0,0,0,0.6)",
        opacity: 0.75,
        transition: "opacity 0.3s ease, border-color 0.3s ease",
        background: "#0a0f1a",
        ...(handVisible && {
          opacity: 0.92,
          borderColor: "rgba(116,172,223,0.7)",
          boxShadow: "0 0 24px rgba(116,172,223,0.35), 0 4px 24px rgba(0,0,0,0.6)",
        }),
      }}>
        {/* Live webcam canvas */}
        <canvas
          ref={webcamCanvasRef}
          style={{
            width: "100%", height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />

        {/* Hand detection glow overlay when hand is detected */}
        {handVisible && (
          <div style={{
            position: "absolute", inset: 0,
            background: "radial-gradient(ellipse at center, rgba(116,172,223,0.08) 0%, transparent 70%)",
            pointerEvents: "none",
          }} />
        )}

        {/* Label */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          padding: "4px 8px",
          background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
          color: handVisible ? "#74acdf" : "rgba(255,255,255,0.4)",
          fontSize: "9px",
          fontWeight: 700,
          letterSpacing: "1.5px",
          textTransform: "uppercase",
          textAlign: "center",
          transition: "color 0.3s ease",
        }}>
          {handVisible ? "✋ Mano detectada" : "Cámara"}
        </div>
      </div>

      {/* ── STATUS HINT (top-center) ───────────────────────────────────── */}
      <div style={{
        position: "absolute",
        top: "clamp(18px, 3vh, 36px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 8,
        color: handVisible ? "rgba(116,172,223,0.95)" : "rgba(116,172,223,0.4)",
        fontSize: "clamp(9px, 1.3vw, 12px)",
        fontWeight: 700,
        letterSpacing: "2.5px",
        textTransform: "uppercase",
        textShadow: handVisible ? "0 0 18px rgba(116,172,223,0.8)" : "none",
        pointerEvents: "none",
        transition: "all 0.5s ease",
        whiteSpace: "nowrap",
      }}>
        {handVisible
          ? "🤏 Cerrá los dedos para armar · Abrí para desarmar"
          : "Mostrá tu mano a la cámara"}
      </div>

      {/* ── PINCH PROGRESS BAR (below status) ──────────────────────────── */}
      <div style={{
        position: "absolute",
        top: "clamp(42px, 6.5vh, 68px)",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 8,
        width: "clamp(100px, 14vw, 180px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "5px",
        opacity: handVisible ? 1 : 0,
        transition: "opacity 0.4s ease",
        pointerEvents: "none",
      }}>
        <div style={{
          width: "100%",
          height: "3px",
          borderRadius: "2px",
          background: "rgba(116,172,223,0.15)",
          border: "1px solid rgba(116,172,223,0.25)",
          overflow: "hidden",
        }}>
          <div
            ref={pinchBarRef}
            style={{
              height: "100%",
              width: "0%",
              background: "linear-gradient(90deg, #74acdf 0%, #ffffff 100%)",
              borderRadius: "2px",
              transition: "width 0.05s linear",
            }}
          />
        </div>
        <div style={{
          display: "flex", justifyContent: "space-between",
          width: "100%",
          color: "rgba(116,172,223,0.5)",
          fontSize: "8px",
          letterSpacing: "1px",
          fontWeight: 700,
        }}>
          <span>🤏 ARMADO</span>
          <span>DESARMADO ✋</span>
        </div>
      </div>

      {/* ── INGRESAR BUTTON ─────────────────────────────────────────────── */}
      <button
        onClick={onStart}
        style={{
          position: "absolute",
          bottom: "clamp(28px, 6vh, 60px)",
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
