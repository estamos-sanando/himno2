import { useEffect, useRef, useCallback } from "react";
import * as Tone from "tone";

export type WaveformType = "sine" | "triangle" | "sawtooth" | "square" | "piano";

export const CHROMATIC = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export const CHORD_INTERVALS: Record<string, number[]> = {
  "maj": [0, 4, 7],      // Major triad
  "min": [0, 3, 7],      // Minor triad
  "7": [0, 4, 7, 10],    // Dominant 7th
  "m7": [0, 3, 7, 10],   // Minor 7th
  "maj7": [0, 4, 7, 11], // Major 7th
  "dim": [0, 3, 6],      // Diminished triad
  "aug": [0, 4, 8],      // Augmented triad
};

export function getChordNotes(root: string, quality: string | null, octave: number): string[] {
  const rootIdx = CHROMATIC.indexOf(root);
  if (rootIdx === -1) return [];

  // If quality is "OFF" or not recognized, just play the single root note
  const intervals = (quality && CHORD_INTERVALS[quality]) ? CHORD_INTERVALS[quality] : [0];

  return intervals.map(interval => {
    const idx = rootIdx + interval;
    const noteName = CHROMATIC[idx % 12];
    const noteOctave = octave + Math.floor(idx / 12);
    return `${noteName}${noteOctave}`;
  });
}

export function useChordSynth() {
  const synthRef = useRef<Tone.PolySynth | null>(null);
  const activeNotesRef    = useRef<string[]>([]);
  // Fast dedup key: "root:quality:octave" — avoids JSON.stringify at 60fps
  const lastChordKeyRef   = useRef<string>("");
  const currentOscillatorTypeRef = useRef<WaveformType>("piano"); // default → piano
  const currentOctaveRef  = useRef<number>(4);
  const filterRef         = useRef<Tone.Filter | null>(null);

  // Build synth & optionally chain a lowpass filter (for the 'piano' preset)
  const buildSynth = useCallback((type: WaveformType) => {
    const oscType: Tone.ToneOscillatorType = type === "piano" ? "triangle" : type;
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: oscType },
      envelope: {
        attack:  type === "piano" ? 0.01 : 0.08,
        decay:   type === "piano" ? 0.30 : 0.10,
        sustain: type === "piano" ? 0.40 : 0.80,
        release: type === "piano" ? 1.20 : 0.20,
      },
    });
    synth.volume.value = -15;

    if (type === "piano") {
      // Warm lowpass imitates piano body resonance
      const filter = new Tone.Filter(2800, "lowpass").toDestination();
      filterRef.current = filter;
      synth.connect(filter);
    } else {
      filterRef.current = null;
      synth.toDestination();
    }
    return synth;
  }, []);

  const initSynth = useCallback(async () => {
    if (synthRef.current) return;
    await Tone.start();
    synthRef.current = buildSynth(currentOscillatorTypeRef.current);
    console.log("Sintetizador de acordes polifónico inicializado.");
  }, [buildSynth]);

  const playChord = useCallback(async (root: string, quality: string | null, octave: number) => {
    await initSynth();
    const synth = synthRef.current;
    if (!synth) return;

    if (currentOctaveRef.current !== octave) {
      currentOctaveRef.current = octave;
    }

    // Fast dedup: skip everything if chord hasn't changed (runs at ~60fps)
    const chordKey = `${root}:${quality ?? ""}:${octave}`;
    if (chordKey === lastChordKeyRef.current) return;
    lastChordKeyRef.current = chordKey;

    const newNotes = getChordNotes(root, quality, octave);

    // Release notes no longer needed, attack only new ones
    const notesToRelease = activeNotesRef.current.filter(n => !newNotes.includes(n));
    const notesToAttack  = newNotes.filter(n => !activeNotesRef.current.includes(n));

    if (notesToRelease.length > 0) {
      try { synth.triggerRelease(notesToRelease); } catch { /* ignore */ }
    }
    if (notesToAttack.length > 0) {
      try { synth.triggerAttack(notesToAttack); } catch { /* ignore */ }
    }

    activeNotesRef.current = newNotes;
  }, [initSynth]);

  const stopAll = useCallback(() => {
    const synth = synthRef.current;
    if (synth && activeNotesRef.current.length > 0) {
      try { synth.triggerRelease(activeNotesRef.current); } catch { /* ignore */ }
      activeNotesRef.current = [];
    }
    lastChordKeyRef.current = "";
  }, []);

  const setWaveform = useCallback((type: WaveformType) => {
    currentOscillatorTypeRef.current = type;
    if (!synthRef.current) return;

    // Rebuild synth with new envelope + filter chain for 'piano' preset
    try {
      activeNotesRef.current = [];
      lastChordKeyRef.current = "";
      synthRef.current.releaseAll();
      synthRef.current.dispose();
      filterRef.current?.dispose();
      filterRef.current = null;
    } catch { /* ignore */ }
    synthRef.current = buildSynth(type);
  }, [buildSynth]);

  // Pre-initialize synth on mount so first chord plays without AudioContext startup delay
  useEffect(() => {
    // We can't await here but initSynth is safe to call multiple times
    initSynth().catch(() => { /* user hasn't interacted yet; will init on first play */ });

    return () => {
      if (synthRef.current) {
        try { synthRef.current.releaseAll(); synthRef.current.dispose(); } catch { /* ignore */ }
        synthRef.current = null;
      }
      filterRef.current?.dispose();
      filterRef.current = null;
    };
  }, [initSynth]);

  return { playChord, stopAll, setWaveform };
}
