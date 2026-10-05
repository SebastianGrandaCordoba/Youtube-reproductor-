import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';

const app = express();
const port = Number(process.env.PORT || 4000);
const clientOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((origin) => origin.trim()).filter(Boolean);
const apiKey = process.env.YOUTUBE_API_KEY?.trim();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin(origin, callback) { if (!origin || clientOrigins.includes(origin)) return callback(null, true); return callback(new Error('Origin is not allowed by CORS.')); }, methods: ['GET', 'OPTIONS'], allowedHeaders: ['Content-Type'], maxAge: 86400 }));
app.use(express.json({ limit: '32kb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'waveframe-youtube-api' }));
app.get('/api/youtube/status', (_req, res) => res.json({ configured: Boolean(apiKey) }));
app.get('/api/youtube/search', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim().slice(0, 120);
    if (!query) return res.status(400).json({ error: 'Escribe una canción o artista para buscar.' });
    if (!apiKey) return res.status(503).json({ error: 'La búsqueda aún no está configurada. Falta YOUTUBE_API_KEY en el backend.' });
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.search = new URLSearchParams({ key: apiKey, part: 'snippet', q: query, type: 'video', videoEmbeddable: 'true', maxResults: '8', safeSearch: 'moderate' }).toString();
    const response = await fetch(url);
    const payload = await response.json().catch(() => ({})) as { items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> } }>; error?: { message?: string } };
    if (!response.ok) {
      const message = response.status === 403 ? 'YouTube rechazó la búsqueda. Revisa la API de YouTube Data v3, la clave y su cuota.' : payload.error?.message || 'YouTube no pudo completar la búsqueda.';
      return res.status(response.status === 403 ? 502 : response.status).json({ error: message });
    }
    const items = (payload.items || []).flatMap((item) => {
      const youtubeId = item.id?.videoId;
      if (!youtubeId) return [];
      const snippet = item.snippet || {};
      return [{ id: `youtube-${youtubeId}`, youtubeId, title: snippet.title || 'Video de YouTube', artist: snippet.channelTitle || 'YouTube', album: 'YouTube', duration: 0, cover: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`, accent: '#bf75ef' }];
    });
    res.json({ items });
  } catch (error) { next(error); }
});

app.get('/api/youtube/recommendations', async (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim().slice(0, 180);
    if (!query) return res.status(400).json({ error: 'Falta el contexto para sugerir videos.' });
    if (!apiKey) return res.status(503).json({ error: 'Las sugerencias aún no están configuradas. Falta YOUTUBE_API_KEY en el backend.' });
    const excludedIds = new Set(String(req.query.exclude || '').slice(0, 1200).split(',').filter(Boolean).slice(0, 100));
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.search = new URLSearchParams({ key: apiKey, part: 'snippet', q: query, type: 'video', videoEmbeddable: 'true', maxResults: '8', safeSearch: 'moderate' }).toString();
    const response = await fetch(url);
    const payload = await response.json().catch(() => ({})) as {
      items?: Array<{
        id?: { videoId?: string };
        snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> };
      }>;
      error?: { message?: string };
    };
    if (!response.ok) {
      const message = response.status === 403 ? 'YouTube rechazó las sugerencias. Revisa la API, la clave y su cuota.' : payload.error?.message || 'YouTube no pudo completar las sugerencias.';
      return res.status(response.status === 403 ? 502 : response.status).json({ error: message });
    }
    const items = (payload.items || []).flatMap((item) => {
      const youtubeId = item.id?.videoId;
      if (!youtubeId || excludedIds.has(youtubeId)) return [];
      const snippet = item.snippet || {};
      return [{ id: `youtube-${youtubeId}`, youtubeId, title: snippet.title || 'Video de YouTube', artist: snippet.channelTitle || 'YouTube', album: 'Sugerencia de YouTube', duration: 0, cover: snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`, accent: '#b77cff' }];
    });
    res.json({ items });
  } catch (error) { next(error); }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  const message = error instanceof Error ? error.message : 'Unexpected server error.';
  res.status(message.includes('CORS') ? 403 : 500).json({ error: message });
});
app.listen(port, '0.0.0.0', () => console.info(`Waveframe API listening on port ${port}`));
