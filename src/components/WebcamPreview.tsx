import { useRef, useEffect } from "react";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import { CHROMATIC } from "../hooks/useChordSynth";

interface Props {
  landmarkerResult: HandLandmarkerResult | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  getLevel: () => number;
  mode?: "conductor" | "instrument";
  snap?: boolean;
}

// Cyan = screen-LEFT hand  (physical right) → Volume / Notes
// Purple = screen-RIGHT hand (physical left) → Tempo / Chord Qualities
const SCREEN_LEFT_COLOR  = "#74ACDF"; // Celestial Blue
const SCREEN_RIGHT_COLOR = "#F6B800"; // Sol de Mayo Gold
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

const CHORD_QUALITIES = ["maj", "min", "7", "m7", "maj7", "dim"];

export default function WebcamPreview({ 
  landmarkerResult, 
  videoRef, 
  getLevel,
  mode = "conductor",
  snap = true
}: Props) {
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

      // Standard coordinate space of 640x480 for consistent math
      const vw = 640;
      const vh = 480;
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

      const level = getLevel();
      const pulseFactor = 1 + level * 0.35; // Grows up to 1.35x based on audio volume

      // ── Hand landmark processing for collisions ──
      let leftFingerPos: { x: number; y: number } | null = null;
      let rightFingerPos: { x: number; y: number } | null = null;

      const result = landmarksRef.current;
      const mx = (x: number) => (1 - x) * vw;
      const my = (y: number) => y * vh;

      if (result?.landmarks && result.handednesses) {
        for (let h = 0; h < result.landmarks.length; h++) {
          const marks = result.landmarks[h];
          if (!marks || marks.length < 21) continue;
          
          const tip = marks[8]; // INDEX_FINGER_TIP
          const fx = mx(tip.x);
          const fy = my(tip.y);

          // Classify by screen position (left half vs right half)
          if (fx < vw / 2) {
            leftFingerPos = { x: fx, y: fy };
          } else {
            rightFingerPos = { x: fx, y: fy };
          }
        }
      }

      // ── Draw wheels if in instrument mode ──
      let activeLeftIdx: number | "OFF" | null = null;
      let activeRightIdx: number | "OFF" | null = null;

      if (mode === "instrument") {
        const cxL = vw * 0.25; // 160
        const cyL = vh * 0.5;  // 240
        const cxR = vw * 0.75; // 480
        const cyR = vh * 0.5;  // 240
        const R = 125;
        const rInner = 44;

        // 1. Check collisions for Note Wheel (Left)
        if (leftFingerPos) {
          const dist = Math.hypot(leftFingerPos.x - cxL, leftFingerPos.y - cyL);
          if (dist <= R) {
            if (dist < rInner) {
              activeLeftIdx = "OFF";
            } else {
              const angle = Math.atan2(leftFingerPos.y - cyL, leftFingerPos.x - cxL);
              // Center C at 12 o'clock (add Math.PI / 12 for half slice offset)
              const angNorm = (angle + Math.PI / 2 + Math.PI / 12 + 2 * Math.PI) % (2 * Math.PI);
              activeLeftIdx = Math.floor(angNorm / (Math.PI / 6));
            }
          }
        }

        // 2. Check collisions for Chord Wheel (Right)
        if (rightFingerPos) {
          const dist = Math.hypot(rightFingerPos.x - cxR, rightFingerPos.y - cyR);
          if (dist <= R) {
            if (dist < rInner) {
              activeRightIdx = "OFF";
            } else {
              const angle = Math.atan2(rightFingerPos.y - cyR, rightFingerPos.x - cxR);
              // Center maj at 12 o'clock (add Math.PI / 6 for half slice offset)
              const angNorm = (angle + Math.PI / 2 + Math.PI / 6 + 2 * Math.PI) % (2 * Math.PI);
              activeRightIdx = Math.floor(angNorm / (Math.PI / 3));
            }
          }
        }

        // ── Draw Note Wheel (Left) ──
        ctx.save();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1.5;

        for (let i = 0; i < 12; i++) {
          const sliceAngle = Math.PI / 6;
          const startAngle = -Math.PI / 2 + i * sliceAngle - sliceAngle / 2;
          const endAngle = startAngle + sliceAngle;
          const isActive = activeLeftIdx === i;

          ctx.beginPath();
          ctx.arc(cxL, cyL, R, startAngle, endAngle);
          ctx.arc(cxL, cyL, rInner, endAngle, startAngle, true);
          ctx.closePath();

          if (isActive) {
            ctx.fillStyle = "rgba(116, 172, 223, 0.55)";
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.fillStyle = "rgba(20, 20, 20, 0.45)";
            ctx.fill();
            ctx.stroke();
          }

          // Text labels
          const textAngle = startAngle + sliceAngle / 2;
          const textDist = rInner + (R - rInner) * 0.6;
          const tx = cxL + Math.cos(textAngle) * textDist;
          const ty = cyL + Math.sin(textAngle) * textDist;

          ctx.fillStyle = isActive ? "#ffffff" : "rgba(255, 255, 255, 0.75)";
          ctx.font = isActive ? "bold 15px Outfit, Inter, sans-serif" : "bold 12px Outfit, Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(CHROMATIC[i], tx, ty);
        }

        // Draw Left Center (OFF)
        ctx.beginPath();
        ctx.arc(cxL, cyL, rInner, 0, Math.PI * 2);
        ctx.fillStyle = activeLeftIdx === "OFF" ? "rgba(116, 172, 223, 0.65)" : "rgba(10, 10, 10, 0.8)";
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px Outfit, Inter, sans-serif";
        ctx.fillText("OFF", cxL, cyL);
        ctx.restore();

        // ── Draw Chord Wheel (Right) ──
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 1.5;

        for (let i = 0; i < 6; i++) {
          const sliceAngle = Math.PI / 3;
          const startAngle = -Math.PI / 2 + i * sliceAngle - sliceAngle / 2;
          const endAngle = startAngle + sliceAngle;
          const isActive = activeRightIdx === i;

          ctx.beginPath();
          ctx.arc(cxR, cyR, R, startAngle, endAngle);
          ctx.arc(cxR, cyR, rInner, endAngle, startAngle, true);
          ctx.closePath();

          if (isActive) {
            ctx.fillStyle = "rgba(246, 184, 0, 0.55)";
            ctx.fill();
            ctx.stroke();
          } else {
            ctx.fillStyle = "rgba(20, 20, 20, 0.45)";
            ctx.fill();
            ctx.stroke();
          }

          // Text labels
          const textAngle = startAngle + sliceAngle / 2;
          const textDist = rInner + (R - rInner) * 0.6;
          const tx = cxR + Math.cos(textAngle) * textDist;
          const ty = cyR + Math.sin(textAngle) * textDist;

          ctx.fillStyle = isActive ? "#ffffff" : "rgba(255, 255, 255, 0.75)";
          ctx.font = isActive ? "bold 14px Outfit, Inter, sans-serif" : "bold 11px Outfit, Inter, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(CHORD_QUALITIES[i], tx, ty);
        }

        // Draw Right Center (OFF)
        ctx.beginPath();
        ctx.arc(cxR, cyR, rInner, 0, Math.PI * 2);
        ctx.fillStyle = activeRightIdx === "OFF" ? "rgba(246, 184, 0, 0.65)" : "rgba(10, 10, 10, 0.8)";
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px Outfit, Inter, sans-serif";
        ctx.fillText("OFF", cxR, cyR);
        ctx.restore();

        // ── Draw snap lines & indicators ──
        if (leftFingerPos && activeLeftIdx !== null) {
          ctx.save();
          let targetX = leftFingerPos.x;
          let targetY = leftFingerPos.y;

          if (snap && typeof activeLeftIdx === "number") {
            const sliceAngle = Math.PI / 6;
            const textAngle = -Math.PI / 2 + activeLeftIdx * sliceAngle;
            const textDist = rInner + (R - rInner) * 0.6;
            targetX = cxL + Math.cos(textAngle) * textDist;
            targetY = cyL + Math.sin(textAngle) * textDist;
          } else if (activeLeftIdx === "OFF") {
            targetX = cxL;
            targetY = cyL;
          }

          // Connecting line
          ctx.strokeStyle = "rgba(116, 172, 223, 0.7)";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(cxL, cyL);
          ctx.lineTo(targetX, targetY);
          ctx.stroke();

          // Target cursor
          ctx.beginPath();
          ctx.arc(targetX, targetY, 8 * pulseFactor, 0, Math.PI * 2);
          ctx.fillStyle = "#74ACDF";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }

        if (rightFingerPos && activeRightIdx !== null) {
          ctx.save();
          let targetX = rightFingerPos.x;
          let targetY = rightFingerPos.y;

          if (snap && typeof activeRightIdx === "number") {
            const sliceAngle = Math.PI / 3;
            const textAngle = -Math.PI / 2 + activeRightIdx * sliceAngle;
            const textDist = rInner + (R - rInner) * 0.6;
            targetX = cxR + Math.cos(textAngle) * textDist;
            targetY = cyR + Math.sin(textAngle) * textDist;
          } else if (activeRightIdx === "OFF") {
            targetX = cxR;
            targetY = cyR;
          }

          // Connecting line
          ctx.strokeStyle = "rgba(246, 184, 0, 0.7)";
          ctx.lineWidth = 2.5;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(cxR, cyR);
          ctx.lineTo(targetX, targetY);
          ctx.stroke();

          // Target cursor
          ctx.beginPath();
          ctx.arc(targetX, targetY, 8 * pulseFactor, 0, Math.PI * 2);
          ctx.fillStyle = "#F6B800";
          ctx.strokeStyle = "#ffffff";
          ctx.lineWidth = 2;
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }
      }

      // ── Draw landmarks & Skeleton skeleton ──
      if (result?.landmarks && result.handednesses) {
        const { landmarks, handednesses } = result;
        for (let h = 0; h < landmarks.length; h++) {
          const category    = handednesses[h]?.[0]?.categoryName;
          const marks       = landmarks[h];
          const isPhysLeft = category === "Left";
          
          // Color based on role: Note Left (Celeste) or Chord Right (Gold)
          // In mirrored display: Physical left hand is screen-RIGHT (Gold), Physical right hand is screen-LEFT (Celeste)
          const color = isPhysLeft ? SCREEN_LEFT_COLOR : SCREEN_RIGHT_COLOR;

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

          // Baton trail (only in conductor mode for screen-RIGHT hand)
          if (mode === "conductor" && !isPhysLeft) {
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
      }

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [videoRef, mode, snap]);

  return (
    <div className="webcam-wrapper">
      <video ref={videoRef} autoPlay playsInline muted style={{ display: "none" }} />
      <canvas ref={canvasRef} className="webcam-canvas" />
      {mode === "conductor" ? (
        <div className="webcam-legend">
          <span className="legend-dot" style={{ background: SCREEN_LEFT_COLOR }} />
          <span>← Volumen (sube/baja)</span>
          <span className="legend-dot" style={{ background: SCREEN_RIGHT_COLOR }} />
          <span>Tempo (sube/baja) →</span>
        </div>
      ) : (
        <div className="webcam-legend">
          <span className="legend-dot" style={{ background: SCREEN_LEFT_COLOR }} />
          <span>← Notas (Rueda Izq)</span>
          <span className="legend-dot" style={{ background: SCREEN_RIGHT_COLOR }} />
          <span>Acordes (Rueda Der) →</span>
        </div>
      )}
    </div>
  );
}

