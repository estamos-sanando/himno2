import { useRef, useEffect } from "react";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";

interface Props {
  landmarkerResult: HandLandmarkerResult | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  getLevel: () => number;
}

// Cyan = screen-LEFT hand  (physical right) → Volume
// Purple = screen-RIGHT hand (physical left) → Tempo
const SCREEN_LEFT_COLOR  = "#74ACDF"; // Celestial Blue  — Volume
const SCREEN_RIGHT_COLOR = "#F6B800"; // Sol de Mayo Gold — Tempo
const JOINT_COLOR        = "#ffffff";
const BATON_COLOR        = "rgba(255,200,0,0.9)";
const TRAIL_LEN          = 35;

const CONNECTIONS = [
  [0,1],[1,2],[2,3],[3,4],
  [0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],
  [13,17],[0,17],[17,18],[18,19],[19,20],
] as const;

export default function WebcamPreview({ landmarkerResult, videoRef, getLevel }: Props) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const trailRef     = useRef<{ x: number; y: number }[]>([]);
  const landmarksRef = useRef<HandLandmarkerResult | null>(null);
  landmarksRef.current = landmarkerResult;

  useEffect(() => {
    let rafId: number;

    const loop = () => {
      const canvas = canvasRef.current;
      const video  = videoRef.current;
      if (!canvas || !video || video.readyState < 2) {
        rafId = requestAnimationFrame(loop); return;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) { rafId = requestAnimationFrame(loop); return; }

      const vw = video.videoWidth  || 640;
      const vh = video.videoHeight || 480;
      if (canvas.width !== vw || canvas.height !== vh) {
        canvas.width  = vw;
        canvas.height = vh;
      }

      // ── Draw video (MIRRORED horizontally for selfie view) ──
      ctx.save();
      ctx.scale(-1, 1);
      ctx.translate(-vw, 0);
      ctx.drawImage(video, 0, 0, vw, vh);
      ctx.restore();

      // ── Draw landmarks ──────────────────────────────────────
      const result = landmarksRef.current;
      if (!result?.landmarks || !result.handednesses) {
        rafId = requestAnimationFrame(loop); return;
      }

      const level = getLevel();
      const pulseFactor = 1 + level * 0.35; // Grows up to 1.35x based on audio volume

      const { landmarks, handednesses } = result;
      for (let h = 0; h < landmarks.length; h++) {
        const category    = handednesses[h]?.[0]?.categoryName;
        const marks       = landmarks[h];
        // Physical left hand  → screen-LEFT  → cyan (Volume)
        // Physical right hand → screen-RIGHT → purple (Tempo)
        const isPhysLeft = category === "Left";
        const color      = isPhysLeft ? SCREEN_LEFT_COLOR : SCREEN_RIGHT_COLOR;

        // ── Helper: mirror landmark x so skeleton sits ON the mirrored body ──
        // MediaPipe gives coords in the RAW (unflipped) frame.
        // We display the video flipped, so we must also flip x: x' = 1 - x
        const mx = (x: number) => (1 - x) * vw;
        const my = (y: number) => y * vh;

        // Skeleton connections
        ctx.lineWidth   = 2;
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.85;
        for (const [a, b] of CONNECTIONS) {
          ctx.beginPath();
          ctx.moveTo(mx(marks[a].x), my(marks[a].y));
          ctx.lineTo(mx(marks[b].x), my(marks[b].y));
          ctx.stroke();
        }

        // Joints (audio-reactive pulsing)
        ctx.globalAlpha = 1;
        for (let i = 0; i < marks.length; i++) {
          const pt = marks[i];
          const radius = (i === 0 ? 6 : 4) * pulseFactor;
          ctx.beginPath();
          ctx.arc(mx(pt.x), my(pt.y), radius, 0, Math.PI * 2);
          ctx.fillStyle   = JOINT_COLOR;
          ctx.fill();
          ctx.strokeStyle = color;
          ctx.lineWidth   = 1.5;
          ctx.stroke();
        }

        // Baton trail on the screen-RIGHT hand (physical right → isPhysLeft=false)
        // → this is the TEMPO hand, feels natural to have the baton there
        if (!isPhysLeft) {
          const tip = marks[8]; // INDEX_TIP
          const tx  = mx(tip.x);
          const ty  = my(tip.y);

          trailRef.current.push({ x: tx, y: ty });
          if (trailRef.current.length > TRAIL_LEN) trailRef.current.shift();

          const trail = trailRef.current;
          ctx.lineCap = "round";
          for (let i = 1; i < trail.length; i++) {
            const a = i / trail.length;
            ctx.beginPath();
            ctx.moveTo(trail[i-1].x, trail[i-1].y);
            ctx.lineTo(trail[i].x,   trail[i].y);
            ctx.strokeStyle = BATON_COLOR;
            ctx.lineWidth   = (i / trail.length) * 6;
            ctx.globalAlpha = a * 0.9;
            ctx.stroke();
          }

          ctx.globalAlpha = 1;
          const grad = ctx.createRadialGradient(tx, ty, 0, tx, ty, 22);
          grad.addColorStop(0, "rgba(255,220,0,0.95)");
          grad.addColorStop(1, "rgba(255,200,0,0)");
          ctx.beginPath();
          ctx.arc(tx, ty, 22, 0, Math.PI * 2);
          ctx.fillStyle = grad;
          ctx.fill();
        }

        ctx.globalAlpha = 1;
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [videoRef]);

  return (
    <div className="webcam-wrapper">
      <video ref={videoRef} autoPlay playsInline muted style={{ display: "none" }} />
      <canvas ref={canvasRef} className="webcam-canvas" />
      <div className="webcam-legend">
        <span className="legend-dot" style={{ background: SCREEN_LEFT_COLOR }} />
        <span>← Volumen (sube/baja)</span>
        <span className="legend-dot" style={{ background: SCREEN_RIGHT_COLOR }} />
        <span>Tempo (sube/baja) →</span>
      </div>
    </div>
  );
}
