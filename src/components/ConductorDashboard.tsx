import { useRef, useEffect } from "react";
import type { Song } from "../songs/songData";

interface Props {
  songs: Song[];
  selectedSong: Song;
  onSelect: (song: Song) => void;
  bpm: number;
  volume: number;
  isPlaying: boolean;
  screenLeftDetected: boolean;   // physical left hand = screen-LEFT  → Volume
  screenRightDetected: boolean;  // physical right hand = screen-RIGHT → Tempo
  vuBarsRef: React.RefObject<HTMLDivElement | null>;
}

// Cyan  = screen-LEFT  hand = Volume
// Purple = screen-RIGHT hand = Tempo
const VOL_COLOR   = "#74ACDF"; // Celestial Blue
const TEMPO_COLOR = "#F6B800"; // Sol de Mayo Gold
const VU_BARS     = 14;

function tempoLabel(bpm: number) {
  if (bpm < 60)  return "Largo";
  if (bpm < 76)  return "Adagio";
  if (bpm < 108) return "Andante";
  if (bpm < 120) return "Moderato";
  if (bpm < 156) return "Allegro";
  if (bpm < 176) return "Vivace";
  return "Presto";
}

export default function ConductorDashboard({
  songs, selectedSong, onSelect,
  bpm, volume, isPlaying,
  screenLeftDetected, screenRightDetected,
  vuBarsRef,
}: Props) {

  // Beat flash: directly toggle DOM class — zero React re-renders
  const ringRef  = useRef<SVGCircleElement>(null);
  const bpmNumRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPlaying || bpm <= 0) return;
    const ms = 60000 / Math.max(40, bpm);
    const id = setInterval(() => {
      ringRef.current?.classList.add("ring-beat");
      bpmNumRef.current?.classList.add("beat-flash");
      setTimeout(() => {
        ringRef.current?.classList.remove("ring-beat");
        bpmNumRef.current?.classList.remove("beat-flash");
      }, 110);
    }, ms);
    return () => clearInterval(id);
  }, [bpm, isPlaying]);

  // Tempo ring geometry
  const R    = 56;
  const CIRC = 2 * Math.PI * R;
  const bpmNorm = Math.max(0, Math.min(1, (bpm - 50) / 130));
  const dashOff = CIRC * (1 - bpmNorm);

  return (
    <aside className="cd-root">

      {/* ── Song selector ── */}
      <div className="cd-songs">
        {songs.map(s => (
          <button
            key={s.id}
            id={`cd-song-${s.id}`}
            className={`cd-song-btn ${s.id === selectedSong.id ? "active" : ""}`}
            style={{ "--sc": s.color } as React.CSSProperties}
            onClick={() => onSelect(s)}
            title={s.artist}
          >
            <span className="cd-song-emoji">{s.emoji}</span>
            <span className="cd-song-name">{s.name}</span>
          </button>
        ))}
      </div>

      {/* ── Volume — screen-LEFT hand (cyan) ── */}
      <div className={`cd-block ${screenLeftDetected ? "cd-block-active" : ""}`}>
        <div className="cd-block-label">
          <span className="cd-hand-dot" style={{ background: VOL_COLOR }} />
          Mano izquierda
          <span className="cd-hand-arrow">↑ Sube · Baja ↓</span>
          <span className={`cd-hand-badge ${screenLeftDetected ? "detected" : ""}`}>
            {screenLeftDetected ? "✓" : "—"}
          </span>
        </div>

        <div className="cd-vol-section">
          {/* Big percentage */}
          <div className="cd-vol-num" style={{ color: VOL_COLOR }}>
            {Math.round(volume * 100)}<span className="cd-vol-unit">%</span>
          </div>
          <div className="cd-vol-label">VOLUMEN</div>

          {/* Vertical VU bars */}
          <div ref={vuBarsRef} className="cd-vu-bars">
            {Array.from({ length: VU_BARS }, (_, i) => (
              <div
                key={i}
                className="cd-vu-bar"
                style={{ opacity: 0.1 }}
              />
            ))}
          </div>

          {/* Hand height hint */}
          <div className="cd-hand-hint">
            <span className="cd-hint-top">🔊 Arriba</span>
            <div className="cd-hint-line" />
            <span className="cd-hint-bot">🔇 Abajo</span>
          </div>
        </div>
      </div>

      {/* ── Tempo — screen-RIGHT hand (purple) ── */}
      <div className={`cd-block ${screenRightDetected ? "cd-block-active" : ""}`}>
        <div className="cd-block-label">
          <span className="cd-hand-dot" style={{ background: TEMPO_COLOR }} />
          Mano derecha
          <span className="cd-hand-arrow">↑ Rápido · Lento ↓</span>
          <span className={`cd-hand-badge ${screenRightDetected ? "detected" : ""}`}>
            {screenRightDetected ? "✓" : "—"}
          </span>
        </div>

        <div className="cd-tempo-section">
          {/* SVG Tempo ring */}
          <div className="cd-ring-wrap">
            <svg viewBox="0 0 130 130" className="cd-ring-svg">
              <circle cx="65" cy="65" r={R} className="cd-ring-track" />
              <circle
                ref={ringRef}
                cx="65" cy="65" r={R}
                className="cd-ring-progress"
                strokeDasharray={CIRC}
                strokeDashoffset={dashOff}
                style={{ stroke: TEMPO_COLOR }}
              />
            </svg>
            <div className="cd-ring-center">
              <div ref={bpmNumRef} className="cd-bpm-num">{bpm}</div>
              <div className="cd-bpm-sub">BPM</div>
              <div className="cd-bpm-mood">{tempoLabel(bpm)}</div>
            </div>
          </div>

          {/* Hand height hint */}
          <div className="cd-hand-hint">
            <span className="cd-hint-top">⚡ Arriba</span>
            <div className="cd-hint-line" />
            <span className="cd-hint-bot">🐢 Abajo</span>
          </div>
        </div>
      </div>

      {/* ── Status ── */}
      <div className={`cd-status ${isPlaying ? "playing" : ""}`}>
        <span className="cd-status-dot" />
        {isPlaying
          ? `🎼 ${selectedSong.name} en marcha`
          : "Presiona Iniciar para comenzar"}
      </div>
    </aside>
  );
}
