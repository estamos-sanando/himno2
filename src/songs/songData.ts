// Song data registry for the Web Conductor app
// Updated to expose the Argentine National Anthem MP3 as the active track.

export interface NoteEvent {
  time: string;
  note: string | string[] | null;
  duration: string;
  velocity?: number;
}

export interface SongTrack {
  id: string;
  label: string;
  synthType: "melody" | "bass" | "pad" | "drums";
  notes: NoteEvent[];
  loopLength: string;
}

export interface Song {
  id: string;
  name: string;
  artist: string;
  bpmBase: number;
  tracks: SongTrack[];
  color: string;
  emoji: string;
}

export const SONGS: Song[] = [
  {
    id: "himno-argentina",
    name: "Himno Nacional Argentino",
    artist: "Blas Parera · Vicente López y Planes (1813)",
    bpmBase: 90,
    color: "#74ACDF", // Azul celeste argentino
    emoji: "🇦🇷",
    tracks: [] // Emtpy since it's playing a high-quality MP3 recording
  }
];
