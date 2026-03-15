import { FIREBASE_API_KEY } from '../config.js';

const STORAGE_KEY = 'firebase:anon:token';

function loadStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw); // { idToken, refreshToken, expiresAt }
  } catch { return null; }
}

function persist(idToken, refreshToken, expiresIn) {
  const entry = { idToken, refreshToken, expiresAt: Date.now() + Number(expiresIn) * 1000 };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entry)); } catch {}
  return entry;
}

async function signInAnon() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnSecureToken: true }) }
  );
  if (!res.ok) return null;
  const j = await res.json();
  return persist(j.idToken, j.refreshToken, j.expiresIn);
}

async function refresh(refreshToken) {
  const res = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: refreshToken }) }
  );
  if (!res.ok) return null;
  const j = await res.json();
  return persist(j.id_token, j.refresh_token, j.expires_in);
}

// Returns a valid Firebase ID token, refreshing or signing in as needed
export async function getAuthToken() {
  if (!FIREBASE_API_KEY) return null;
  const stored = loadStored();
  if (stored) {
    if (stored.expiresAt > Date.now() + 5 * 60 * 1000) return stored.idToken; // still fresh
    const refreshed = await refresh(stored.refreshToken);
    if (refreshed) return refreshed.idToken;
  }
  const fresh = await signInAnon();
  return fresh?.idToken ?? null;
}
