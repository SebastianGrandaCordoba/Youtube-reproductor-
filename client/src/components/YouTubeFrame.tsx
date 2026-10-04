import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    YT?: { Player: new (element: HTMLElement, options: Record<string, unknown>) => YouTubePlayer; PlayerState: { ENDED: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}

export interface YouTubePlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  setVolume(volume: number): void;
  destroy(): void;
}

type Props = {
  videoId: string;
  autoplay: boolean;
  onReady: (player: YouTubePlayer) => void;
  onDispose: () => void;
  onStateChange: (state: number, player: YouTubePlayer) => void;
  onError: (code: number) => void;
};

let apiPromise: Promise<void> | undefined;
function loadApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (!apiPromise) apiPromise = new Promise((resolve, reject) => {
    const prior = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { prior?.(); resolve(); };
    let script = document.querySelector<HTMLScriptElement>('script[data-youtube-iframe-api]');
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      script.dataset.youtubeIframeApi = 'true';
      script.onerror = () => reject(new Error('No se pudo cargar YouTube IFrame API.'));
      document.head.appendChild(script);
    }
    window.setTimeout(() => reject(new Error('YouTube IFrame API tardó demasiado.')), 15000);
  });
  return apiPromise;
}

export default function YouTubeFrame({ videoId, autoplay, onReady, onDispose, onStateChange, onError }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const callbacks = useRef({ onReady, onDispose, onStateChange, onError });
  callbacks.current = { onReady, onDispose, onStateChange, onError };

  useEffect(() => {
    let active = true;
    void loadApi().then(() => {
      if (!active || !hostRef.current || !window.YT?.Player) return;
      const host = hostRef.current;
      const player = new window.YT.Player(host, {
        width: '100%', height: '100%', videoId,
        playerVars: { autoplay: 0, controls: 1, playsinline: 1, rel: 0, enablejsapi: 1, origin: window.location.origin },
        events: {
          onReady: (event: { target: YouTubePlayer }) => { if (!active) return; playerRef.current = event.target; callbacks.current.onReady(event.target); },
          onStateChange: (event: { data: number; target: YouTubePlayer }) => callbacks.current.onStateChange(event.data, event.target),
          onError: (event: { data: number }) => callbacks.current.onError(event.data),
        },
      });
      playerRef.current = player;
    }).catch(() => { if (active) callbacks.current.onError(-1); });
    return () => {
      active = false;
      try { playerRef.current?.destroy(); } catch { /* The iframe may not have finished mounting. */ }
      playerRef.current = null;
      callbacks.current.onDispose();
    };
  }, [videoId]);

  useEffect(() => { if (autoplay) playerRef.current?.playVideo(); }, [autoplay]);
  return <div className="youtube-frame" ref={hostRef} aria-label="Video de YouTube" />;
}
