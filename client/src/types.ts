export interface Track {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  accent: string;
  youtubeId?: string;
  localUrl?: string;
  localKind?: 'audio' | 'video';
}
