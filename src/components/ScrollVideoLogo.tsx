import { useRef, useEffect, useCallback, useState } from "react";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";

interface ScrollVideoLogoProps {
  onStart: () => void;
  /** Live MediaPipe hand landmarks — pinch gesture controls shield assembly */
  handLandmarks?: HandLandmarkerResult | null;
  webcamVideoRef?: React.RefObject<HTMLVideoElement | null>;
}

// Pinch distance thresholds (normalised MediaPipe space)
// Closed fist / pinch → PINCH_CLOSED  → progress 0 → video at t=0  (shield assembled)
// Spread fingers       → PINCH_OPEN   → progress 1 → video at end  (shield disassembled)
const PINCH_CLOSED = 0.04;
const PINCH_OPEN   = 0.22;

export default function ScrollVideoLogo({ onStart, handLandmarks, webcamVideoRef }: ScrollVideoLogoProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef     = useRef<HTMLVideoElement>(null);
  const webcamCanvasRef = useRef<HTMLCanvasElement>(null);

  const targetProg   = useRef(0);   // 0 = assembled (t=0), 1 = disassembled (t=end)
  const currentProg  = useRef(0);
  const lastSeekT    = useRef(-1);
  const lastSeekTime = useRef(0);
  const rafId        = useRef(0);
  const durRef       = useRef(0);
  const videoReady   = useRef(false);
  const primedRef    = useRef(false);

  const [tdConnected, setTdConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);

  // WebSocket connection to TouchDesigner with auto-reconnect
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const port = urlParams.get("tdPort") || "9980";
    const wsUrl = `ws://localhost:${port}`;
    let reconnectTimeout: number;
    let active = true;

    function connect() {
      if (!active) return;
      console.log(`Connecting to TouchDesigner WebSocket: ${wsUrl}...`);
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!active) { ws.close(); return; }
        console.log("TouchDesigner WebSocket Connected! 🔗");
        setTdConnected(true);
      };

      ws.onclose = () => {
        setTdConnected(false);
        socketRef.current = null;
        if (active) {
          reconnectTimeout = window.setTimeout(connect, 3000);
        }
      };

      ws.onerror = () => {
        // ws.close() triggers onclose
      };
    }

    connect();

    return () => {
      active = false;
      clearTimeout(reconnectTimeout);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

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

      // Draw floating webcam preview
      const webcamCanvas = webcamCanvasRef.current;
      const webcamVideo = webcamVideoRef?.current;
      if (webcamCanvas && webcamVideo && webcamVideo.readyState >= 2) {
        const ctx = webcamCanvas.getContext("2d");
        if (ctx) {
          if (webcamCanvas.width !== 320) {
            webcamCanvas.width = 320;
            webcamCanvas.height = 240;
          }
          ctx.save();
          ctx.scale(-1, 1);
          ctx.translate(-webcamCanvas.width, 0);
          ctx.drawImage(webcamVideo, 0, 0, webcamCanvas.width, webcamCanvas.height);
          ctx.restore();

          // Draw skeleton & dots
          if (lmResult && lmResult.landmarks && lmResult.landmarks.length > 0) {
            const mx = (x: number) => (1 - x) * webcamCanvas.width;
            const my = (y: number) => y * webcamCanvas.height;
            const CONNECTIONS = [
              [0,1],[1,2],[2,3],[3,4],
              [0,5],[5,6],[6,7],[7,8],
              [5,9],[9,10],[10,11],[11,12],
              [9,13],[13,14],[14,15],[15,16],
              [13,17],[0,17],[17,18],[18,19],[19,20],
            ] as const;

            for (const marks of lmResult.landmarks) {
              if (marks.length < 21) continue;

              // Connections
              ctx.lineWidth = 1.5;
              ctx.strokeStyle = "#74ACDF"; // Celestial Blue
              ctx.globalAlpha = 0.8;
              for (const [a, b] of CONNECTIONS) {
                ctx.beginPath();
                ctx.moveTo(mx(marks[a].x), my(marks[a].y));
                ctx.lineTo(mx(marks[b].x), my(marks[b].y));
                ctx.stroke();
              }

              // Joints
              ctx.globalAlpha = 1.0;
              for (let i = 0; i < marks.length; i++) {
                const pt = marks[i];
                ctx.beginPath();
                ctx.arc(mx(pt.x), my(pt.y), 3, 0, Math.PI * 2);
                ctx.fillStyle = "#ffffff";
                ctx.fill();
                ctx.strokeStyle = "#74ACDF";
                ctx.lineWidth = 1;
                ctx.stroke();
              }
            }
          }
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

      // Send WebSocket update to TouchDesigner if connected
      const ws = socketRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          event: "pinch",
          progress: currentProg.current,
          handVisible: pinchActive
        }));
      }

      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId.current);
  }, [revealVideo, prime, webcamVideoRef]);

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
          pointerEvents: "none", zIndex: 3, opacity: 0,
          transition: "opacity 0.6s ease",
          willChange: "transform", transform: "translateZ(0)",
          mixBlendMode: "screen",
        }}
      />

      {/* Subtle vignette to frame the shield */}
      <div style={{
        position: "absolute", inset: 0, zIndex: 4, pointerEvents: "none",
        background: "radial-gradient(ellipse 80% 80% at 50% 50%, transparent 35%, rgba(0,0,0,0.85) 100%)",
      }} />

      {/* TouchDesigner Connection Status Indicator (top-right) */}
      <div style={{
        position: "absolute",
        top: "clamp(20px, 3.5vh, 40px)",
        right: "clamp(20px, 3.5vw, 40px)",
        zIndex: 8,
        display: "flex",
        alignItems: "center",
        gap: "8px",
        background: "rgba(0, 0, 0, 0.4)",
        backdropFilter: "blur(8px)",
        padding: "8px 16px",
        borderRadius: "20px",
        border: "1px solid rgba(116, 172, 223, 0.25)",
        boxShadow: "0 4px 12px rgba(0, 0, 0, 0.5)",
        pointerEvents: "none",
        transition: "border-color 0.4s ease",
      }}>
        <div style={{
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          background: tdConnected ? "#74acdf" : "#ffffff",
          boxShadow: tdConnected 
            ? "0 0 8px #74acdf, 0 0 16px #74acdf" 
            : "0 0 4px rgba(255, 255, 255, 0.4)",
          opacity: tdConnected ? 1 : 0.4,
          animation: tdConnected ? "none" : "svl-dot-blink 1.5s infinite alternate",
        }} />
        <span style={{
          color: tdConnected ? "#ffffff" : "rgba(255, 255, 255, 0.5)",
          fontSize: "11px",
          fontWeight: 700,
          letterSpacing: "1.5px",
          textTransform: "uppercase",
          fontFamily: "inherit",
          textShadow: tdConnected ? "0 0 8px rgba(116, 172, 223, 0.3)" : "none",
          transition: "color 0.4s ease",
        }}>
          {tdConnected ? "TD Link: Conectado" : "TD Link: Desconectado"}
        </span>
      </div>

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

      {/* Mini webcam preview (bottom-right corner) */}
      {webcamVideoRef && (
        <div style={{
          position: "absolute",
          bottom: "clamp(100px, 14vh, 140px)",
          right: "clamp(16px, 2.5vw, 32px)",
          width: "clamp(120px, 16vw, 200px)",
          aspectRatio: "4/3",
          borderRadius: "12px",
          border: `1px solid ${handVisible ? "rgba(116,172,223,0.7)" : "rgba(116,172,223,0.4)"}`,
          boxShadow: "0 0 20px rgba(116,172,223,0.15), 0 4px 24px rgba(0,0,0,0.6)",
          opacity: handVisible ? 0.92 : 0.75,
          zIndex: 10,
          background: "#0a0f1a",
          overflow: "hidden",
          transition: "border-color 0.4s ease, opacity 0.4s ease",
        }}>
          <canvas
            ref={webcamCanvasRef}
            style={{
              width: "100%",
              height: "100%",
              display: "block",
            }}
          />
          <div style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "4px 8px",
            color: handVisible ? "#74acdf" : "rgba(255,255,255,0.4)",
            fontSize: "9px",
            fontWeight: 700,
            letterSpacing: "1.5px",
            textTransform: "uppercase",
            textAlign: "center",
            background: "rgba(0, 0, 0, 0.5)",
            backdropFilter: "blur(4px)",
            transition: "color 0.4s ease",
          }}>
            {handVisible ? "✋ Mano detectada" : "Cámara"}
          </div>
        </div>
      )}

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
        @keyframes svl-dot-blink {
          0%   { opacity: 0.15; }
          100% { opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}
