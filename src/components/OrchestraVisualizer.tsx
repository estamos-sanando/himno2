import { useRef, useEffect, useCallback } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  hue: number;
  size: number;
}

interface Props {
  rightX: number; // 0..1
  rightY: number; // 0..1
  leftX: number; // 0..1
  leftY: number; // 0..1
  bpm: number;
  volume: number; // 0..1
  filterFreq: number; // 200..20000
  accentColor: string;
  isPlaying: boolean;
  activeSections: number;
}

const MAX_PARTICLES = 200;

export default function OrchestraVisualizer({
  rightX, rightY, leftX, leftY, bpm, volume, filterFreq, accentColor, isPlaying, activeSections
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animRef = useRef<number>(0);
  const timeRef = useRef(0);

  const hexToHue = (hex: string): number => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return 0;
    const d = max - min;
    if (max === r) return ((g - b) / d + (g < b ? 6 : 0)) * 60;
    if (max === g) return ((b - r) / d + 2) * 60;
    return ((r - g) / d + 4) * 60;
  };

  const baseHue = hexToHue(accentColor.replace("#", "").length === 6 ? accentColor : "#00f0ff");

  const spawnParticles = useCallback((x: number, y: number, count: number, hue: number) => {
    const particles = particlesRef.current;
    for (let i = 0; i < count; i++) {
      if (particles.length >= MAX_PARTICLES) particles.shift();
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 2 + 0.5;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 1,
        maxLife: Math.random() * 0.8 + 0.4,
        hue: hue + (Math.random() - 0.5) * 40,
        size: Math.random() * 4 + 2,
      });
    }
  }, []);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    timeRef.current += 0.02;
    const t = timeRef.current;

    // Dark fade trail
    ctx.fillStyle = "rgba(11,13,25,0.3)";
    ctx.fillRect(0, 0, W, H);

    // Background grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.03)";
    ctx.lineWidth = 1;
    const gridSize = 60;
    for (let gx = 0; gx < W; gx += gridSize) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, H);
      ctx.stroke();
    }
    for (let gy = 0; gy < H; gy += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(W, gy);
      ctx.stroke();
    }

    // Waveform / frequency visualization
    if (isPlaying) {
      const wavePoints = 120;
      const filterNorm = Math.log(filterFreq / 200) / Math.log(100); // 0..1
      const ampScale = volume * 60 + 10;

      ctx.beginPath();
      ctx.strokeStyle = `hsla(${baseHue},100%,70%,0.4)`;
      ctx.lineWidth = 2;
      for (let i = 0; i <= wavePoints; i++) {
        const px = (i / wavePoints) * W;
        const freq = 2 + filterNorm * 6;
        const py = H / 2 + Math.sin(i * 0.1 * freq + t * (bpm / 60)) * ampScale
          + Math.sin(i * 0.05 * freq + t * 0.7) * (ampScale * 0.4);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Second harmonic
      ctx.beginPath();
      ctx.strokeStyle = `hsla(${baseHue + 120},80%,60%,0.25)`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i <= wavePoints; i++) {
        const px = (i / wavePoints) * W;
        const py = H / 2 + Math.sin(i * 0.2 + t * (bpm / 30)) * (ampScale * 0.5)
          + Math.cos(i * 0.07 + t) * (ampScale * 0.3);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

    // Section rings around center
    if (isPlaying) {
      const cx = W / 2, cy = H / 2;
      const sectionColors = ["#00f5ff", "#bf5fff", "#ff006e", "#ffd700", "#00ff88"];
      for (let s = 0; s < 5; s++) {
        const active = s < activeSections;
        const r = 40 + s * 30;
        const pulse = active ? 1 + Math.sin(t * (bpm / 60) * Math.PI * 2 + s) * 0.15 : 1;
        ctx.beginPath();
        ctx.arc(cx, cy, r * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = active ? sectionColors[s] : "rgba(255,255,255,0.08)";
        ctx.lineWidth = active ? 2 : 1;
        ctx.globalAlpha = active ? 0.7 : 0.3;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Hand position indicators
    if (isPlaying) {
      // Right hand
      const rx = rightX * W;
      const ry = rightY * H;
      const rhGrad = ctx.createRadialGradient(rx, ry, 0, rx, ry, 50);
      rhGrad.addColorStop(0, "rgba(0,245,255,0.6)");
      rhGrad.addColorStop(1, "rgba(0,245,255,0)");
      ctx.fillStyle = rhGrad;
      ctx.beginPath();
      ctx.arc(rx, ry, 50, 0, Math.PI * 2);
      ctx.fill();

      // Spawn particles from right hand
      if (Math.random() < 0.4) {
        spawnParticles(rx, ry, 2, baseHue);
      }

      // Left hand
      const lx = leftX * W;
      const ly = leftY * H;
      const lhGrad = ctx.createRadialGradient(lx, ly, 0, lx, ly, 40);
      lhGrad.addColorStop(0, "rgba(191,95,255,0.6)");
      lhGrad.addColorStop(1, "rgba(191,95,255,0)");
      ctx.fillStyle = lhGrad;
      ctx.beginPath();
      ctx.arc(lx, ly, 40, 0, Math.PI * 2);
      ctx.fill();

      if (Math.random() < 0.3) {
        spawnParticles(lx, ly, 1, 270);
      }
    }

    // Update & draw particles
    const particles = particlesRef.current;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // gravity
      p.life -= 0.02;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      const alpha = p.life / p.maxLife;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue},100%,70%,${alpha * 0.8})`;
      ctx.fill();
    }

    animRef.current = requestAnimationFrame(render);
  }, [rightX, rightY, leftX, leftY, bpm, volume, filterFreq, baseHue, isPlaying, activeSections, spawnParticles]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  useEffect(() => {
    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      className="orchestra-canvas"
      aria-label="Visualizador de orquesta"
    />
  );
}
