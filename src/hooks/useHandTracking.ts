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
      // 480x360 = 57% fewer pixels than 640x480 for MediaPipe to process each frame.
      // Still sharp enough for landmark detection; improves fps on mid-range GPUs.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width:  { ideal: 480, max: 640 },
          height: { ideal: 360, max: 480 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: "user",
        },
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

    // Throttle hand detection to 25 FPS (every 40ms).
    // 25fps gives MediaPipe more CPU budget per frame vs 30fps
    // while still being imperceptible to the user.
    if (now - lastDetectionTimeRef.current >= 40) {
      result = lm.detectForVideo(video, now);
      lastResultRef.current = result;
      lastDetectionTimeRef.current = now;
    }

    let rightHand = { detected: false, y: 0.5, isOpen: false, isClosed: false };
    let leftHand  = { detected: false, y: 0.5, isOpen: false, isClosed: false };

    if (result && result.handednesses && result.landmarks) {
      for (let i = 0; i < result.handednesses.length; i++) {
        const category = result.handednesses[i][0].categoryName;
        const marks    = result.landmarks[i];
        const wristY   = marks[0].y;

        // Gesture classification with squared-distance (no sqrt needed)
        let isOpen = false;
        let isClosed = false;
        if (marks && marks.length >= 21) {
          const wx = marks[0].x;
          const wy = marks[0].y;
          const dist2 = (ax: number, ay: number, bx: number, by: number) =>
            (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

          const isIndexExtended  = dist2(marks[8].x,  marks[8].y,  wx, wy) > dist2(marks[6].x,  marks[6].y,  wx, wy);
          const isMiddleExtended = dist2(marks[12].x, marks[12].y, wx, wy) > dist2(marks[10].x, marks[10].y, wx, wy);
          const isRingExtended   = dist2(marks[16].x, marks[16].y, wx, wy) > dist2(marks[14].x, marks[14].y, wx, wy);
          const isPinkyExtended  = dist2(marks[20].x, marks[20].y, wx, wy) > dist2(marks[18].x, marks[18].y, wx, wy);
          isOpen   = isIndexExtended && isMiddleExtended && isRingExtended && isPinkyExtended;
          isClosed = !isIndexExtended && !isMiddleExtended && !isRingExtended && !isPinkyExtended;
        }

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
