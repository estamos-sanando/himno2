import { type WaveformType, CHROMATIC, CHORD_INTERVALS } from "../hooks/useChordSynth";

interface Props {
  activeNote: string | null;
  activeQuality: string | null;
  waveform: WaveformType;
  setWaveform: (w: WaveformType) => void;
  octave: number;
  setOctave: (o: number) => void;
  snap: boolean;
  setSnap: (s: boolean) => void;
  isPlaying: boolean;
  screenLeftDetected: boolean;
  screenRightDetected: boolean;
}

export default function InstrumentDashboard({
  activeNote,
  activeQuality,
  waveform,
  setWaveform,
  octave,
  setOctave,
  snap,
  setSnap,
  isPlaying,
  screenLeftDetected,
  screenRightDetected,
}: Props) {
  
  // Calculate which notes are currently active on the visual piano
  const getActiveNotes = (): string[] => {
    if (!activeNote) return [];
    const rootIdx = CHROMATIC.indexOf(activeNote);
    if (rootIdx === -1) return [];

    const intervals = activeQuality && CHORD_INTERVALS[activeQuality] 
      ? CHORD_INTERVALS[activeQuality] 
      : [0];

    return intervals.map(interval => {
      const idx = rootIdx + interval;
      const noteName = CHROMATIC[idx % 12];
      const noteOctave = octave + Math.floor(idx / 12);
      return `${noteName}${noteOctave}`;
    });
  };

  const activeNotes = getActiveNotes();

  // Create list of keys to display on the keyboard (Octaves base & base+1)
  const pianoKeys: { note: string; isBlack: boolean }[] = [];
  [octave, octave + 1].forEach(oct => {
    CHROMATIC.forEach(note => {
      pianoKeys.push({
        note: `${note}${oct}`,
        isBlack: note.includes("#"),
      });
    });
  });

  const getChordDisplayName = () => {
    if (!activeNote) return "Silencio (OFF)";
    const qualityMap: Record<string, string> = {
      maj: "Mayor",
      min: "Menor",
      "7": "Séptima (7)",
      m7: "Menor 7 (m7)",
      maj7: "Mayor 7 (maj7)",
      dim: "Disminuido (dim)",
      aug: "Aumentado (aug)",
    };
    const qualName = activeQuality ? (qualityMap[activeQuality] || activeQuality) : "Nota Simple";
    return `${activeNote} ${qualName}`;
  };

  return (
    <aside className="cd-root">
      {/* ── Active Chord Display ── */}
      <div className="cd-block cd-block-active" style={{ minHeight: "140px", justifyContent: "center", display: "flex", flexDirection: "column" }}>
        <div className="cd-block-label" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <span>🎹 Sonido Activo</span>
          <div style={{ display: "flex", gap: "6px" }}>
            <span className={`cd-hand-badge ${screenLeftDetected ? "detected" : ""}`} style={{ fontSize: "10px", padding: "2px 6px" }}>
              {screenLeftDetected ? "Izq ✓" : "Izq —"}
            </span>
            <span className={`cd-hand-badge ${screenRightDetected ? "detected" : ""}`} style={{ fontSize: "10px", padding: "2px 6px" }}>
              {screenRightDetected ? "Der ✓" : "Der —"}
            </span>
          </div>
        </div>
        
        <div style={{ textAlign: "center", marginTop: "10px" }}>
          <div 
            style={{ 
              fontSize: "36px", 
              fontWeight: 800, 
              color: activeNote ? "#74ACDF" : "var(--text-secondary)",
              textShadow: activeNote ? "0 0 15px rgba(116, 172, 223, 0.5)" : "none",
              transition: "all 0.2s ease"
            }}
          >
            {getChordDisplayName()}
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "4px" }}>
            {activeNotes.length > 0 ? `Notas: ${activeNotes.join(" - ")}` : "Ninguna nota sonando"}
          </div>
        </div>
      </div>

      {/* ── Visual Piano Keyboard ── */}
      <div className="cd-block" style={{ padding: "16px 12px" }}>
        <div className="cd-block-label" style={{ marginBottom: "12px" }}>
          Visualizador de Teclas
        </div>
        
        <div 
          style={{ 
            display: "flex", 
            position: "relative", 
            height: "110px", 
            background: "rgba(0,0,0,0.3)", 
            borderRadius: "6px", 
            padding: "4px", 
            overflowX: "auto",
            border: "1px solid var(--border-glass)"
          }}
        >
          {pianoKeys.map(({ note, isBlack }) => {
            const isActive = activeNotes.includes(note);
            if (isBlack) return null; // We render white keys first, black keys absolute overlay
            
            // Check if there is a black key immediately after this white key (in chromatic order)
            const noteIdx = pianoKeys.findIndex(k => k.note === note);
            const nextKey = pianoKeys[noteIdx + 1];
            const hasBlackNext = nextKey && nextKey.isBlack;

            return (
              <div
                key={note}
                style={{
                  flex: "1 0 24px",
                  height: "100%",
                  background: isActive ? "linear-gradient(to bottom, #74ACDF, #ffffff)" : "#ffffff",
                  border: "1px solid #ccc",
                  borderRadius: "0 0 3px 3px",
                  position: "relative",
                  boxShadow: isActive ? "0 0 8px #74ACDF" : "none",
                  cursor: "pointer",
                  zIndex: 1
                }}
              >
                {/* Black key overlay */}
                {hasBlackNext && (
                  <div
                    style={{
                      position: "absolute",
                      top: 0,
                      left: "16px",
                      width: "14px",
                      height: "60%",
                      background: activeNotes.includes(nextKey.note) 
                        ? "linear-gradient(to bottom, #F6B800, #333)" 
                        : "#111111",
                      borderRadius: "0 0 2px 2px",
                      border: "1px solid #000",
                      zIndex: 2,
                      boxShadow: activeNotes.includes(nextKey.note) ? "0 0 8px #F6B800" : "none",
                    }}
                    title={nextKey.note}
                  />
                )}
                {/* Note Label at bottom */}
                <div
                  style={{
                    position: "absolute",
                    bottom: "2px",
                    width: "100%",
                    textAlign: "center",
                    fontSize: "8px",
                    color: isActive ? "#000" : "#888",
                    fontWeight: "bold"
                  }}
                >
                  {note.replace(/\d/, "")}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Synthesizer Control Panel ── */}
      <div className="cd-block">
        <div className="cd-block-label" style={{ marginBottom: "14px" }}>
          🎛️ Controles del Sintetizador
        </div>
        
        <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
          {/* Waveform Selector */}
          <div>
            <label style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
              FORMA DE ONDA
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "6px" }}>
              {(["sine", "triangle", "sawtooth", "square"] as WaveformType[]).map(w => (
                <button
                  key={w}
                  onClick={() => setWaveform(w)}
                  style={{
                    padding: "6px 2px",
                    fontSize: "10px",
                    background: waveform === w ? "rgba(116, 172, 223, 0.25)" : "rgba(255,255,255,0.04)",
                    color: waveform === w ? "#74ACDF" : "var(--text-primary)",
                    border: `1px solid ${waveform === w ? "#74ACDF" : "var(--border-glass)"}`,
                    borderRadius: "4px",
                    cursor: "pointer",
                    textTransform: "capitalize",
                    transition: "all 0.15s ease"
                  }}
                >
                  {w === "sine" && "Senoidal"}
                  {w === "triangle" && "Triang."}
                  {w === "sawtooth" && "Sierra"}
                  {w === "square" && "Cuadrada"}
                </button>
              ))}
            </div>
          </div>

          {/* Octave Range */}
          <div>
            <label style={{ fontSize: "11px", color: "var(--text-secondary)", display: "block", marginBottom: "6px" }}>
              OCTAVA BASE
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "6px" }}>
              {[3, 4, 5].map(o => (
                <button
                  key={o}
                  onClick={() => setOctave(o)}
                  style={{
                    padding: "6px 2px",
                    fontSize: "11px",
                    background: octave === o ? "rgba(246, 184, 0, 0.25)" : "rgba(255,255,255,0.04)",
                    color: octave === o ? "#F6B800" : "var(--text-primary)",
                    border: `1px solid ${octave === o ? "#F6B800" : "var(--border-glass)"}`,
                    borderRadius: "4px",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
                  }}
                >
                  Octava {o} {o === 3 && "(Grave)"} {o === 4 && "(Media)"} {o === 5 && "(Aguda)"}
                </button>
              ))}
            </div>
          </div>

          {/* Snap Option */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "4px" }}>
            <div>
              <span style={{ fontSize: "13px", fontWeight: "bold", display: "block" }}>Ajuste Visual (Snap)</span>
              <span style={{ fontSize: "10px", color: "var(--text-secondary)" }}>Alinear guías de dedo al centro del sector</span>
            </div>
            <label className="switch" style={{ position: "relative", display: "inline-block", width: "40px", height: "20px" }}>
              <input 
                type="checkbox" 
                checked={snap} 
                onChange={(e) => setSnap(e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span 
                style={{
                  position: "absolute",
                  cursor: "pointer",
                  top: 0, left: 0, right: 0, bottom: 0,
                  backgroundColor: snap ? "#74ACDF" : "rgba(255,255,255,0.15)",
                  borderRadius: "20px",
                  transition: "0.3s",
                }}
              >
                <span 
                  style={{
                    position: "absolute",
                    content: "''",
                    height: "14px", width: "14px",
                    left: snap ? "22px" : "4px",
                    bottom: "3px",
                    backgroundColor: "white",
                    borderRadius: "50%",
                    transition: "0.3s"
                  }}
                />
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* ── Status / Help ── */}
      <div className={`cd-status ${activeNote ? "playing" : ""}`}>
        <span className="cd-status-dot" style={{ backgroundColor: activeNote ? "#74ACDF" : "rgba(255,255,255,0.2)" }} />
        {activeNote 
          ? `🔊 Sonando: ${getChordDisplayName()}`
          : isPlaying 
            ? "Levanta las manos frente a las ruedas" 
            : "Presiona Iniciar para activar cámara y sintetizador"}
      </div>
    </aside>
  );
}
