import { useEffect, useRef, useCallback } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  type HandLandmarkerResult,
} from "@mediapipe/tasks-vision";

/**
 * Hand convention (mirror display):
 *   rightHand → PHYSICAL right hand → appears on SCREEN-LEFT  → controls VOLUME
 *   leftHand  → PHYSICAL left hand  → appears on SCREEN-RIGHT → controls TEMPO
 *
 * Note: MediaPipe receives raw (unflipped) video from the webcam.
 * We flip the VIDEO at draw time (ctx.scale -1,1), but MediaPipe still
 * processes the original frame.  After testing, "Right" from MediaPipe
 * corresponds to the physical right hand.
 */
export interface HandGesture {
  /** Physical right hand = screen-LEFT → Volume */
  rightHand: { detected: boolean; y: number; isOpen: boolean; isClosed: boolean };
  /** Physical left hand = screen-RIGHT → Tempo */
  leftHand:  { detected: boolean; y: number; isOpen: boolean; isClosed: boolean };
  landmarks: HandLandmarkerResult | null;
}

type OnGesture = (g: HandGesture) => void;

export function useHandTracking(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onGesture: OnGesture,
  enabled: boolean
) {
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const animFrameRef  = useRef<number>(0);
  const lastDetectionTimeRef = useRef<number>(0);
  const lastResultRef = useRef<HandLandmarkerResult | null>(null);

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
      });
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return; // Safe to ignore: play request was interrupted by cleanup
      }
      console.error("Camera error:", err);
    }
  }, [videoRef]);

  const initLandmarker = useCallback(async () => {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    landmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
        delegate: "GPU",
      },
      runningMode: "VIDEO",
      numHands: 2,
    });
  }, []);

  const runLoop = useCallback(() => {
    const video = videoRef.current;
    const lm    = landmarkerRef.current;
    if (!video || !lm || video.readyState < 2) {
      animFrameRef.current = requestAnimationFrame(runLoop);
      return;
    }

    const now = performance.now();
    let result = lastResultRef.current;

    // Throttle hand detection to ~30 FPS (every 33ms) to save CPU/GPU cycles and keep it extremely fluid
    if (now - lastDetectionTimeRef.current >= 33) {
      result = lm.detectForVideo(video, now);
      lastResultRef.current = result;
      lastDetectionTimeRef.current = now;
    }

    let rightHand = { detected: false, y: 0.5, isOpen: false, isClosed: false };
    let leftHand  = { detected: false, y: 0.5, isOpen: false, isClosed: false };

    if (result && result.handednesses && result.landmarks) {
      for (let i = 0; i < result.handednesses.length; i++) {
        const category = result.handednesses[i][0].categoryName;
        const wristY   = result.landmarks[i][0].y;
        const marks    = result.landmarks[i];

        // Check if hand is open or closed (fingers extended relative to wrist)
        let isOpen = false;
        let isClosed = false;
        if (marks && marks.length >= 21) {
          const wrist = marks[0];
          const dist = (p1: any, p2: any) => Math.hypot(p1.x - p2.x, p1.y - p2.y);
          const isIndexExtended  = dist(marks[8], wrist)  > dist(marks[6], wrist);
          const isMiddleExtended = dist(marks[12], wrist) > dist(marks[10], wrist);
          const isRingExtended   = dist(marks[16], wrist)   > dist(marks[14], wrist);
          const isPinkyExtended  = dist(marks[20], wrist)  > dist(marks[18], wrist);
          isOpen = isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended;
          isClosed = !isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended;
        }

        // "Right" from MediaPipe = user's physical right hand (screen-LEFT in mirror)
        if (category === "Right") {
          rightHand = { detected: true, y: wristY, isOpen, isClosed };
        } else {
          leftHand  = { detected: true, y: wristY, isOpen, isClosed };
        }
      }
    }

    onGesture({ rightHand, leftHand, landmarks: result });
    animFrameRef.current = requestAnimationFrame(runLoop);
  }, [videoRef, onGesture]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      await startCamera();
      await initLandmarker();
      if (!cancelled) animFrameRef.current = requestAnimationFrame(runLoop);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
        videoRef.current.srcObject = null;
      }
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, [enabled, startCamera, initLandmarker, runLoop]);
}
