import { FIREBASE_DB_URL } from '../config.js';
import { getAuthToken } from './firebaseAuth.js';

// The sync itself runs on its own schedule (.github/workflows/sync-imdb-ratings.yml),
// not triggered by the client. This just reads whether the last run failed
// (almost certainly an expired IMDb cookie) so the UI can show a banner.
async function getLastSyncFailed() {
  if (!FIREBASE_DB_URL) return false;
  try {
    const token = await getAuthToken();
    const url = `${FIREBASE_DB_URL.replace(/\/$/, '')}/imdbRatingsMeta/lastSyncFailed.json${token ? `?auth=${token}` : ''}`;
    const res = await fetch(url);
    return res.ok ? Boolean(await res.json()) : false;
  } catch { return false; }
}

export async function checkImdbRatingsSync() {
  return { syncFailing: await getLastSyncFailed() };
}
