import type { Song } from "../songs/songData";

interface Props {
  songs: Song[];
  selectedSong: Song;
  onSelect: (song: Song) => void;
  bpm: number;
  volume: number;
  filterFreq: number;
  activeSections: number;
  conductorBPM: number;
  isPlaying: boolean;
  leftDetected: boolean;
  rightDetected: boolean;
}

const SECTION_LABELS = ["Chords", "Melody", "Bass", "Drums", "Full"];

function formatBPM(bpm: number) {
  if (bpm < 60) return "Largo";
  if (bpm < 76) return "Adagio";
  if (bpm < 108) return "Andante";
  if (bpm < 120) return "Moderato";
  if (bpm < 156) return "Allegro";
  if (bpm < 180) return "Vivace";
  return "Presto";
}

function formatFilter(freq: number) {
  if (freq < 500) return "Oscuro";
  if (freq < 2000) return "Cálido";
  if (freq < 8000) return "Brillante";
  return "Abierto";
}

export default function ControlPanel({
  songs, selectedSong, onSelect,
  bpm, volume, filterFreq, activeSections, conductorBPM,
  isPlaying, leftDetected, rightDetected,
}: Props) {
  return (
    <aside className="control-panel">
      {/* Song selector */}
      <div className="panel-section">
        <h2 className="panel-title">Repertorio</h2>
        <div className="song-list">
          {songs.map((s) => (
            <button
              key={s.id}
              id={`song-btn-${s.id}`}
              className={`song-card ${s.id === selectedSong.id ? "active" : ""}`}
              style={{ "--accent": s.color } as React.CSSProperties}
              onClick={() => onSelect(s)}
            >
              <span className="song-emoji" aria-hidden="true">{s.emoji}</span>
              <div className="song-info">
                <span className="song-name">{s.name}</span>
                <span className="song-artist">{s.artist}</span>
              </div>
              <span className="song-bpm-badge">{s.bpmBase} BPM</span>
            </button>
          ))}
        </div>
      </div>

      {/* Live metrics */}
      <div className="panel-section">
        <h2 className="panel-title">Métricas en Vivo</h2>
        <div className="metrics-grid">
          <div className="metric-card">
            <span className="metric-label">Tempo</span>
            <span className="metric-value">{Math.round(bpm)}</span>
            <span className="metric-unit">BPM</span>
            <span className="metric-sub">{formatBPM(bpm)}</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Director</span>
            <span className="metric-value">{conductorBPM > 0 ? Math.round(conductorBPM) : "—"}</span>
            <span className="metric-unit">{conductorBPM > 0 ? "BPM" : ""}</span>
            <span className="metric-sub">Oscilaciones</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Dinámica</span>
            <span className="metric-value">{Math.round(volume * 100)}</span>
            <span className="metric-unit">%</span>
            <span className="metric-sub">{volume > 0.7 ? "Forte" : volume > 0.4 ? "Mezzo" : "Piano"}</span>
          </div>
          <div className="metric-card">
            <span className="metric-label">Filtro</span>
            <span className="metric-value">{filterFreq >= 1000 ? `${(filterFreq / 1000).toFixed(1)}k` : Math.round(filterFreq)}</span>
            <span className="metric-unit">Hz</span>
            <span className="metric-sub">{formatFilter(filterFreq)}</span>
          </div>
        </div>
      </div>

      {/* Active sections */}
      <div className="panel-section">
        <h2 className="panel-title">Secciones Activas</h2>
        <div className="sections-row">
          {SECTION_LABELS.map((label, i) => (
            <div
              key={label}
              className={`section-chip ${i < activeSections ? "section-on" : ""}`}
              style={{ "--accent": selectedSong.color } as React.CSSProperties}
            >
              {label}
            </div>
          ))}
        </div>
        <p className="sections-hint">
          Dedos mano izquierda: <strong>{activeSections}</strong>
        </p>
      </div>

      {/* Hand detection status */}
      <div className="panel-section">
        <h2 className="panel-title">Manos Detectadas</h2>
        <div className="hand-status-row">
          <div className={`hand-indicator ${rightDetected ? "hand-on" : ""}`}>
            <span className="hand-dot" />
            <span>Derecha</span>
          </div>
          <div className={`hand-indicator ${leftDetected ? "hand-on" : ""}`}>
            <span className="hand-dot left" />
            <span>Izquierda</span>
          </div>
        </div>
      </div>

      {/* Guide */}
      <div className="panel-section guide-section">
        <h2 className="panel-title">Guía Rápida</h2>
        <ul className="guide-list">
          <li>
            <span className="guide-icon" style={{ color: "#00f5ff" }}>↔</span>
            <span>Mano derecha X → Tempo base</span>
          </li>
          <li>
            <span className="guide-icon" style={{ color: "#00f5ff" }}>↕</span>
            <span>Mano derecha Y → Dinámica</span>
          </li>
          <li>
            <span className="guide-icon" style={{ color: "#00f5ff" }}>🥢</span>
            <span>Oscila para marcar el beat → BPM director</span>
          </li>
          <li>
            <span className="guide-icon" style={{ color: "#bf5fff" }}>↕</span>
            <span>Mano izquierda Y → Filtro sonido</span>
          </li>
          <li>
            <span className="guide-icon" style={{ color: "#bf5fff" }}>✋</span>
            <span>Dedos mano izq → Secciones (0–5)</span>
          </li>
        </ul>
      </div>

      {/* Playing state */}
      <div className={`playing-badge ${isPlaying ? "playing-on" : ""}`}>
        <span className="playing-dot" />
        {isPlaying ? "Orquesta en marcha" : "Toca Iniciar para comenzar"}
      </div>
    </aside>
  );
}
