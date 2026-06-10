import { useEffect, useRef, useCallback } from "react";
import * as Tone from "tone";

export type WaveformType = "sine" | "triangle" | "sawtooth" | "square";

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
  const activeNotesRef = useRef<string[]>([]);
  const currentOscillatorTypeRef = useRef<WaveformType>("sine");
  const currentOctaveRef = useRef<number>(4);

  const initSynth = useCallback(async () => {
    if (synthRef.current) return;
    
    await Tone.start();
    
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: {
        type: currentOscillatorTypeRef.current,
      },
      envelope: {
        attack: 0.08,
        decay: 0.1,
        sustain: 0.8,
        release: 0.2,
      },
    }).toDestination();
    
    // Set a moderate volume level to prevent clipping and ear fatigue (-15 dB)
    synth.volume.value = -15;
    synthRef.current = synth;
    console.log("Sintetizador de acordes polifónico inicializado.");
  }, []);

  const playChord = useCallback(async (root: string, quality: string | null, octave: number) => {
    await initSynth();
    const synth = synthRef.current;
    if (!synth) return;

    if (currentOctaveRef.current !== octave) {
      currentOctaveRef.current = octave;
    }

    const newNotes = getChordNotes(root, quality, octave);

    // Sort to ensure stable array comparisons
    const currentNotes = [...activeNotesRef.current].sort();
    const targetNotes = [...newNotes].sort();

    // Check if the chord is identical to avoid trigger spamming
    if (JSON.stringify(currentNotes) === JSON.stringify(targetNotes)) {
      return;
    }

    // Release notes that are no longer part of the new chord
    const notesToRelease = activeNotesRef.current.filter(n => !newNotes.includes(n));
    // Attack notes that are new
    const notesToAttack = newNotes.filter(n => !activeNotesRef.current.includes(n));

    if (notesToRelease.length > 0) {
      try {
        synth.triggerRelease(notesToRelease);
      } catch (err) {
        console.error("Error at releasing notes:", err);
      }
    }

    if (notesToAttack.length > 0) {
      try {
        synth.triggerAttack(notesToAttack);
      } catch (err) {
        console.error("Error at attacking notes:", err);
      }
    }

    activeNotesRef.current = newNotes;
  }, [initSynth]);

  const stopAll = useCallback(() => {
    const synth = synthRef.current;
    if (synth && activeNotesRef.current.length > 0) {
      try {
        synth.triggerRelease(activeNotesRef.current);
      } catch (err) {
        console.error("Error at releasing all notes:", err);
      }
      activeNotesRef.current = [];
    }
  }, []);

  const setWaveform = useCallback((type: WaveformType) => {
    currentOscillatorTypeRef.current = type;
    if (synthRef.current) {
      synthRef.current.set({
        oscillator: { type }
      });
    }
  }, []);

  useEffect(() => {
    return () => {
      if (synthRef.current) {
        synthRef.current.dispose();
        synthRef.current = null;
      }
    };
  }, []);

  return { playChord, stopAll, setWaveform };
}
