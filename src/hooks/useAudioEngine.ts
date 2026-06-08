import { useEffect, useRef, useCallback } from "react";
import * as Tone from "tone";
import type { Song } from "../songs/songData";

export interface AudioControls {
  volume: number; // 0..1
  bpm:    number; // 40..220
}

export interface AudioEngineHandle {
  start:  (song: Song) => Promise<void>;
  stop:   () => void;
  update: (controls: AudioControls) => void;
  getLevel: () => number;
}

export function useAudioEngine(): AudioEngineHandle {
  const playerRef = useRef<Tone.Player | null>(null);
  const meterRef = useRef<Tone.Meter | null>(null);
  const isReadyRef = useRef(false);
  const isPlayingRef = useRef(false);

  const disposeAll = useCallback(() => {
    isPlayingRef.current = false;
    if (playerRef.current) {
      playerRef.current.stop();
      playerRef.current.dispose();
      playerRef.current = null;
    }
    if (meterRef.current) {
      meterRef.current.dispose();
      meterRef.current = null;
    }
    isReadyRef.current = false;
  }, []);

  const buildEngine = useCallback(() => {
    if (isReadyRef.current) return;
    
    // Create meter and player loading the MP3 file
    const meter = new Tone.Meter({ smoothing: 0.8 });
    const player = new Tone.Player({
      url: "/himno-argentino.mp3",
      loop: true,
      autostart: false,
      onload: () => {
        console.log("MP3 cargado correctamente!");
        if (isPlayingRef.current) {
          player.start();
        }
      },
      onerror: (err) => {
        console.error("Error al cargar el archivo de audio MP3:", err);
      }
    }).connect(meter).toDestination();

    playerRef.current = player;
    meterRef.current = meter;
    isReadyRef.current = true;
  }, []);

  const start = useCallback(async (song: Song) => {
    console.log("Iniciando reproducción de:", song.name);
    await Tone.start();
    isPlayingRef.current = true;
    buildEngine();
    
    if (playerRef.current && playerRef.current.loaded) {
      playerRef.current.start();
    }
  }, [buildEngine]);

  const stop = useCallback(() => {
    isPlayingRef.current = false;
    if (playerRef.current) {
      playerRef.current.stop();
    }
  }, []);

  const update = useCallback((controls: AudioControls) => {
    if (!isReadyRef.current || !playerRef.current) return;
    
    // Volume control (ramp to avoid pops/clicks)
    const db = controls.volume <= 0.01 ? -60 : Tone.gainToDb(controls.volume);
    playerRef.current.volume.rampTo(db, 0.08);

    // Tempo control: map BPM to playbackRate
    const baseBpm = 90;
    const rate = controls.bpm / baseBpm;
    playerRef.current.playbackRate = Math.max(0.5, Math.min(2.0, rate));
  }, []);

  const getLevel = useCallback(() => {
    if (!meterRef.current) return 0;
    const val = meterRef.current.getValue();
    const db = Array.isArray(val) ? val[0] : val;
    if (db === -Infinity || isNaN(db)) return 0;
    // Map -60dB..0dB to 0..1
    const norm = (db + 60) / 60;
    return Math.max(0, Math.min(1, norm));
  }, []);

  useEffect(() => {
    return () => disposeAll();
  }, [disposeAll]);

  return { start, stop, update, getLevel };
}
