// Pulls full per-episode IMDb ratings (and vote counts) for every tracked TV
// show, straight from IMDb's own public GraphQL API, and writes them to
// Firebase RTDB at /episodeRatings/{imdbId}. The app reads that node instead
// of calling OMDB per season/episode — OMDB's episode-level coverage lags
// IMDb's own site badly for newer or binge-dropped seasons (confirmed: it
// had ratings for 2 of 8 episodes of a season IMDb itself had fully rated
// with thousands of votes each).
//
// No login needed — this is public data. But it can only be fetched
// server-side: IMDb's GraphQL endpoint sits behind an edge/WAF rule that
// flat-out 403s any request whose Origin isn't an imdb.com domain, which a
// real browser can't spoof (confirmed directly against our production
// origin). A plain Node script has no such restriction.
//
// Requires env vars:
//   VITE_TMDB_API_KEY      - to resolve each show's TMDB id -> IMDb id
//   VITE_FIREBASE_API_KEY  - anonymous Firebase auth, same as the app
//   VITE_FIREBASE_DB_URL   - RTDB base URL
//
// Run manually: node scripts/sync-episode-ratings.mjs

const TMDB_API_KEY = process.env.VITE_TMDB_API_KEY;
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY;
const FIREBASE_DB_URL = process.env.VITE_FIREBASE_DB_URL;

if (!TMDB_API_KEY) throw new Error('VITE_TMDB_API_KEY is not set');
if (!FIREBASE_API_KEY) throw new Error('VITE_FIREBASE_API_KEY is not set');
if (!FIREBASE_DB_URL) throw new Error('VITE_FIREBASE_DB_URL is not set');

const IMDB_HEADERS = {
  'content-type': 'application/json',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  origin: 'https://www.imdb.com',
  referer: 'https://www.imdb.com/',
};

const EPISODES_QUERY = `
  query Episodes($id: ID!, $after: ID) {
    title(id: $id) {
      episodes {
        episodes(first: 100, after: $after) {
          total
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              titleText { text }
              ratingsSummary { aggregateRating voteCount }
              series { episodeNumber { seasonNumber episodeNumber } }
            }
          }
        }
      }
    }
  }
`;

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getFirebaseIdToken() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }
  );
  if (!res.ok) throw new Error(`Firebase anonymous sign-in HTTP ${res.status}`);
  return (await res.json()).idToken;
}

async function rtdbGet(path, token) {
  const res = await fetch(`${FIREBASE_DB_URL.replace(/\/$/, '')}/${path}.json?auth=${token}`);
  if (!res.ok) throw new Error(`RTDB GET ${path} HTTP ${res.status}`);
  return res.json();
}

async function rtdbPut(path, token, body) {
  const res = await fetch(`${FIREBASE_DB_URL.replace(/\/$/, '')}/${path}.json?auth=${token}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`RTDB PUT ${path} HTTP ${res.status}: ${await res.text()}`);
}

// Every tracked TV show's TMDB id, discovered from the same RTDB nodes the
// app's own TMDB-match cache/corrections already populate — avoids
// re-implementing title search matching here.
async function discoverTvShowIds(token) {
  const [mediaCache, overrides] = await Promise.all([
    rtdbGet('media_cache', token),
    rtdbGet('overrides', token),
  ]);
  const ids = new Set();
  for (const [key, value] of Object.entries({ ...mediaCache, ...overrides })) {
    if (key.startsWith('tv__') && value?.tmdbId) ids.add(value.tmdbId);
  }
  return [...ids];
}

async function getImdbId(tmdbId) {
  try {
    const res = await fetch(`https://api.themoviedb.org/3/tv/${tmdbId}/external_ids?api_key=${TMDB_API_KEY}`);
    if (!res.ok) return null;
    return (await res.json()).imdb_id || null;
  } catch { return null; }
}

async function fetchAllEpisodes(imdbId) {
  const bySeasonEpisode = {};
  let after = null;
  while (true) {
    const res = await fetch('https://api.graphql.imdb.com/', {
      method: 'POST',
      headers: IMDB_HEADERS,
      body: JSON.stringify({ query: EPISODES_QUERY, variables: { id: imdbId, after } }),
    });
    if (!res.ok) throw new Error(`IMDb GraphQL HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(`IMDb GraphQL error: ${JSON.stringify(json.errors)}`);

    const page = json.data?.title?.episodes?.episodes;
    if (!page) break; // title has no episode data at all
    for (const edge of page.edges) {
      const n = edge.node;
      const epNum = n.series?.episodeNumber;
      if (!epNum || n.ratingsSummary?.aggregateRating == null) continue;
      const season = epNum.seasonNumber;
      const episode = epNum.episodeNumber;
      if (season == null || episode == null) continue;
      (bySeasonEpisode[season] ??= {})[episode] = {
        rating: n.ratingsSummary.aggregateRating,
        votes: n.ratingsSummary.voteCount,
        title: n.titleText?.text || null,
      };
    }
    if (!page.pageInfo.hasNextPage) break;
    after = page.pageInfo.endCursor;
    await sleep(150);
  }
  return bySeasonEpisode;
}

const token = await getFirebaseIdToken();
const tmdbIds = await discoverTvShowIds(token);
console.log(`Found ${tmdbIds.length} tracked TV shows to sync.`);

let synced = 0, skipped = 0, failed = 0;
for (const tmdbId of tmdbIds) {
  try {
    const imdbId = await getImdbId(tmdbId);
    if (!imdbId) { skipped++; continue; }

    const episodes = await fetchAllEpisodes(imdbId);
    if (!Object.keys(episodes).length) { skipped++; continue; }

    await rtdbPut(`episodeRatings/${imdbId}`, token, episodes);
    synced++;
    console.log(`[${synced + skipped + failed}/${tmdbIds.length}] synced ${imdbId} (tmdb ${tmdbId}) — ${Object.keys(episodes).length} seasons`);
  } catch (e) {
    failed++;
    console.log(`[${synced + skipped + failed}/${tmdbIds.length}] FAILED tmdb ${tmdbId}: ${e.message}`);
  }
  await sleep(200);
}

console.log(`Done. Synced ${synced}, skipped ${skipped} (no IMDb id or no episode data), failed ${failed}.`);
