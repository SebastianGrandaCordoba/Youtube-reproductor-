import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Activity, ArrowDown, ArrowRight, ArrowUp, AudioLines, Check, Disc3, ExternalLink, ListMusic, LoaderCircle, Pause, Play, Plus, Search, Shuffle, SkipBack, SkipForward, Trash2, Youtube } from 'lucide-react';
import { DoublyLinkedList } from './structures/DoublyLinkedList';
import type { Track } from './types';
import YouTubeFrame, { type YouTubePlayer } from './components/YouTubeFrame';

const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:4000';
type AddPosition = 'start' | 'end' | number;
type SearchTrack = Track & { youtubeId: string };
const formatTime = (seconds: number) => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');

function Cover({ track, className = '' }: { track: Track; className?: string }) {
  return <img className={className} src={track.cover} alt="" loading="lazy" />;
}

export default function App() {
  const listRef = useRef(new DoublyLinkedList<Track>());
  const [tracks, setTracks] = useState<Track[]>([]);
  const [current, setCurrent] = useState<Track | null>(null);
  const [player, setPlayer] = useState<YouTubePlayer | null>(null);
  const [youtubeReady, setYoutubeReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const [repeat, setRepeat] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<SearchTrack[]>([]);
  const [loading, setLoading] = useState(false);
  const [apiConfigured, setApiConfigured] = useState(false);
  const [addPosition, setAddPosition] = useState<AddPosition>('end');
  const [toast, setToast] = useState('');
  const [toastError, setToastError] = useState(false);

  const notify = useCallback((message: string, isError = false) => {
    setToast(message); setToastError(isError);
    window.setTimeout(() => setToast(''), 3600);
  }, []);
  const sync = useCallback(() => {
    const list = listRef.current;
    setTracks(list.toArray());
    setCurrent(list.current?.value ?? null);
  }, []);

  useEffect(() => {
    // Start every browser session with a clean queue and remove data saved by older builds.
    localStorage.removeItem('waveframe-queue-v1');
    sync();
    void fetch(apiBase + '/api/youtube/status').then((response) => response.json())
      .then((data: { configured?: boolean }) => setApiConfigured(Boolean(data.configured)))
      .catch(() => setApiConfigured(false));
  }, [sync]);

  useEffect(() => {
    if (!player || !current?.youtubeId || !playing) return;
    const timer = window.setInterval(() => {
      setPosition(player.getCurrentTime() || 0);
      setDuration(player.getDuration() || 0);
    }, 500);
    return () => window.clearInterval(timer);
  }, [player, current?.youtubeId, playing]);

  useEffect(() => { if (player && current?.youtubeId) player.setVolume(volume * 100); }, [player, current?.youtubeId, volume]);

  const selectTrack = useCallback((track: Track) => {
    if (!listRef.current.setCurrentById(track.id)) return;
    setPosition(0); setDuration(0); setPlaying(true); sync();
  }, [sync]);

  const step = useCallback((direction: 'next' | 'previous') => {
    const list = listRef.current;
    if (!list.size) return;
    let nextNode;
    if (shuffle && direction === 'next' && list.size > 1) {
      do { nextNode = list.nodeAt(Math.floor(Math.random() * list.size)); }
      while (nextNode === list.current);
      list.current = nextNode;
    } else {
      nextNode = direction === 'next' ? list.moveNext(repeat) : list.movePrevious(repeat);
    }
    // moveNext/movePrevious leave the current pointer unchanged at the ends
    // when repeat is off, so detect that case instead of reloading the same
    // YouTube iframe (which could leave a stale/blank player surface).
    if (!nextNode || nextNode === list.current && !repeat && (direction === 'next' ? !nextNode.next : !nextNode.prev)) {
      setPlaying(false); setPosition(0); return;
    }
    setPosition(0); setDuration(0); setPlaying(true); sync();
  }, [repeat, shuffle, sync]);

  const addTrack = useCallback((track: Track, where: AddPosition = 'end') => {
    const list = listRef.current;
    if (list.indexOfId(track.id) >= 0) { notify('Ese video ya está en tu fila.', true); return; }
    if (where === 'start') list.addFirst(track);
    else if (where === 'end') list.addLast(track);
    else list.insertAt(track, Math.max(0, Math.min(where, list.size)));
    sync(); notify('“' + track.title + '” se agregó a tu fila.');
  }, [notify, sync]);

  const reorder = (id: string, direction: -1 | 1) => {
    const list = listRef.current;
    const from = list.indexOfId(id), to = from + direction;
    if (from < 0 || to < 0 || to >= list.size) return;
    const item = list.removeAt(from);
    if (item) list.insertAt(item, to);
    sync();
  };
  const removeTrack = (id: string) => {
    const removingCurrent = listRef.current.current?.value.id === id;
    listRef.current.removeById(id);
    if (removingCurrent) {
      setPlaying(Boolean(listRef.current.current));
      setPosition(0);
      setDuration(0);
    }
    sync(); notify('Pista eliminada.');
  };
  const clearQueue = () => {
    player?.pauseVideo();
    listRef.current.clear(); setTracks([]); setCurrent(null); setPlayer(null);
    setPlaying(false); setPosition(0); setDuration(0); notify('Fila vaciada.');
  };

  const togglePlayback = () => {
    if (!current) return;
    if (!current.youtubeId) { notify('Elige un video de YouTube para reproducir.', true); return; }
    if (!player) { setPlaying(true); notify('Cargando el reproductor de YouTube…'); return; }
    if (playing) player.pauseVideo(); else player.playVideo();
  };
  const seek = (value: number) => {
    setPosition(value);
    if (current?.youtubeId) player?.seekTo(value, true);
  };

  const searchYouTube = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!search.trim()) return;
    setLoading(true); setResults([]);
    try {
      const response = await fetch(apiBase + '/api/youtube/search?q=' + encodeURIComponent(search.trim()));
      const data = await response.json() as { items?: SearchTrack[]; error?: string };
      if (!response.ok) throw new Error(data.error || 'La búsqueda falló (HTTP ' + response.status + ').');
      setResults(data.items ?? []);
      if (!data.items?.length) notify('No encontré videos insertables con esa búsqueda.');
    } catch (error) { notify(error instanceof Error ? error.message : 'No se pudo buscar en YouTube.', true); }
    finally { setLoading(false); }
  };
  const totalDuration = useMemo(() => tracks.reduce((total, track) => total + (track.duration || 0), 0), [tracks]);

  return (
    <div className="wave-app">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="Waveframe inicio"><span className="brand-symbol"><AudioLines size={20} /></span><span>waveframe<small>VIDEO MUSIC PLAYER</small></span></a>
        <div className="sidebar-label">TU ESPACIO</div>
        <button className="nav-item active"><Disc3 size={17} /><span>Reproductor</span></button>
        <button className="nav-item" onClick={() => document.getElementById('queue')?.scrollIntoView({ behavior: 'smooth' })}><ListMusic size={17} /><span>Tu fila</span><b>{String(tracks.length).padStart(2, '0')}</b></button>
        <button className="nav-item" onClick={() => document.getElementById('youtube-search')?.focus()}><Search size={17} /><span>Buscar videos</span></button>
        <div className="sidebar-rule" />
        <div className="sidebar-label">MEZCLA</div>
        <button className={'nav-item ' + (shuffle ? 'selected' : '')} onClick={() => setShuffle((value) => !value)}><Shuffle size={17} /><span>Aleatorio</span></button>
        <button className={'nav-item ' + (repeat ? 'selected' : '')} onClick={() => setRepeat((value) => !value)}><Activity size={17} /><span>Repetir</span></button>
        <div className="sidebar-bottom"><span className="online-dot" /> Búsqueda de YouTube<small>La fila se reinicia al abrir</small></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div><span className="eyebrow">UN VIDEO DESPUÉS DEL OTRO</span><span className="topbar-title">/ Tu sesión</span></div><span className="topbar-badge"><span className="online-dot" /> LISTO PARA EXPLORAR</span></header>
        <div className="content-grid">
          <section className="primary-column">
            <div className="intro">
              <div><span className="eyebrow accent-eyebrow">YOUTUBE · TU FILA · LISTA DOBLE</span><h1>El sonido<br />también <em>se ve.</em></h1><p>Busca un video público, añádelo a tu fila y deja que la lista marque el siguiente paso.</p></div>
              <div className="intro-stamp"><Youtube size={22} /><span>BUSCA<br />Y REPRODUCE</span></div>
            </div>

            <section className="player-card">
              <div className="player-card-top"><span><i className="playing-dot" /> {playing ? 'EN REPRODUCCIÓN' : 'AHORA EN TU FILA'}</span><span>{current ? 'YOUTUBE VIDEO' : 'SIN CANCIÓN'} <b>·</b> {current ? String(Math.max(1, listRef.current.indexOfId(current.id) + 1)).padStart(2, '0') : '00'} / {String(tracks.length).padStart(2, '0')}</span></div>
              <div className="media-stage">
                {current?.youtubeId ? <YouTubeFrame videoId={current.youtubeId} autoplay={playing} onReady={(yt) => { yt.setVolume(volume * 100); setPlayer(yt); setYoutubeReady(true); setDuration(yt.getDuration() || 0); if (playing) yt.playVideo(); }} onDispose={() => { setPlayer(null); setYoutubeReady(false); }} onStateChange={(state, yt) => {
                  if (state === 1) { setPlaying(true); setDuration(yt.getDuration() || 0); }
                  else if (state === 2) setPlaying(false);
                  else if (state === 0) { if (repeat) { yt.seekTo(0, true); yt.playVideo(); } else step('next'); }
                }} onError={(code) => notify(code === 101 || code === 150 ? 'Ese video no permite reproducción dentro de otras páginas. Prueba otro resultado.' : 'YouTube no pudo cargar el video (' + code + ').', true)} />
                : <div className="empty-player-stage"><Youtube size={25} /><span>Busca un video y añádelo a tu fila para empezar.</span></div>}
              </div>
              <div className="player-info">{current ? <Cover track={current} className="current-cover" /> : <div className="current-cover current-cover-empty"><Youtube size={17} /></div>}<div className="current-copy"><span className="eyebrow">SELECCIÓN ACTUAL</span><strong>{current?.title ?? 'Nada seleccionado'}</strong><small>{current?.artist ?? 'Añade una canción desde YouTube'}</small></div><div className="player-source"><span className="online-dot" />{current ? 'VIDEO DE YOUTUBE' : 'SIN REPRODUCCIÓN'}</div></div>
              <div className="seek-row"><span>{formatTime(position)}</span><input aria-label="Posición de reproducción" type="range" min="0" max={Math.max(duration, 1)} value={Math.min(position, duration || 0)} onChange={(event) => seek(Number(event.target.value))} /><span>{formatTime(duration || current?.duration || 0)}</span></div>
              <div className="control-row">
                <button className={'quiet-control ' + (shuffle ? 'on' : '')} onClick={() => setShuffle((value) => !value)} aria-label="Aleatorio"><Shuffle size={19} /></button>
                <button className="skip-control" onClick={() => step('previous')} aria-label="Anterior"><SkipBack size={21} fill="currentColor" /></button>
                <button className="play-control" onClick={togglePlayback} aria-label={playing ? 'Pausar' : 'Reproducir'}>{playing ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}</button>
                <button className="skip-control" onClick={() => step('next')} aria-label="Siguiente"><SkipForward size={21} fill="currentColor" /></button>
                <button className={'quiet-control ' + (repeat ? 'on' : '')} onClick={() => setRepeat((value) => !value)} aria-label="Repetir"><Activity size={19} /></button>
              </div>
              <div className="player-card-foot"><span><Youtube size={13} /> REPRODUCTOR OFICIAL INTEGRADO</span><label className="volume-control">VOL <input aria-label="Volumen" type="range" min="0" max="1" step="0.01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} /></label><span>{current && !youtubeReady ? 'CARGANDO VIDEO…' : 'LISTO PARA SONAR'}</span></div>
            </section>

            <section className="queue-section" id="queue">
              <div className="section-head"><div><span className="eyebrow">CONEXIONES ENTRE NODOS</span><h2>Tu fila <em>{String(tracks.length).padStart(2, '0')}</em></h2></div><div className="queue-actions"><button className="outline-button" onClick={() => { document.getElementById('youtube-search')?.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><Plus size={15} /> Añadir</button><button className="text-button" onClick={clearQueue} disabled={!tracks.length}>Vaciar</button></div></div>
              <div className="queue-table">
                <div className="table-head"><span># / PISTA</span><span>ORIGEN</span><span>ENLACES DEL NODO</span><span /></div>
                {tracks.map((track, index) => {
                  const node = listRef.current.nodeAt(index);
                  return <div className={'queue-row ' + (current?.id === track.id ? 'current-row' : '')} key={track.id}>
                    <button className="track-pick" onClick={() => selectTrack(track)}><span className="track-index">{String(index + 1).padStart(2, '0')}</span><Cover track={track} className="queue-cover" /><span className="track-titles"><b>{track.title}</b><small>{track.artist}</small></span></button>
                    <span className="source-label"><Youtube size={13} /> YouTube</span>
                    <div className="node-links"><span>{node?.prev?.value.title ?? '∅'}</span><b>⇄</b><span>{node?.next?.value.title ?? '∅'}</span></div>
                    <div className="row-actions"><button onClick={() => reorder(track.id, -1)} disabled={index === 0} aria-label="Subir"><ArrowUp size={14} /></button><button onClick={() => reorder(track.id, 1)} disabled={index === tracks.length - 1} aria-label="Bajar"><ArrowDown size={14} /></button><button onClick={() => removeTrack(track.id)} aria-label="Eliminar"><Trash2 size={14} /></button></div>
                  </div>;
                })}
                {!tracks.length && <div className="empty-queue"><ListMusic size={23} /><b>La fila está vacía</b><span>Busca un video en YouTube para empezar.</span></div>}
              </div>
              <div className="queue-caption"><span>⠿ LISTA DOBLEMENTE ENLAZADA · HEAD ⇄ TAIL</span><span>La vista se actualiza con cada nodo</span></div>
            </section>
          </section>

          <aside className="discover-column">
            <section className="search-card">
              <div className="side-card-heading"><span className="eyebrow">EXPLORA EL CATÁLOGO PÚBLICO</span><Youtube size={20} /></div>
              <h2>Busca tu<br /><em>próxima canción.</em></h2>
              <p>Videos públicos. Al reproducir, el video y su audio se muestran aquí mismo.</p>
              <form className="search-form" onSubmit={searchYouTube}><Search size={17} /><input id="youtube-search" aria-label="Buscar videos en YouTube" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Canción, artista o video…" /><button type="submit" disabled={loading || !apiConfigured} aria-label="Buscar">{loading ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={17} />}</button></form>
              <div className={'api-status ' + (apiConfigured ? 'configured' : '')}><span className="online-dot" />{apiConfigured ? 'YOUTUBE SEARCH LISTO' : 'FALTA CONFIGURAR API KEY'}</div>
              {!apiConfigured && <div className="setup-note">Para buscar videos públicos, configura <code>YOUTUBE_API_KEY</code> en el backend.</div>}
              <label className="position-label">AÑADIR RESULTADOS EN<select value={addPosition === 'start' || addPosition === 'end' ? addPosition : String(addPosition)} onChange={(event) => setAddPosition(event.target.value === 'start' || event.target.value === 'end' ? event.target.value : Number(event.target.value))}><option value="end">Al final de la fila</option><option value="start">Al inicio de la fila</option>{tracks.map((track, index) => <option value={index} key={track.id}>Posición {index + 1} · antes de {track.title}</option>)}</select></label>
              <div className="results-list">
                {results.map((track) => <article className="result-card" key={track.id}><img src={track.cover} alt="" /><div className="result-copy"><b>{track.title}</b><small>{track.artist}</small><span><Youtube size={11} /> VIDEO INSERTABLE</span></div><button onClick={() => addTrack(track, addPosition)} aria-label={'Añadir ' + track.title}><Plus size={16} /></button></article>)}
                {!results.length && !loading && <div className="search-empty"><span className="search-empty-icon"><Search size={18} /></span><b>Tu siguiente pista vive en YouTube.</b><small>Escribe arriba para encontrar videos públicos.</small></div>}
                {loading && <div className="search-empty"><LoaderCircle className="spin" size={22} /><small>Buscando videos…</small></div>}
              </div>
            </section>
            <section className="stats-card"><div><span>PISTAS EN LA FILA</span><b>{String(tracks.length).padStart(2, '0')}</b></div><i /><div><span>DURACIÓN CONOCIDA</span><b>{formatTime(totalDuration)}</b></div><div className="stats-foot"><Check size={13} /> Videos públicos de YouTube</div></section>
            <section className="policy-card"><span className="eyebrow">REPRODUCCIÓN INSERTADA</span><p>El reproductor oficial de YouTube permanece visible. Algunos videos no permiten insertarse; si uno falla, prueba otro resultado.</p><a href="https://www.youtube.com/" target="_blank" rel="noreferrer">YouTube <ExternalLink size={13} /></a></section>
          </aside>
        </div>
        <footer className="app-footer"><span>WAVEFRAME PLAYER © 2026</span><span>HECHO PARA ESCUCHAR Y VER <AudioLines size={14} /></span><span>LISTA DOBLE · TYPESCRIPT</span></footer>
      </main>
      {toast && <div className={'toast ' + (toastError ? 'toast-error' : '')}><span>{toastError ? '!' : '✓'}</span>{toast}</div>}
    </div>
  );
}
