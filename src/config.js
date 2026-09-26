export const SHEET_ID = import.meta.env.VITE_SHEET_ID || '';
export const SHEET_NAMES = { movies: 'movies', series: 'List', watched: 'Watched' };
export const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || '';
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
export const TMDB_BACKDROP_BASE = 'https://image.tmdb.org/t/p/original';
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const FIREBASE_DB_URL     = import.meta.env.VITE_FIREBASE_DB_URL     || '';
export const FIREBASE_API_KEY    = import.meta.env.VITE_FIREBASE_API_KEY    || '';
export const OMDB_API_KEY = import.meta.env.VITE_OMDB_API_KEY || '';

// Fine-grained GitHub PAT scoped to Actions: read/write on this repo only —
// used client-side to trigger/check the IMDb ratings sync. Deliberately not
// the IMDb cookie itself, which must never reach the client bundle.
export const GH_REPO = 'amirzil/movies-hp';
export const GH_TRIGGER_TOKEN = import.meta.env.VITE_GH_TRIGGER_TOKEN || '';
