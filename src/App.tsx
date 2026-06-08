import { useState, useRef, useCallback, useEffect } from "react";
import { SONGS } from "./songs/songData";
import type { Song } from "./songs/songData";
import { useHandTracking } from "./hooks/useHandTracking";
import type { HandGesture } from "./hooks/useHandTracking";
import { useAudioEngine } from "./hooks/useAudioEngine";
import type { HandLandmarkerResult } from "@mediapipe/tasks-vision";
import WebcamPreview from "./components/WebcamPreview";
import ConductorDashboard from "./components/ConductorDashboard";
import "./App.css";

// BPM range mapped from hand vertical position
const BPM_MIN = 50;
const BPM_MAX = 180;

// Hand vertical range for comfortable tracking (clamped to 0..1 volume / bpm range)
const Y_MIN = 0.35;
const Y_MAX = 0.70;

// UI flush throttle (ms) — audio runs at full 60 fps via refs
const UI_THROTTLE_MS = 80;

export default function App() {
  const [selectedSong, setSelectedSong] = useState<Song>(SONGS[0]);
  const [isPlaying,    setIsPlaying]    = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [showIntro,    setShowIntro]    = useState(true);

  // UI display state (throttled ~12 fps)
  const [bpm,           setBpm]           = useState(SONGS[0].bpmBase);
  const [volume,        setVolume]        = useState(0.7);
  const [rightDetected, setRightDetected] = useState(false);
  const [leftDetected,  setLeftDetected]  = useState(false);
  const [landmarks,     setLandmarks]     = useState<HandLandmarkerResult | null>(null);
  const [showHelp,      setShowHelp]      = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const vuBarsRef = useRef<HTMLDivElement>(null);
  const engine   = useAudioEngine();
  const engineRef = useRef(engine);
  engineRef.current = engine;

  // Smooth values — live at 60 fps, no React state
  const smoothVolRef = useRef(0.7);
  const smoothBPMRef = useRef(SONGS[0].bpmBase);
  const lastUIFlush  = useRef(0);
  const lastRestartRef = useRef(0);

  const handleRestart = useCallback(async () => {
    console.log("Restarting song due to right hand closed fist gesture");
    engine.stop();
    await engine.start(selectedSong);
    smoothVolRef.current = 0.7;
    smoothBPMRef.current = selectedSong.bpmBase;
    setVolume(0.7);
    setBpm(selectedSong.bpmBase);
  }, [engine, selectedSong]);

  /**
   * Gesture handler — runs at ~60 fps.
   */
  const onGesture = useCallback((g: HandGesture) => {
    // ── Volume: screen-LEFT hand (physical left hand) ──────────
    if (g.leftHand.detected) {
      const norm = Math.max(0, Math.min(1, (Y_MAX - g.leftHand.y) / (Y_MAX - Y_MIN)));
      smoothVolRef.current = smoothVolRef.current * 0.85 + norm * 0.15;
    }

    // ── Tempo: screen-RIGHT hand (physical right hand) ───────────
    if (g.rightHand.detected) {
      const norm = Math.max(0, Math.min(1, (Y_MAX - g.rightHand.y) / (Y_MAX - Y_MIN)));
      const target = BPM_MIN + norm * (BPM_MAX - BPM_MIN);
      smoothBPMRef.current = smoothBPMRef.current * 0.85 + target * 0.15;
    }

    // ── Right hand closed fist restart ──
    if (g.rightHand.detected && g.rightHand.isClosed) {
      const now = performance.now();
      if (now - lastRestartRef.current > 3000) {
        lastRestartRef.current = now;
        handleRestart();
      }
    }

    // Push to audio engine at full 60 fps (no React state!)
    engineRef.current.update({
      volume: smoothVolRef.current,
      bpm:    smoothBPMRef.current,
    });

    // Throttled UI flush
    const now = performance.now();
    if (now - lastUIFlush.current >= UI_THROTTLE_MS) {
      lastUIFlush.current = now;
      setRightDetected(g.rightHand.detected);
      setLeftDetected(g.leftHand.detected);
      setLandmarks(g.landmarks);
      setVolume(smoothVolRef.current);
      setBpm(Math.round(smoothBPMRef.current));
    }
  }, [handleRestart, selectedSong]);

  useHandTracking(videoRef, onGesture, trackingEnabled);

  // Real-time audio VU loop
  useEffect(() => {
    if (!isPlaying) return;

    let active = true;
    const updateVUBars = () => {
      if (!active) return;

      const level = engineRef.current.getLevel(); // 0..1
      const container = vuBarsRef.current;
      if (container) {
        const bars = container.children;
        const total = bars.length;
        for (let i = 0; i < total; i++) {
          const bar = bars[i] as HTMLDivElement;
          const threshold = (total - 1 - i) / (total - 1);
          const lit = level >= threshold;
          bar.style.opacity = lit ? "1" : "0.1";
          if (lit) {
            const hue = 120 - (i / (total - 1)) * 120;
            bar.style.background = `hsl(${hue}, 100%, 55%)`;
            bar.style.boxShadow = `0 0 6px hsl(${hue}, 100%, 55%)`;
          } else {
            bar.style.background = "";
            bar.style.boxShadow = "";
          }
        }
      }

      requestAnimationFrame(updateVUBars);
    };

    requestAnimationFrame(updateVUBars);

    return () => {
      active = false;
    };
  }, [isPlaying]);

  const handleStart = useCallback(async () => {
    await engine.start(selectedSong);
    setIsPlaying(true);
    setTrackingEnabled(true);
    setShowIntro(false);
  }, [engine, selectedSong]);

  const handleStop = useCallback(() => {
    engine.stop();
    setIsPlaying(false);
    setTrackingEnabled(false);
  }, [engine]);

  const handleSongSelect = useCallback(async (song: Song) => {
    engine.stop();
    setSelectedSong(song);
    setIsPlaying(false);
    setTrackingEnabled(false);
    smoothBPMRef.current = song.bpmBase;
    setBpm(song.bpmBase);
  }, [engine]);

  return (
    <div className="app-root">
      {/* ── Patriotic flag banner ── */}
      <div
        className="patriotic-banner"
        style={{
          height: "6px",
          background: "linear-gradient(to bottom, #74ACDF 0%, #74ACDF 33.3%, #FFFFFF 33.3%, #FFFFFF 66.6%, #74ACDF 66.6%, #74ACDF 100%)",
          width: "100%",
          flexShrink: 0
        }}
      />

      {/* ── Intro ── */}
      {showIntro && (
        <div className="intro-overlay">
          <div className="intro-card">
            <img
              src="/escudo-argentino.png"
              alt="Escudo Nacional Argentino"
              style={{
                width: "120px",
                height: "auto",
                marginBottom: "20px",
                filter: "drop-shadow(0 0 12px rgba(116, 172, 223, 0.4))"
              }}
            />
            <h1 className="intro-title">Web Conductor</h1>
            <p className="intro-subtitle">Dirige la música con el movimiento de tus manos</p>
            <ul className="intro-features">
              <li>
                <span>🔵</span>
                <div>
                  <strong>Mano izquierda</strong> (lado izquierdo de pantalla)<br />
                  Sube = más volumen · Baja = menos volumen
                </div>
              </li>
              <li>
                <span>🟣</span>
                <div>
                  <strong>Mano derecha</strong> (lado derecho de pantalla)<br />
                  Sube = más rápido · Baja = más lento
                </div>
              </li>
            </ul>
            <p className="intro-note">Se solicitará acceso a tu cámara</p>
            <button
              id="btn-start-conductor"
              className="btn-primary btn-large"
              onClick={handleStart}
            >
              <span>🇦🇷</span> Iniciar Experiencia
            </button>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-brand">
          <img
            src="/escudo-argentino.png"
            alt="Escudo Nacional Argentino"
            style={{ width: "24px", height: "auto", marginRight: "6px" }}
          />
          <span className="header-title">Web Conductor</span>
        </div>
        <div className="header-song" style={{ "--accent": selectedSong.color } as React.CSSProperties}>
          <span>{selectedSong.emoji}</span>
          <span>{selectedSong.name}</span>
          <span className="header-artist">— {selectedSong.artist}</span>
        </div>
        <div className="header-actions">
          <button
            id="btn-help"
            className="btn-primary"
            style={{
              marginRight: "10px",
              background: "rgba(255, 255, 255, 0.08)",
              color: "var(--text-primary)",
              border: "1px solid var(--border-glass)",
            }}
            onClick={() => setShowHelp(true)}
          >
            ❓ Ayuda
          </button>
          {isPlaying
            ? <button id="btn-stop"  className="btn-danger"  onClick={handleStop}>⏹ Detener</button>
            : <button id="btn-play"  className="btn-primary" onClick={handleStart}>▶ Iniciar</button>}
        </div>
      </header>

      {/* ── Main ── */}
      <main className="app-main">
        <section className="panel-webcam">
          <h2 className="panel-heading">📷 Cámara</h2>
          <WebcamPreview videoRef={videoRef} landmarkerResult={landmarks} getLevel={engine.getLevel} />
        </section>

        <ConductorDashboard
          songs={SONGS}
          selectedSong={selectedSong}
          onSelect={handleSongSelect}
          bpm={bpm}
          volume={volume}
          isPlaying={isPlaying}
          screenLeftDetected={leftDetected}
          screenRightDetected={rightDetected}
          vuBarsRef={vuBarsRef}
        />
      </main>

      {/* ── Help Modal ── */}
      {showHelp && (
        <div className="intro-overlay" style={{ zIndex: 150 }}>
          <div className="intro-card" style={{ position: "relative", maxWidth: "520px" }}>
            <button
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "none",
                border: "none",
                color: "var(--text-secondary)",
                fontSize: "20px",
                cursor: "pointer"
              }}
              onClick={() => setShowHelp(false)}
            >
              ✕
            </button>
            <img
              src="/escudo-argentino.png"
              alt="Escudo Nacional Argentino"
              style={{
                width: "80px",
                height: "auto",
                margin: "0 auto 16px block",
                display: "block",
                filter: "drop-shadow(0 0 8px rgba(116, 172, 223, 0.3))"
              }}
            />
            <h2 className="intro-title" style={{ marginBottom: "20px" }}>Instrucciones de Dirección</h2>
            
            <ul className="intro-features" style={{ marginBottom: "24px" }}>
              <li>
                <span>🔵</span>
                <div>
                  <strong>Mano Izquierda (Volumen)</strong><br />
                  Aparece en el lado izquierdo de la pantalla. Sube para aumentar el volumen (hasta 100%) y baja para atenuar (hasta silencio).
                </div>
              </li>
              <li>
                <span>🟣</span>
                <div>
                  <strong>Mano Derecha (Tempo)</strong><br />
                  Aparece en el lado derecho de la pantalla. Sube para acelerar la velocidad de reproducción y baja para ir más lento.
                </div>
              </li>
              <li>
                <span>✊</span>
                <div>
                  <strong>Puño Cerrado Derecho (Reiniciar)</strong><br />
                  Cierra el puño de tu mano derecha (lado de tempo) para reiniciar la canción al instante al volumen y tempo originales.
                </div>
              </li>
            </ul>
            
            <button className="btn-primary" style={{ width: "100%", justifyContent: "center" }} onClick={() => setShowHelp(false)}>
              Entendido
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
