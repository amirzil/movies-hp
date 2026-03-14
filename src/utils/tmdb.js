import { TMDB_API_KEY, TMDB_IMAGE_BASE, TMDB_BACKDROP_BASE, CACHE_TTL_MS, FIREBASE_DB_URL, OMDB_API_KEY } from '../config.js';

const BASE = 'https://api.themoviedb.org/3';

// Firebase RTDB key (no . # $ / [ ])
function rtdbSafeKey(type, title, year) {
  const safe = title.toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  return `${type}__${safe}__${year || 'no_year'}`;
}

function rtdbUrl(path) {
  return `${FIREBASE_DB_URL.replace(/\/$/, '')}/${path}.json`;
}

// ─── In-memory caches loaded from RTDB on startup ────────────────────────────

let _overrides = null;
let _mediaCache = null; // TMDB search results

export async function loadOverrides() {
  if (!FIREBASE_DB_URL) return;
  try {
    const res = await fetch(rtdbUrl('overrides'));
    _overrides = res.ok ? (await res.json() || {}) : {};
  } catch {
    _overrides = {};
  }
}

export async function loadMediaCache() {
  if (!FIREBASE_DB_URL) { _mediaCache = {}; return; }
  try {
    const res = await fetch(rtdbUrl('media_cache'));
    _mediaCache = res.ok ? (await res.json() || {}) : {};
  } catch {
    _mediaCache = {};
  }
}

