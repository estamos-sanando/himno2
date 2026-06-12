import { useEffect, useRef, useState } from "react";

interface MusicPainterVisualizerProps {
  deviceId: string;
  gain: number;
  noiseGate: number;
}

// Neon color palette
const NEON_PALETTE = [
  "#00E5FF", // Electric Blue
  "#9D4EDD", // Amethyst Violet
  "#00F5D4", // Emerald Green
  "#FF007F", // Neon Magenta
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
}

export default function MusicPainterVisualizer({
  deviceId,
  gain,
  noiseGate,
}: MusicPainterVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Audio Context & nodes refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // UI state
  const [audioStarted, setAudioStarted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Animation values refs
  const animationFrameRef = useRef<number>(0);
  const timeRef = useRef<number>(0);
  const transientFlashRef = useRef<number>(0);
  const smoothEnergyRef = useRef<number>(0);
  const lastTransientTimeRef = useRef<number>(0);

  // Fluid blob geometry
  const vertexCount = 24;
  const currentRadiiRef = useRef<number[]>(new Array(vertexCount).fill(100));

  // Particles
  const particlesRef = useRef<Particle[]>([]);

  // Gain & NoiseGate refs to read them instantly inside the loop
  const gainRef = useRef(gain);
  const noiseGateRef = useRef(noiseGate);
  useEffect(() => {
    gainRef.current = gain;
    noiseGateRef.current = noiseGate;
  }, [gain, noiseGate]);

  // Request audio permission and start stream
  const startAudio = async () => {
    try {
      setErrorMsg(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      const constraints = {
        audio: deviceId
          ? {
              deviceId: { exact: deviceId },
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            }
          : {
              echoCancellation: false,
              noiseSuppression: false,
              autoGainControl: false,
            },
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Initialize Web Audio API
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;

      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }

      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.4;
      analyserRef.current = analyser;

      source.connect(analyser);
      setAudioStarted(true);
      console.log("Audio input stream started successfully! 🎤");
    } catch (err: any) {
      console.error("Failed to capture audio stream:", err);
      setErrorMsg("Permiso de audio denegado o dispositivo no disponible.");
    }
  };

  // Automatically start if device changes and already started
  useEffect(() => {
    if (audioStarted && deviceId) {
      startAudio();
    }
  }, [deviceId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Main render & update loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    // Handle canvas sizing
    const resizeCanvas = () => {
      const parent = containerRef.current;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    // Initialise radii list
    const radii = currentRadiiRef.current;
    const initialRadius = Math.min(canvas.width, canvas.height) * 0.16;
    for (let i = 0; i < vertexCount; i++) {
      radii[i] = initialRadius;
    }

    // FFT arrays
    const bufferLength = 1024;
    const freqData = new Uint8Array(bufferLength / 2);
    const timeData = new Uint8Array(bufferLength);

    const draw = () => {
      animationFrameRef.current = requestAnimationFrame(draw);

      const w = canvas.width;
      const h = canvas.height;
      if (w === 0 || h === 0) return;

      timeRef.current += 0.015;
      const time = timeRef.current;

      // Fading background for neon trails
      ctx2d.globalCompositeOperation = "source-over";
      ctx2d.fillStyle = "rgba(0, 0, 0, 0.09)"; // 9% opacity trails
      ctx2d.fillRect(0, 0, w, h);

      let lowEnd = 0;
      let midHigh = 0;
      let rms = 0;
      let isGated = true;

      const analyser = analyserRef.current;
      if (analyser && audioStarted) {
        analyser.getByteFrequencyData(freqData);
        analyser.getByteTimeDomainData(timeData);

        // 1. Calculate RMS (root-mean-square) amplitude
        let rmsSum = 0;
        for (let i = 0; i < timeData.length; i++) {
          const val = (timeData[i] - 128) / 128; // normalise to -1..1
          rmsSum += val * val;
        }
        rms = Math.sqrt(rmsSum / timeData.length);

        // Read dynamic gain and noise gate values
        const currentGain = gainRef.current;
        const currentGate = noiseGateRef.current;

        // Apply noise gate threshold
        if (rms * currentGain >= currentGate) {
          isGated = false;

          // 2. Parse low-end frequency energy (40Hz - 200Hz, bins 1 to 5)
          let lowSum = 0;
          const lowBins = 5;
          for (let i = 1; i <= lowBins; i++) {
            lowSum += freqData[i];
          }
          lowEnd = (lowSum / lowBins) / 255;

          // 3. Parse mid-high frequency energy (200Hz - 2kHz, bins 6 to 43)
          let midHighSum = 0;
          let midHighBins = 0;
          for (let i = 6; i <= 43; i++) {
            midHighSum += freqData[i];
            midHighBins++;
          }
          midHigh = (midHighSum / midHighBins) / 255;

          // 4. Onset/Transient Detection
          const currentEnergy = rms * currentGain;
          const smooth = smoothEnergyRef.current;
          smoothEnergyRef.current = smooth * 0.92 + currentEnergy * 0.08;

          const now = performance.now();
          if (
            currentEnergy > smooth * 1.45 &&
            currentEnergy > 0.015 &&
            now - lastTransientTimeRef.current > 120
          ) {
            lastTransientTimeRef.current = now;
            transientFlashRef.current = 1.3; // Trigger attack flash

            // Spawn radial burst particles
            const pCount = 18 + Math.floor(midHigh * 15);
            const cx = w / 2;
            const cy = h / 2;
            const baseRad = Math.min(w, h) * 0.16;
            const scale = 1.0 + lowEnd * 0.8 + transientFlashRef.current * 0.4;
            const blobRad = baseRad * scale;

            for (let k = 0; k < pCount; k++) {
              const angle = (k / pCount) * Math.PI * 2 + Math.random() * 0.2;
              const speed = 2.0 + Math.random() * 6.5 + lowEnd * 4.0;
              const px = cx + Math.cos(angle) * blobRad;
              const py = cy + Math.sin(angle) * blobRad;

              particlesRef.current.push({
                x: px,
                y: py,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 2.0 + Math.random() * 4.0,
                color: NEON_PALETTE[Math.floor(Math.random() * NEON_PALETTE.length)],
                alpha: 1.0,
                decay: 0.012 + Math.random() * 0.018,
              });
            }
          }
        }
      }

      // Decay transient flash
      transientFlashRef.current *= 0.94;
      if (transientFlashRef.current < 0.01) transientFlashRef.current = 0;

      // Update DOM Level Meter in the sidebar (direct manipulation for performance)
      const lvlBar = document.getElementById("painter-level-bar");
      const lvlText = document.getElementById("painter-level-text");
      if (lvlBar) {
        const percent = Math.min(100, Math.round(rms * gainRef.current * 100));
        lvlBar.style.width = `${percent}%`;
        if (lvlText) lvlText.textContent = `${percent}%`;
      }

      // If gated, pull energies back to 0
      if (isGated) {
        lowEnd = 0;
        midHigh = 0;
        smoothEnergyRef.current = smoothEnergyRef.current * 0.95;
      }

      // Draw bioluminescent fluids
      ctx2d.globalCompositeOperation = "screen";

      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.16;
      const scale = 1.0 + lowEnd * 0.75 + transientFlashRef.current * 0.45;

      // Compute targets and update vertices
      const xCoords: number[] = [];
      const yCoords: number[] = [];

      for (let i = 0; i < vertexCount; i++) {
        const angle = (i / vertexCount) * Math.PI * 2;
        
        // Deform with mid/high frequency waves
        const wave1 = Math.sin(angle * 3 + time * 3.5) * 35.0 * midHigh;
        const wave2 = Math.cos(angle * 6 - time * 2.0) * 20.0 * midHigh;
        const targetRadius = baseRadius * scale + wave1 + wave2;

        // Transitions: instant on expand (attack), smooth linear on contract (decay)
        const diff = targetRadius - radii[i];
        if (diff > 0) {
          radii[i] = targetRadius; // instant attack
        } else {
          radii[i] += diff * 0.07; // smooth linear contract
        }

        xCoords.push(cx + Math.cos(angle) * radii[i]);
        yCoords.push(cy + Math.sin(angle) * radii[i]);
      }

      // Draw Layer 1: Outermost Cyan Blob (Glowing outline)
      ctx2d.shadowBlur = 30 + midHigh * 60;
      ctx2d.shadowColor = "#00E5FF";
      ctx2d.strokeStyle = "rgba(0, 229, 255, 0.45)";
      ctx2d.lineWidth = 4 + midHigh * 8;
      
      const drawClosedBlob = () => {
        ctx2d.beginPath();
        const startX = (xCoords[0] + xCoords[vertexCount - 1]) / 2;
        const startY = (yCoords[0] + yCoords[vertexCount - 1]) / 2;
        ctx2d.moveTo(startX, startY);
        for (let i = 0; i < vertexCount; i++) {
          const next = (i + 1) % vertexCount;
          const xc = (xCoords[i] + xCoords[next]) / 2;
          const yc = (yCoords[i] + yCoords[next]) / 2;
          ctx2d.quadraticCurveTo(xCoords[i], yCoords[i], xc, yc);
        }
        ctx2d.closePath();
      };

      drawClosedBlob();
      ctx2d.stroke();

      // Draw Layer 2: Mid-range Violet Fluid (Translucent gradient fill)
      ctx2d.shadowColor = "#9D4EDD";
      ctx2d.shadowBlur = 20 + lowEnd * 40;
      const gradMid = ctx2d.createRadialGradient(cx, cy, baseRadius * 0.2, cx, cy, baseRadius * scale * 1.2);
      gradMid.addColorStop(0, "rgba(157, 78, 221, 0.25)");
      gradMid.addColorStop(0.5, "rgba(157, 78, 221, 0.12)");
      gradMid.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx2d.fillStyle = gradMid;
      drawClosedBlob();
      ctx2d.fill();

      // Draw Layer 3: Inner Magenta Core (Hot bioluminescent core)
      ctx2d.shadowColor = "#FF007F";
      ctx2d.shadowBlur = 40 + transientFlashRef.current * 40;
      const gradCore = ctx2d.createRadialGradient(
        cx + Math.sin(time) * 10, cy + Math.cos(time) * 10, 2,
        cx, cy, baseRadius * 0.65 * scale
      );
      gradCore.addColorStop(0, "rgba(255, 0, 127, 0.8)");
      gradCore.addColorStop(0.3, "rgba(255, 0, 127, 0.5)");
      gradCore.addColorStop(0.7, "rgba(157, 78, 221, 0.2)");
      gradCore.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx2d.fillStyle = gradCore;
      drawClosedBlob();
      ctx2d.fill();

      // Draw & Update Particles
      ctx2d.shadowBlur = 12;
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.97;
        p.vy *= 0.97;
        p.alpha -= p.decay;

        if (p.alpha <= 0 || p.size <= 0.1) {
          particles.splice(i, 1);
          continue;
        }

        ctx2d.shadowColor = p.color;
        ctx2d.fillStyle = p.color;
        ctx2d.globalAlpha = p.alpha;
        ctx2d.beginPath();
        ctx2d.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx2d.fill();
      }

      // Reset styles for next frame
      ctx2d.globalAlpha = 1.0;
      ctx2d.shadowBlur = 0;
    };

    draw();

    return () => {
      window.removeEventListener("resize", resizeCanvas);
      cancelAnimationFrame(animationFrameRef.current);
    };
  }, [audioStarted]);

  return (
    <div
      ref={containerRef}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        background: "#000000",
        overflow: "hidden",
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: "100%",
          height: "100%",
          display: "block",
        }}
      />

      {/* Start Overlay / Button */}
      {!audioStarted && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            background: "rgba(0, 0, 0, 0.75)",
            backdropFilter: "blur(12px)",
            zIndex: 30,
            padding: "20px",
            textAlign: "center",
          }}
        >
          <div
            className="card-glass"
            style={{
              padding: "40px",
              borderRadius: "20px",
              border: "1px solid var(--border-glass)",
              maxWidth: "400px",
              boxShadow: "0 0 40px rgba(0, 229, 255, 0.1)",
            }}
          >
            <h3 style={{ margin: "0 0 12px 0", fontSize: "22px", fontWeight: 700, color: "#ffffff" }}>
              Activar Sensor Visual 🎨
            </h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "13px", lineHeight: "1.5", marginBottom: "28px" }}>
              Para iniciar el lienzo de síntesis generativa, es necesario habilitar la entrada del micrófono o instrumento.
            </p>
            <button
              onClick={startAudio}
              style={{
                background: "linear-gradient(135deg, rgba(0, 229, 255, 0.25) 0%, rgba(255, 0, 127, 0.15) 100%)",
                border: "1px solid rgba(0, 229, 255, 0.7)",
                borderRadius: "30px",
                padding: "14px 36px",
                color: "#ffffff",
                fontWeight: 700,
                letterSpacing: "2px",
                textTransform: "uppercase",
                cursor: "pointer",
                boxShadow: "0 0 20px rgba(0, 229, 255, 0.3)",
                transition: "all 0.3s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "scale(1.05)";
                e.currentTarget.style.boxShadow = "0 0 30px rgba(0, 229, 255, 0.5)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "scale(1)";
                e.currentTarget.style.boxShadow = "0 0 20px rgba(0, 229, 255, 0.3)";
              }}
            >
              Iniciar Pintor
            </button>
            {errorMsg && (
              <div style={{ color: "#FF007F", fontSize: "12px", marginTop: "16px", fontWeight: 600 }}>
                ⚠️ {errorMsg}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
