import { TMDB_API_KEY, TMDB_IMAGE_BASE, TMDB_BACKDROP_BASE, CACHE_TTL_MS } from '../config.js';

const BASE = 'https://api.themoviedb.org/3';

function cacheKey(type, title, year) {
  return `tmdb:${type}:${title.toLowerCase().replace(/\s+/g, '_')}:${year || ''}`;
}

function overrideKey(type, title, year) {
  return `tmdb:override:${type}:${title.toLowerCase().replace(/\s+/g, '_')}:${year || ''}`;
}

function fromCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return undefined;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL_MS) { localStorage.removeItem(key); return undefined; }
    return data;
  } catch { return undefined; }
}

function toCache(key, data) {
  try { localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data })); } catch {}
}

// Override storage — no TTL, persists until explicitly changed
export function saveOverride(type, title, year, data) {
  try {
    localStorage.setItem(overrideKey(type, title, year), JSON.stringify(data));
  } catch {}
}

function getOverride(type, title, year) {
  try {
    const raw = localStorage.getItem(overrideKey(type, title, year));
    if (raw === null) return undefined; // no override stored
    return JSON.parse(raw);
  } catch { return undefined; }
}

function normaliseResult(r) {
  return {
    tmdbId:     r.id,
    posterUrl:  r.poster_path   ? `${TMDB_IMAGE_BASE}${r.poster_path}`     : null,
    backdropUrl:r.backdrop_path ? `${TMDB_BACKDROP_BASE}${r.backdrop_path}` : null,
    overview:   r.overview || '',
    tmdbRating: r.vote_average  ? r.vote_average.toFixed(1) : null,
    tmdbTitle:  r.title || r.name || '',
    tmdbYear:   (r.release_date || r.first_air_date || '').slice(0, 4),
  };
}

export async function searchTMDB(title, year, type) {
  if (!TMDB_API_KEY || !title) return null;

  // User override takes priority over everything
  const override = getOverride(type, title, year);
  if (override !== undefined) return override;

  const key = cacheKey(type, title, year);
  const cached = fromCache(key);
  if (cached !== undefined) return cached;

  const endpoint = type === 'movie' ? 'search/movie' : 'search/tv';
  const yearParam = year
    ? (type === 'movie' ? `&year=${year}` : `&first_air_date_year=${year}`)
    : '';
  const url = `${BASE}/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}${yearParam}&include_adult=false`;

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const r = json.results?.[0];
    if (!r) { toCache(key, null); return null; }
    const data = normaliseResult(r);
    toCache(key, data);
    return data;
  } catch { return null; }
}

// Fetch multiple candidates for the "wrong match" picker — searches without year for broader results
export async function searchTMDBMultiple(title, type) {
  if (!TMDB_API_KEY || !title) return [];

  const endpoint = type === 'movie' ? 'search/movie' : 'search/tv';
  const url = `${BASE}/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}&include_adult=false`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.results || []).slice(0, 10).map(normaliseResult);
  } catch { return []; }
}

export async function fetchTrailer(tmdbId, mediaType) {
  if (!TMDB_API_KEY || !tmdbId) return null;

  const key = `tmdb:trailer:${mediaType}:${tmdbId}`;
  const cached = fromCache(key);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(`${BASE}/${mediaType}/${tmdbId}/videos?api_key=${TMDB_API_KEY}`);
    if (!res.ok) return null;
    const json = await res.json();
    const video = json.results?.find(v =>
      v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser')
    );
    const youtubeKey = video?.key || null;
    toCache(key, youtubeKey);
    return youtubeKey;
  } catch { return null; }
}
