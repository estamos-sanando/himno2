import { useEffect, useState } from "react";

interface MusicPainterDashboardProps {
  onDeviceChange: (deviceId: string) => void;
  gain: number;
  onGainChange: (gain: number) => void;
  noiseGate: number;
  onNoiseGateChange: (gate: number) => void;
  selectedDeviceId: string;
}

export default function MusicPainterDashboard({
  onDeviceChange,
  gain,
  onGainChange,
  noiseGate,
  onNoiseGateChange,
  selectedDeviceId,
}: MusicPainterDashboardProps) {
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  // List all available audio input devices
  useEffect(() => {
    async function getDevices() {
      try {
        // Request temporary mic permissions to get device labels (if not already granted)
        await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => {});
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = allDevices.filter((d) => d.kind === "audioinput");
        setDevices(audioInputs);
        if (audioInputs.length > 0 && !selectedDeviceId) {
          // Select default or first device
          onDeviceChange(audioInputs[0].deviceId);
        }
      } catch (err) {
        console.error("Error enumerating audio inputs:", err);
      }
    }
    getDevices();
  }, [onDeviceChange, selectedDeviceId]);

  return (
    <div className="panel-dashboard" style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto" }}>
      <div className="dashboard-content" style={{ flex: 1, padding: "20px", display: "flex", flexDirection: "column", gap: "24px" }}>
        
        {/* Header */}
        <div>
          <h2 className="dashboard-title" style={{ margin: 0, fontSize: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
            🎨 Pintar con música
          </h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "12px", marginTop: "6px", lineHeight: "1.4" }}>
            Conectá tu instrumento o usá el micrófono para pintar arte generativo abstracto bioluminiscente.
          </p>
        </div>

        {/* Audio Input Selection */}
        <div className="card-glass" style={{ padding: "16px", borderRadius: "12px", border: "1px solid var(--border-glass)" }}>
          <label style={{ display: "block", fontSize: "11px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "8px" }}>
            🎙️ Entrada de Audio
          </label>
          <select
            value={selectedDeviceId}
            onChange={(e) => onDeviceChange(e.target.value)}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              background: "rgba(11, 13, 25, 0.8)",
              border: "1px solid var(--border-glass)",
              color: "#ffffff",
              fontSize: "13px",
              outline: "none",
              cursor: "pointer",
            }}
          >
            {devices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label || `Entrada ${d.deviceId.slice(0, 5)}...`}
              </option>
            ))}
          </select>
        </div>

        {/* Gain & Noise Gate controls */}
        <div className="card-glass" style={{ padding: "16px", borderRadius: "12px", border: "1px solid var(--border-glass)", display: "flex", flexDirection: "column", gap: "16px" }}>
          
          {/* Real-time Level Meter */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "6px" }}>
              <span>🎚️ Nivel de Entrada</span>
              <span id="painter-level-text" style={{ color: "#00E5FF" }}>0%</span>
            </div>
            <div style={{ height: "8px", background: "rgba(255,255,255,0.06)", borderRadius: "4px", overflow: "hidden", border: "1px solid var(--border-glass)", position: "relative" }}>
              <div
                id="painter-level-bar"
                style={{
                  height: "100%",
                  width: "0%",
                  background: "linear-gradient(90deg, #00E5FF, #FF007F)",
                  transition: "width 0.05s linear",
                }}
              />
              {/* Noise Gate threshold indicator */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${(noiseGate / 0.1) * 100}%`,
                  width: "2px",
                  background: "#FF007F",
                  boxShadow: "0 0 6px #FF007F",
                  pointerEvents: "none",
                }}
                title="Umbral de Puerta de Ruido"
              />
            </div>
          </div>

          {/* Gain Slider */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "6px" }}>
              <span>⚡ Amplificación (Ganancia)</span>
              <span style={{ color: "#ffffff" }}>{gain.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min="1.0"
              max="10.0"
              step="0.1"
              value={gain}
              onChange={(e) => onGainChange(parseFloat(e.target.value))}
              style={{
                width: "100%",
                accentColor: "#00E5FF",
                cursor: "pointer",
              }}
            />
          </div>

          {/* Noise Gate Slider */}
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "6px" }}>
              <span>🔇 Puerta de Ruido (Gate)</span>
              <span style={{ color: "#ffffff" }}>{(noiseGate * 1000).toFixed(0)}</span>
            </div>
            <input
              type="range"
              min="0.001"
              max="0.099"
              step="0.001"
              value={noiseGate}
              onChange={(e) => onNoiseGateChange(parseFloat(e.target.value))}
              style={{
                width: "100%",
                accentColor: "#FF007F",
                cursor: "pointer",
              }}
            />
          </div>
        </div>

        {/* Visualizer Guide Card */}
        <div className="card-glass" style={{ padding: "16px", borderRadius: "12px", border: "1px solid var(--border-glass)", fontSize: "12px", lineHeight: "1.5" }}>
          <span style={{ display: "block", fontSize: "11px", fontWeight: 700, letterSpacing: "1px", textTransform: "uppercase", color: "var(--text-secondary)", marginBottom: "10px" }}>
            🎓 Comportamiento Reactivo
          </span>
          <ul style={{ paddingLeft: "16px", margin: 0, display: "flex", flexDirection: "column", gap: "8px", color: "rgba(255, 255, 255, 0.75)" }}>
            <li>
              <strong style={{ color: "#00E5FF" }}>Graves (Low-End 40-200Hz)</strong>: Controlan la <strong>expansión y escala</strong> del núcleo fluido central. Un golpe de bajo o acorde gordo produce pulsaciones gigantes.
            </li>
            <li>
              <strong style={{ color: "#9D4EDD" }}>Medios/Agudos (200-2kHz)</strong>: Deforman el contorno del fluido con <strong>complejidad fractal y ondulaciones</strong>. Las notas más agudas agregan detalles intrincados.
            </li>
            <li>
              <strong style={{ color: "#FF007F" }}>Transitorios (Ataques)</strong>: El golpe de púa, dedo o percusión dispara <strong>ráfagas de partículas bioluminiscentes</strong> que salen despedidas de forma radial.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