function saveToMediaCache(key, data) {
  if (!_mediaCache) _mediaCache = {};
  _mediaCache[key] = data;
  if (!FIREBASE_DB_URL) return;
  // fire and forget
  fetch(rtdbUrl(`media_cache/${key}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).catch(() => {});
}

// ─── localStorage helpers (episode data + misc small caches) ─────────────────

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

// ─── Overrides ────────────────────────────────────────────────────────────────

export async function saveOverride(type, title, year, data) {
  const key = rtdbSafeKey(type, title, year);
  if (!_overrides) _overrides = {};
  _overrides[key] = data;
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
  return _overrides[rtdbSafeKey(type, title, year)];
}

// ─── TMDB search ──────────────────────────────────────────────────────────────

function normaliseResult(r) {
  return {
    tmdbId:      r.id,
    posterUrl:   r.poster_path   ? `${TMDB_IMAGE_BASE}${r.poster_path}`      : null,
    backdropUrl: r.backdrop_path ? `${TMDB_BACKDROP_BASE}${r.backdrop_path}` : null,
    overview:    r.overview || '',
    tmdbRating:  r.vote_average  ? r.vote_average.toFixed(1) : null,
    tmdbTitle:   r.title || r.name || '',
    tmdbYear:    (r.release_date || r.first_air_date || '').slice(0, 4),
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

  // User override takes priority
  const override = getOverride(type, title, year);
  if (override !== undefined) return override;

  // Check RTDB-backed in-memory cache
  const mcKey = rtdbSafeKey(type, title, year);
  if (_mediaCache && mcKey in _mediaCache) return _mediaCache[mcKey];

  // If RTDB not configured, fall back to localStorage
  if (!FIREBASE_DB_URL) {
    const lsCached = fromCache(`tmdb:${type}:${title.toLowerCase().replace(/\s+/g, '_')}:${year || ''}`);
    if (lsCached !== undefined && lsCached !== null) return lsCached;
  }

  const endpoint = type === 'movie' ? 'search/movie' : 'search/tv';
  const yearParam = year
    ? (type === 'movie' ? `&year=${year}` : `&first_air_date_year=${year}`)
    : '';

  try {
    let r = year ? await fetchFirstResult(endpoint, title, yearParam) : null;
    if (!r) r = await fetchFirstResult(endpoint, title, '');
    if (!r) return null;
    const data = normaliseResult(r);
    if (FIREBASE_DB_URL) {
      saveToMediaCache(mcKey, data);
    } else {
      toCache(`tmdb:${type}:${title.toLowerCase().replace(/\s+/g, '_')}:${year || ''}`, data);
    }
    return data;
  } catch { return null; }
}

// Fetch multiple candidates for the "wrong match" picker
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

// ─── IMDB ID lookup (cached in localStorage) ──────────────────────────────────

async function getImdbId(tmdbId, mediaType = 'tv') {
  const key = `tmdb:imdbid:${mediaType}:${tmdbId}`;
  const cached = fromCache(key);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(`${BASE}/${mediaType}/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`);
    if (!res.ok) return null;
    const json = await res.json();
    const imdbId = json.imdb_id || null;
    toCache(key, imdbId);
    return imdbId;
  } catch { return null; }
}

// ─── OMDB show-level info (cached in localStorage) ───────────────────────────

export async function fetchOmdbShowInfo(tmdbId, mediaType) {
  if (!OMDB_API_KEY || !TMDB_API_KEY || !tmdbId) return null;

  const key = `omdb:show:${mediaType}:${tmdbId}`;
  const cached = fromCache(key);
  if (cached !== undefined) return cached;

  const imdbId = await getImdbId(tmdbId, mediaType);
  if (!imdbId) { toCache(key, null); return null; }

  try {
    const res = await fetch(`https://www.omdbapi.com/?i=${imdbId}&apikey=${OMDB_API_KEY}`);
    if (!res.ok) { toCache(key, null); return null; }
    const json = await res.json();
    if (json.Response !== 'True') { toCache(key, null); return null; }

    const rt = json.Ratings?.find(r => r.Source === 'Rotten Tomatoes')?.Value || null;
    const data = {
      rating:         json.imdbRating  !== 'N/A' ? json.imdbRating  : null,
      votes:          json.imdbVotes   !== 'N/A' ? json.imdbVotes   : null,
      rottenTomatoes: rt,
      plot:           json.Plot        !== 'N/A' ? json.Plot        : null,
    };
    toCache(key, data);
    return data;
  } catch { toCache(key, null); return null; }
}

// ─── Episode ratings per season (cached in localStorage, fetched lazily) ──────

export async function fetchSeasonStats(tmdbId) {
  if (!TMDB_API_KEY || !tmdbId) return null;

  const showKey = `omdb:seasons:${tmdbId}`;
  const cached = fromCache(showKey);
  if (cached !== undefined) return cached;

  try {
    const showRes = await fetch(`${BASE}/tv/${tmdbId}?api_key=${TMDB_API_KEY}`);
    if (!showRes.ok) return null;
    const showJson = await showRes.json();
    const seasons = (showJson.seasons || []).filter(s => s.season_number > 0);
    if (!seasons.length) return null;

    const imdbId = OMDB_API_KEY ? await getImdbId(tmdbId, 'tv') : null;

    const stats = await Promise.all(seasons.map(async s => {
      const key = `omdb:season:${tmdbId}:${s.season_number}`;
      const cachedSeason = fromCache(key);
      if (cachedSeason !== undefined) return cachedSeason ? { season: s.season_number, episodes: cachedSeason } : null;

      let episodes = null;

      // Try OMDB first (real IMDB ratings)
      if (imdbId && OMDB_API_KEY) {
        try {
          const res = await fetch(`https://www.omdbapi.com/?i=${imdbId}&Season=${s.season_number}&apikey=${OMDB_API_KEY}`);
          if (res.ok) {
            const json = await res.json();
            if (json.Response === 'True' && json.Episodes) {
              episodes = json.Episodes
                .filter(e => e.imdbRating !== 'N/A')
                .map(e => ({ ep: parseInt(e.Episode, 10), rating: parseFloat(e.imdbRating), name: e.Title }));
            }
          }
        } catch {}
      }

      // Fallback to TMDB vote_average
      if (!episodes) {
        try {
          const res = await fetch(`${BASE}/tv/${tmdbId}/season/${s.season_number}?api_key=${TMDB_API_KEY}`);
          if (res.ok) {
            const json = await res.json();
            episodes = (json.episodes || [])
              .filter(e => e.vote_average > 0)
              .map(e => ({ ep: e.episode_number, rating: e.vote_average, name: e.name }));
          }
        } catch {}
      }

      if (!episodes?.length) { toCache(key, null); return null; }
      toCache(key, episodes);
      return { season: s.season_number, episodes };
    }));

    const result = stats.filter(Boolean);
    toCache(showKey, result);
    return result;
  } catch { return null; }
}

// ─── Trailer ──────────────────────────────────────────────────────────────────

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
