import { useEffect, useRef, useState } from "react";

interface MusicPainterVisualizerProps {
  deviceId: string;
  gain: number;
  noiseGate: number;
  filter: boolean;
}

// Neon color palette (themed around Argentina flag + neon highlights)
const NEON_PALETTE = [
  "#74ACDF", // Celestial Blue
  "#FFFFFF", // Pure White
  "#F6B800", // Mayo Sun Gold
  "#00E5FF", // Electric Cyan
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
  gravity?: number;
}

const FIREWORK_COLORS = ["#74ACDF", "#FFFFFF", "#F6B800"];

const drawFlagRibbon = (
  ctx2d: CanvasRenderingContext2D,
  w: number,
  yCenter: number,
  height: number,
  color: string,
  time: number,
  lowEnd: number
) => {
  ctx2d.beginPath();
  for (let x = 0; x <= w; x += 15) {
    const wave = Math.sin(x * 0.004 + time * 1.5) * (15.0 + lowEnd * 35.0) +
                 Math.cos(x * 0.008 - time * 0.8) * (8.0 + lowEnd * 15.0);
    const y = yCenter + wave;
    if (x === 0) ctx2d.moveTo(x, y);
    else ctx2d.lineTo(x, y);
  }
  ctx2d.strokeStyle = color;
  ctx2d.lineWidth = height;
  ctx2d.lineCap = "round";
  ctx2d.stroke();
};

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

  // Fluid blob geometry (Three concentric circles)
  const vertexCount = 32; // Higher vertex count for high-fidelity forms
  const radiiRef1 = useRef<number[]>(new Array(vertexCount).fill(100));
  const radiiRef2 = useRef<number[]>(new Array(vertexCount).fill(100));
  const radiiRef3 = useRef<number[]>(new Array(vertexCount).fill(100));
  const xCoordsRef1 = useRef<number[]>(new Array(vertexCount).fill(0));
  const yCoordsRef1 = useRef<number[]>(new Array(vertexCount).fill(0));
  const xCoordsRef2 = useRef<number[]>(new Array(vertexCount).fill(0));
  const yCoordsRef2 = useRef<number[]>(new Array(vertexCount).fill(0));
  const xCoordsRef3 = useRef<number[]>(new Array(vertexCount).fill(0));
  const yCoordsRef3 = useRef<number[]>(new Array(vertexCount).fill(0));

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

    // Initialise radii lists for the three concentric rings
    const r1 = radiiRef1.current;
    const r2 = radiiRef2.current;
    const r3 = radiiRef3.current;
    const initialRadius = Math.min(canvas.width, canvas.height) * 0.16;
    for (let i = 0; i < vertexCount; i++) {
      r1[i] = initialRadius * 1.25;
      r2[i] = initialRadius * 0.9;
      r3[i] = initialRadius * 0.6;
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

        // 1. Calculate RMS (root-mean-square) amplitude (Optimized by sampling every 4th element)
        let rmsSum = 0;
        const step = 4;
        for (let i = 0; i < timeData.length; i += step) {
          const val = (timeData[i] - 128) / 128; // normalise to -1..1
          rmsSum += val * val;
        }
        rms = Math.sqrt(rmsSum / (timeData.length / step));

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

            // Spawn radial burst particles (Central explosion)
            const pCount = 18 + Math.floor(midHigh * 15);
            const cx = w / 2;
            const cy = h / 2;
            const baseRad = Math.min(w, h) * 0.16;
            const scale = 1.0 + lowEnd * 0.8 + transientFlashRef.current * 0.4;
            const blobRad = baseRad * scale;

            for (let k = 0; k < pCount; k++) {
              const angle = (k / pCount) * Math.PI * 2 + Math.random() * 0.2;
              const speed = 3.0 + Math.random() * 8.0 + lowEnd * 5.0;
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
                decay: 0.010 + Math.random() * 0.018, // slightly slower fade
                gravity: 0.15, // Gravitational downward fall
              });
            }

            // Spawn secondary background sky firework explosion (65% chance)
            if (Math.random() < 0.65) {
              const fX = w * (0.15 + Math.random() * 0.7);
              const fY = h * (0.15 + Math.random() * 0.35);
              const fwColor = FIREWORK_COLORS[Math.floor(Math.random() * FIREWORK_COLORS.length)];
              const fwCount = 12 + Math.floor(Math.random() * 15);
              
              for (let k = 0; k < fwCount; k++) {
                const angle = (k / fwCount) * Math.PI * 2 + Math.random() * 0.3;
                const speed = 1.5 + Math.random() * 5.0;
                particlesRef.current.push({
                  x: fX,
                  y: fY,
                  vx: Math.cos(angle) * speed,
                  vy: Math.sin(angle) * speed,
                  size: 1.5 + Math.random() * 3.0,
                  color: Math.random() < 0.3 ? "#FFFFFF" : fwColor,
                  alpha: 1.0,
                  decay: 0.008 + Math.random() * 0.014,
                  gravity: 0.12, // Gravity for firework sparks
                });
              }
            }

            // Cap maximum active particles to prevent GC/rendering bottleneck
            if (particlesRef.current.length > 300) {
              particlesRef.current.splice(0, particlesRef.current.length - 300);
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

      // Draw background flag ribbons & bioluminescent fluids using screen additive blend
      ctx2d.globalCompositeOperation = "screen";

      const cx = w / 2;
      const cy = h / 2;
      const baseRadius = Math.min(w, h) * 0.16;

      // Draw background Argentine flag waving stripes
      const ribbonHeight = 35 + lowEnd * 25;
      drawFlagRibbon(ctx2d, w, h * 0.5 - ribbonHeight, ribbonHeight, "rgba(116, 172, 223, 0.11)", time, lowEnd); // Celestial Blue
      drawFlagRibbon(ctx2d, w, h * 0.5, ribbonHeight, "rgba(255, 255, 255, 0.11)", time, lowEnd);               // White
      drawFlagRibbon(ctx2d, w, h * 0.5 + ribbonHeight, ribbonHeight, "rgba(116, 172, 223, 0.11)", time, lowEnd); // Celestial Blue

      // Read/write preallocated coordinates for three rings
      const xCoords1 = xCoordsRef1.current;
      const yCoords1 = yCoordsRef1.current;
      const xCoords2 = xCoordsRef2.current;
      const yCoords2 = yCoordsRef2.current;
      const xCoords3 = xCoordsRef3.current;
      const yCoords3 = yCoordsRef3.current;

      const r1 = radiiRef1.current;
      const r2 = radiiRef2.current;
      const r3 = radiiRef3.current;

      // 1. Calculate geometry for Outer Ring (Ring 1)
      const scale1 = 1.0 + lowEnd * 0.5 + transientFlashRef.current * 0.25;
      for (let i = 0; i < vertexCount; i++) {
        const angle = (i / vertexCount) * Math.PI * 2;
        // Flower blooming with 8 petals modulated by midHigh energy
        const flowerMod1 = Math.sin(angle * 8) * 0.16 * midHigh;
        const targetRadius1 = (baseRadius * 1.25) * scale1 * (1.0 + flowerMod1) +
          Math.sin(angle * 12 + time * 0.4) * (baseRadius * 0.22) * (0.15 + midHigh * 1.8) +
          Math.cos(angle * 24 - time * 2.0) * 5.0 * midHigh;

        const diff = targetRadius1 - r1[i];
        if (diff > 0) r1[i] = targetRadius1;
        else r1[i] += diff * 0.08;

        xCoords1[i] = cx + Math.cos(angle) * r1[i];
        yCoords1[i] = cy + Math.sin(angle) * r1[i];
      }

      // 2. Calculate geometry for Middle Ring (Ring 2)
      const scale2 = 1.0 + midHigh * 0.45 + transientFlashRef.current * 0.2;
      for (let i = 0; i < vertexCount; i++) {
        const angle = (i / vertexCount) * Math.PI * 2;
        // Flower blooming with 6 petals (offset using cos and a slow rotation for visual variety)
        const flowerMod2 = Math.cos(angle * 6 + time * 0.2) * 0.14 * midHigh;
        const targetRadius2 = (baseRadius * 0.9) * scale2 * (1.0 + flowerMod2) +
          Math.sin(angle * 8 - time * 0.6) * (baseRadius * 0.18) * (0.2 + midHigh * 2.2) +
          Math.sin(angle * 16 + time * 1.5) * 4.0 * midHigh;

        const diff = targetRadius2 - r2[i];
        if (diff > 0) r2[i] = targetRadius2;
        else r2[i] += diff * 0.07;

        xCoords2[i] = cx + Math.cos(angle) * r2[i];
        yCoords2[i] = cy + Math.sin(angle) * r2[i];
      }

      // 3. Calculate geometry for Inner Ring (Ring 3)
      const scale3 = 1.0 + lowEnd * 0.4 + transientFlashRef.current * 0.15;
      for (let i = 0; i < vertexCount; i++) {
        const angle = (i / vertexCount) * Math.PI * 2;
        // Flower blooming with 5 petals responding to lowEnd grave beats
        const flowerMod3 = Math.sin(angle * 5 - time * 0.1) * 0.12 * lowEnd;
        const targetRadius3 = (baseRadius * 0.6) * scale3 * (1.0 + flowerMod3) +
          Math.sin(angle * 6 + time * 0.9) * (baseRadius * 0.15) * (0.2 + lowEnd * 2.0);

        const diff = targetRadius3 - r3[i];
        if (diff > 0) r3[i] = targetRadius3;
        else r3[i] += diff * 0.06;

        xCoords3[i] = cx + Math.cos(angle) * r3[i];
        yCoords3[i] = cy + Math.sin(angle) * r3[i];
      }

      // Helper to trace closed bezier blob path
      const traceClosedBlob = (xCoords: number[], yCoords: number[]) => {
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
      ctx2d.strokeStyle = "rgba(116, 172, 223, 0.25)";
      ctx2d.lineWidth = 1.8;
      ctx2d.setLineDash([4, 12]);
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, baseRadius * scale1 * 1.35 + Math.sin(time * 0.7) * 10, 0, Math.PI * 2);
      ctx2d.stroke();
      ctx2d.setLineDash([]); // Reset dash

      // 2. Draw Outer Ring (Celeste - celestial flag color)
      traceClosedBlob(xCoords1, yCoords1);
      ctx2d.shadowBlur = 0;
      ctx2d.strokeStyle = "rgba(116, 172, 223, 0.25)";
      ctx2d.lineWidth = 32 + midHigh * 25;
      ctx2d.stroke();
      ctx2d.strokeStyle = "rgba(116, 172, 223, 0.55)";
      ctx2d.lineWidth = 16 + midHigh * 15;
      ctx2d.stroke();
      ctx2d.strokeStyle = "rgba(116, 172, 223, 0.85)";
      ctx2d.lineWidth = 6 + midHigh * 6;
      ctx2d.stroke();
      ctx2d.strokeStyle = "rgba(255, 255, 255, 1.0)";
      ctx2d.lineWidth = 2.5;
      ctx2d.stroke();

      const gradOuter = ctx2d.createRadialGradient(cx, cy, baseRadius * 0.3, cx, cy, baseRadius * scale1 * 1.4);
      gradOuter.addColorStop(0, "rgba(116, 172, 223, 0.22)");
      gradOuter.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx2d.fillStyle = gradOuter;
      traceClosedBlob(xCoords1, yCoords1);
      ctx2d.fill();

      // 3. Draw Middle Ring (White)
      traceClosedBlob(xCoords2, yCoords2);
      ctx2d.strokeStyle = "rgba(255, 255, 255, 0.20)";
      ctx2d.lineWidth = 28 + midHigh * 22;
      ctx2d.stroke();
      ctx2d.strokeStyle = "rgba(255, 255, 255, 0.50)";
      ctx2d.lineWidth = 12 + midHigh * 12;
      ctx2d.stroke();
      ctx2d.strokeStyle = "rgba(255, 255, 255, 0.80)";
      ctx2d.lineWidth = 5 + midHigh * 5;
      ctx2d.stroke();
      ctx2d.strokeStyle = "rgba(116, 172, 223, 0.98)";
      ctx2d.lineWidth = 2.0;
      ctx2d.stroke();

      const gradMid = ctx2d.createRadialGradient(cx, cy, baseRadius * 0.2, cx, cy, baseRadius * scale2 * 1.1);
      gradMid.addColorStop(0, "rgba(255, 255, 255, 0.20)");
      gradMid.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx2d.fillStyle = gradMid;
      traceClosedBlob(xCoords2, yCoords2);
      ctx2d.fill();

      // 4. Draw Inner Ring (Gold - Mayo Sun color)
      traceClosedBlob(xCoords3, yCoords3);
      ctx2d.strokeStyle = "rgba(246, 184, 0, 0.25)";
      ctx2d.lineWidth = 24 + lowEnd * 20;
      ctx2d.stroke();
      ctx2d.strokeStyle = "rgba(246, 184, 0, 0.55)";
      ctx2d.lineWidth = 10 + lowEnd * 12;
      ctx2d.stroke();
      ctx2d.strokeStyle = "rgba(246, 184, 0, 0.90)";
      ctx2d.lineWidth = 4.0 + lowEnd * 4.0;
      ctx2d.stroke();
      ctx2d.strokeStyle = "rgba(255, 255, 255, 1.0)";
      ctx2d.lineWidth = 1.5;
      ctx2d.stroke();

      const gradCore = ctx2d.createRadialGradient(
        cx + Math.sin(time) * 8, cy + Math.cos(time) * 8, 2,
        cx, cy, baseRadius * 0.65 * scale3
      );
      gradCore.addColorStop(0, "rgba(246, 184, 0, 0.45)");
      gradCore.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx2d.fillStyle = gradCore;
      traceClosedBlob(xCoords3, yCoords3);
      ctx2d.fill();

      // 4.5. Sol de Mayo in the Center
      const sunRadius = 22 + lowEnd * 12;
      const rayCount = 16;
      const innerSunRad = sunRadius * 0.5;

      // Sun glow
      const sunGlow = ctx2d.createRadialGradient(cx, cy, innerSunRad, cx, cy, sunRadius * 2.5);
      sunGlow.addColorStop(0, "rgba(246, 184, 0, 0.8)");
      sunGlow.addColorStop(0.3, "rgba(246, 184, 0, 0.3)");
      sunGlow.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx2d.fillStyle = sunGlow;
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, sunRadius * 2.5, 0, Math.PI * 2);
      ctx2d.fill();

      // Sun disk
      ctx2d.fillStyle = "#F6B800";
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, sunRadius, 0, Math.PI * 2);
      ctx2d.fill();

      // Rotating Sun Rays (Alternating straight and wavy rays)
      ctx2d.strokeStyle = "#F6B800";
      ctx2d.lineWidth = 1.8 + lowEnd * 1.5;
      for (let r = 0; r < rayCount; r++) {
        const angle = (r / rayCount) * Math.PI * 2 + time * 0.3; // Rotate slowly
        const isWavy = r % 2 === 0;
        
        const startX = cx + Math.cos(angle) * sunRadius;
        const startY = cy + Math.sin(angle) * sunRadius;
        
        const rayLength = sunRadius * (1.2 + midHigh * 1.5);
        const endX = cx + Math.cos(angle) * rayLength;
        const endY = cy + Math.sin(angle) * rayLength;
        
        if (isWavy) {
          ctx2d.beginPath();
          ctx2d.moveTo(startX, startY);
          const steps = 10;
          for (let s = 1; s <= steps; s++) {
            const tSeg = s / steps;
            const dist = sunRadius + (rayLength - sunRadius) * tSeg;
            const waveOffset = Math.sin(tSeg * Math.PI * 3 + time * 5) * (4 + midHigh * 6);
            
            const px = cx + Math.cos(angle) * dist + Math.cos(angle + Math.PI/2) * waveOffset;
            const py = cy + Math.sin(angle) * dist + Math.sin(angle + Math.PI/2) * waveOffset;
            ctx2d.lineTo(px, py);
          }
          ctx2d.stroke();
        } else {
          ctx2d.beginPath();
          ctx2d.moveTo(startX, startY);
          ctx2d.lineTo(endX, endY);
          ctx2d.stroke();
        }
      }

      // 5. Draw small glowing nodes at vertices across the three rings
      const nodeSize = 2.0 + midHigh * 3.5;
      for (let i = 0; i < vertexCount; i++) {
        if (i % 4 === 0) {
          // Outer node (Celeste)
          ctx2d.fillStyle = "#74ACDF";
          ctx2d.beginPath();
          ctx2d.arc(xCoords1[i], yCoords1[i], nodeSize, 0, Math.PI * 2);
          ctx2d.fill();
        }
        if ((i + 1) % 4 === 0) {
          // Middle node (White)
          ctx2d.fillStyle = "#FFFFFF";
          ctx2d.beginPath();
          ctx2d.arc(xCoords2[i], yCoords2[i], nodeSize, 0, Math.PI * 2);
          ctx2d.fill();
        }
        if ((i + 2) % 4 === 0) {
          // Inner node (Gold)
          ctx2d.fillStyle = "#F6B800";
          ctx2d.beginPath();
          ctx2d.arc(xCoords3[i], yCoords3[i], nodeSize, 0, Math.PI * 2);
          ctx2d.fill();
        }
      }

      // 6. Draw & Update Particles (Fireworks with gravity and motion trails)
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        const prevX = p.x;
        const prevY = p.y;

        p.x += p.vx;
        p.y += p.vy;
        if (p.gravity) {
          p.vy += p.gravity;
        }
        p.vx *= 0.98;
        p.vy *= 0.98;
        p.alpha -= p.decay;

        if (p.alpha <= 0 || p.size <= 0.1) {
          particles.splice(i, 1);
          continue;
        }

        ctx2d.strokeStyle = p.color;
        ctx2d.globalAlpha = p.alpha;
        ctx2d.lineWidth = p.size;
        ctx2d.lineCap = "round";
        ctx2d.beginPath();
        ctx2d.moveTo(prevX, prevY);
        ctx2d.lineTo(p.x, p.y);
        ctx2d.stroke();
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
