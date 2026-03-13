import { TMDB_API_KEY, TMDB_IMAGE_BASE, TMDB_BACKDROP_BASE, CACHE_TTL_MS, FIREBASE_DB_URL } from '../config.js';

const BASE = 'https://api.themoviedb.org/3';

function cacheKey(type, title, year) {
  return `tmdb:${type}:${title.toLowerCase().replace(/\s+/g, '_')}:${year || ''}`;
}

// Sanitize for Firebase RTDB keys (no . # $ / [ ])
function overrideKey(type, title, year) {
  const safe = title.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `${type}__${safe}__${year || 'no_year'}`;
}

function rtdbUrl(path) {
  return `${FIREBASE_DB_URL.replace(/\/$/, '')}/${path}.json`;
}

// In-memory overrides loaded from RTDB on startup
let _overrides = null;

export async function loadOverrides() {
  if (!FIREBASE_DB_URL) return;
  try {
    const res = await fetch(rtdbUrl('overrides'));
    _overrides = res.ok ? (await res.json() || {}) : {};
  } catch {
    _overrides = {};
  }
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

export async function saveOverride(type, title, year, data) {
  const key = overrideKey(type, title, year);
  if (!_overrides) _overrides = {};
  _overrides[key] = data; // update in-memory immediately
  if (!FIREBASE_DB_URL) return;
  try {
    await fetch(rtdbUrl(`overrides/${key}`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  } catch {}
}

function getOverride(type, title, year) {
  if (!_overrides) return undefined;
  const val = _overrides[overrideKey(type, title, year)];
  return val; // undefined = no override
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

async function fetchFirstResult(endpoint, title, yearParam) {
  const url = `${BASE}/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}${yearParam}&include_adult=false`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const json = await res.json();
  return json.results?.[0] ?? null;
}

export async function searchTMDB(title, year, type) {
  if (!TMDB_API_KEY || !title) return null;

  // User override takes priority over everything
  const override = getOverride(type, title, year);
  if (override !== undefined) return override;

  const key = cacheKey(type, title, year);
  const cached = fromCache(key);
  if (cached !== undefined && cached !== null) return cached; // skip stale null entries

  const endpoint = type === 'movie' ? 'search/movie' : 'search/tv';
  const yearParam = year
    ? (type === 'movie' ? `&year=${year}` : `&first_air_date_year=${year}`)
    : '';

  try {
    // Try with year first; if no hit, retry without year
    let r = year ? await fetchFirstResult(endpoint, title, yearParam) : null;
    if (!r) r = await fetchFirstResult(endpoint, title, '');
    if (!r) return null; // don't cache misses — retry on next load
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

export async function fetchSeasonStats(tmdbId) {
  if (!TMDB_API_KEY || !tmdbId) return null;

  const showKey = `tmdb:seasons:${tmdbId}`;
  const cached = fromCache(showKey);
  if (cached !== undefined) return cached;

  try {
    const showRes = await fetch(`${BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
    if (!showRes.ok) return null;
    const showJson = await showRes.json();
    const seasons = (showJson.seasons || []).filter(s => s.season_number > 0);

    const stats = await Promise.all(seasons.map(async s => {
      const key = `tmdb:season:${tmdbId}:${s.season_number}`;
      let episodes;
      const cachedSeason = fromCache(key);
      if (cachedSeason !== undefined) {
        episodes = cachedSeason;
      } else {
        const res = await fetch(`${BASE}/tv/${tmdbId}/season/${s.season_number}?api_key=${TMDB_API_KEY}`);
        if (!res.ok) return null;
        const json = await res.json();
        episodes = (json.episodes || [])
          .map(e => e.vote_average)
          .filter(v => v > 0);
        toCache(key, episodes);
      }
      if (!episodes.length) return null;
      const avg = episodes.reduce((a, b) => a + b, 0) / episodes.length;
      return {
        season: s.season_number,
        avg: avg.toFixed(1),
        high: Math.max(...episodes).toFixed(1),
        low: Math.min(...episodes).toFixed(1),
        episodeCount: s.episode_count,
      };
    }));

    const result = stats.filter(Boolean);
    toCache(showKey, result);
    return result;
  } catch { return null; }
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
