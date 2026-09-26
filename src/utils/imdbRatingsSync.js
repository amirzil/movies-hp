import { FIREBASE_DB_URL, GH_REPO, GH_TRIGGER_TOKEN } from '../config.js';
import { getAuthToken } from './firebaseAuth.js';

// If the last sync is older than this, the client asks GitHub Actions to
// run scripts/sync-imdb-ratings.mjs. The actual IMDb cookie stays a GitHub
// secret — this only ever sends a request to trigger/check the workflow.
const STALE_MS = 30 * 24 * 60 * 60 * 1000;

// Don't re-request a run more than once a day, even if the page is loaded
// repeatedly while still stale (e.g. the workflow hasn't finished yet, or
// the cookie is broken and every run fails).
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const COOLDOWN_KEY = 'imdbSync:lastTriggerAttempt';

const GH_HEADERS = GH_TRIGGER_TOKEN ? {
  Authorization: `Bearer ${GH_TRIGGER_TOKEN}`,
  Accept: 'application/vnd.github+json',
} : null;

async function getLastSyncDate() {
  if (!FIREBASE_DB_URL) return null;
  try {
    const token = await getAuthToken();
    const url = `${FIREBASE_DB_URL.replace(/\/$/, '')}/imdbRatingsMeta/lastSyncDate.json${token ? `?auth=${token}` : ''}`;
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

async function getLastRunConclusion() {
  if (!GH_HEADERS) return null;
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/sync-imdb-ratings.yml/runs?per_page=1`,
      { headers: GH_HEADERS }
    );
    if (!res.ok) return null;
    const json = await res.json();
    return json.workflow_runs?.[0]?.conclusion ?? null; // 'success' | 'failure' | null (still running / no runs yet)
  } catch { return null; }
}

function underCooldown() {
  try {
    const last = Number(localStorage.getItem(COOLDOWN_KEY)) || 0;
    return Date.now() - last < COOLDOWN_MS;
  } catch { return false; }
}

function markAttempt() {
  try { localStorage.setItem(COOLDOWN_KEY, String(Date.now())); } catch {}
}

async function triggerSync() {
  if (!GH_HEADERS) return;
  try {
    await fetch(
      `https://api.github.com/repos/${GH_REPO}/actions/workflows/sync-imdb-ratings.yml/dispatches`,
      { method: 'POST', headers: { ...GH_HEADERS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ref: 'main' }) }
    );
  } catch {}
}

// Called once per app load. Kicks off a sync if it's overdue, and reports
// whether the most recent run failed (almost certainly an expired IMDb
// cookie) so the UI can show a banner.
export async function checkImdbRatingsSync() {
  const lastSyncDate = await getLastSyncDate();
  const stale = !lastSyncDate || (Date.now() - new Date(lastSyncDate).getTime() > STALE_MS);

  if (stale && !underCooldown()) {
    markAttempt();
    await triggerSync();
  }

  const lastRunConclusion = await getLastRunConclusion();
  return { stale, lastSyncDate, syncFailing: lastRunConclusion === 'failure' };
}
