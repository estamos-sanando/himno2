import { useEffect, useRef, useState } from "react";

interface MusicPainterVisualizerProps {
  deviceId: string;
  gain: number;
  noiseGate: number;
  filter: boolean;
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
  filter,
}: MusicPainterVisualizerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Audio Context & nodes refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const hpFilterRef = useRef<BiquadFilterNode | null>(null);
  const lpFilterRef = useRef<BiquadFilterNode | null>(null);

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
  const vertexCount = 32; // Higher vertex count for high-fidelity forms
  const radiiRef = useRef<number[]>(new Array(vertexCount).fill(100));
  const xCoordsRef = useRef<number[]>(new Array(vertexCount).fill(0));
  const yCoordsRef = useRef<number[]>(new Array(vertexCount).fill(0));

  // Particles
  const particlesRef = useRef<Particle[]>([]);

  // Gain, NoiseGate & Filter refs to read them instantly inside the loop
  const gainRef = useRef(gain);
  const noiseGateRef = useRef(noiseGate);
  const filterRef = useRef(filter);

  useEffect(() => {
    gainRef.current = gain;
    noiseGateRef.current = noiseGate;
    filterRef.current = filter;
  }, [gain, noiseGate, filter]);

  // Handle ambient filter toggle dynamically (pop-free using setTargetAtTime)
  useEffect(() => {
    const ctx = audioCtxRef.current;
    const hp = hpFilterRef.current;
    const lp = lpFilterRef.current;
    if (ctx && hp && lp) {
      const t = ctx.currentTime;
      if (filter) {
        // Cut low hum (<95Hz) and high hiss (>3200Hz) to isolate voice / instruments
        hp.frequency.setTargetAtTime(95, t, 0.08);
        lp.frequency.setTargetAtTime(3200, t, 0.08);
      } else {
        // Bypass filters completely
        hp.frequency.setTargetAtTime(10, t, 0.08);
        lp.frequency.setTargetAtTime(22000, t, 0.08);
      }
    }
  }, [filter]);

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

      // Biquad filters for environmental noise filtering
      const hpFilter = ctx.createBiquadFilter();
      hpFilter.type = "highpass";
      hpFilter.Q.value = 0.8;
      hpFilter.frequency.value = filter ? 95 : 10;
      hpFilterRef.current = hpFilter;

      const lpFilter = ctx.createBiquadFilter();
      lpFilter.type = "lowpass";
      lpFilter.Q.value = 0.8;
      lpFilter.frequency.value = filter ? 3200 : 22000;
      lpFilterRef.current = lpFilter;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.35; // slightly faster response
      analyserRef.current = analyser;

      // Connect source -> environmental filter chain -> analyser
      source.connect(hpFilter);
      hpFilter.connect(lpFilter);
      lpFilter.connect(analyser);

      setAudioStarted(true);
      console.log("Audio input stream with environmental filter started successfully! 🎤");
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

    const ctx2d = canvas.getContext("2d", { alpha: false }); // Optimize canvas context settings
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

    // Initialise radii lists
    const radii = radiiRef.current;
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

      // Fading background for neon trails (7% opacity for beautiful fluid trails)
      ctx2d.globalCompositeOperation = "source-over";
      ctx2d.fillStyle = "rgba(0, 0, 0, 0.07)";
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
                decay: 0.010 + Math.random() * 0.015, // slightly slower fade
              });
            }

            // Cap maximum active particles to prevent GC/rendering bottleneck
            if (particlesRef.current.length > 200) {
              particlesRef.current.splice(0, particlesRef.current.length - 200);
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

      // Draw bioluminescent fluids using screen additive blend
      ctx2d.globalCompositeOperation = "screen";

      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.16;
      const scale = 1.0 + lowEnd * 0.75 + transientFlashRef.current * 0.45;

      // Read/write preallocated coordinates (avoids GC allocations)
      const xCoords = xCoordsRef.current;
      const yCoords = yCoordsRef.current;

      for (let i = 0; i < vertexCount; i++) {
        const angle = (i / vertexCount) * Math.PI * 2;
        
        // Form complex geometric ripples
        const wave1 = Math.sin(angle * 4 + time * 4.0) * 40.0 * midHigh;
        const wave2 = Math.cos(angle * 8 - time * 2.5) * 22.0 * midHigh;
        const targetRadius = baseRadius * scale + wave1 + wave2;

        // Transitions: instant expansion, smooth decay contraction
        const diff = targetRadius - radii[i];
        if (diff > 0) {
          radii[i] = targetRadius; // instant attack (no smoothing)
        } else {
          radii[i] += diff * 0.07; // smooth linear contract transition
        }

        xCoords[i] = cx + Math.cos(angle) * radii[i];
        yCoords[i] = cy + Math.sin(angle) * radii[i];
      }

      // Helper to trace closed bezier blob path
      const traceClosedBlob = () => {
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

      // 1. Decorative Outer Star/Plasma Ring (Dashed, rotating slowly)
      ctx2d.strokeStyle = "rgba(157, 78, 221, 0.18)";
      ctx2d.lineWidth = 1.5;
      ctx2d.setLineDash([4, 12]);
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, baseRadius * scale * 1.32 + Math.sin(time * 0.7) * 10, 0, Math.PI * 2);
      ctx2d.stroke();
      ctx2d.setLineDash([]); // Reset dash

      // 2. Layer 1: Glowing Cyan Outline (No shadowBlur for 60fps hardware acceleration!)
      // Layered stroke widths and translucent opacities create a highly realistic glow
      traceClosedBlob();
      ctx2d.shadowBlur = 0; // Disable heavy shadowBlur

      ctx2d.strokeStyle = "rgba(0, 229, 255, 0.06)";
      ctx2d.lineWidth = 32 + midHigh * 30;
      ctx2d.stroke();

      ctx2d.strokeStyle = "rgba(0, 229, 255, 0.15)";
      ctx2d.lineWidth = 16 + midHigh * 15;
      ctx2d.stroke();

      ctx2d.strokeStyle = "rgba(0, 229, 255, 0.45)";
      ctx2d.lineWidth = 6 + midHigh * 6;
      ctx2d.stroke();

      ctx2d.strokeStyle = "rgba(255, 255, 255, 0.95)";
      ctx2d.lineWidth = 1.5;
      ctx2d.stroke();

      // 3. Layer 2: Mid-range Violet Fluid (Translucent gradient fill)
      const gradMid = ctx2d.createRadialGradient(cx, cy, baseRadius * 0.2, cx, cy, baseRadius * scale * 1.25);
      gradMid.addColorStop(0, "rgba(157, 78, 221, 0.25)");
      gradMid.addColorStop(0.5, "rgba(157, 78, 221, 0.12)");
      gradMid.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx2d.fillStyle = gradMid;
      traceClosedBlob();
      ctx2d.fill();

      // 4. Layer 3: Inner Magenta Core (Hot bioluminescent core)
      const gradCore = ctx2d.createRadialGradient(
        cx + Math.sin(time) * 8, cy + Math.cos(time) * 8, 2,
        cx, cy, baseRadius * 0.68 * scale
      );
      gradCore.addColorStop(0, "rgba(255, 0, 127, 0.82)");
      gradCore.addColorStop(0.35, "rgba(255, 0, 127, 0.45)");
      gradCore.addColorStop(0.7, "rgba(157, 78, 221, 0.15)");
      gradCore.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx2d.fillStyle = gradCore;
      traceClosedBlob();
      ctx2d.fill();

      // 5. Draw small glowing nodes at every 2nd vertex (adds structure and high visual feedback)
      ctx2d.fillStyle = "#00F5D4";
      const nodeSize = 2.5 + midHigh * 4.5;
      for (let i = 0; i < vertexCount; i++) {
        if (i % 2 === 0) {
          ctx2d.beginPath();
          ctx2d.arc(xCoords[i], yCoords[i], nodeSize, 0, Math.PI * 2);
          ctx2d.fill();
        }
      }

      // 6. Draw & Update Particles
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.975;
        p.vy *= 0.975;
        p.alpha -= p.decay;

        if (p.alpha <= 0 || p.size <= 0.1) {
          particles.splice(i, 1);
          continue;
        }

        ctx2d.fillStyle = p.color;
        ctx2d.globalAlpha = p.alpha;
        ctx2d.beginPath();
        ctx2d.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx2d.fill();
      }

      // Reset alpha
      ctx2d.globalAlpha = 1.0;
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
