// Pulls the account's personal IMDb ratings via IMDb's internal GraphQL API
// (api.graphql.imdb.com) and writes them to Firebase RTDB at /imdbRatings,
// keyed by IMDb title id (tconst). The app reads that node the same way it
// already reads /overrides and /media_cache.
//
// Incremental: ratings are sorted newest-first and fetching stops as soon as
// it reaches one at or before the last synced date (stored at
// /imdbRatingsMeta/lastSyncDate), so a routine run only pulls what's new or
// re-rated since last time rather than all 800+ every run. The first ever
// run (no checkpoint yet) pulls everything.
//
// Note: this only adds/updates ratings, it never removes one — if a title is
// un-rated on IMDb, its old entry stays in RTDB until manually cleared.
//
// Requires env vars:
//   IMDB_COOKIE            - session cookie captured from a logged-in browser
//   IMDB_USER_ID           - IMDb "ur########" id (from the ratings page URL/GraphQL calls)
//   VITE_FIREBASE_API_KEY  - used for anonymous Firebase auth (same as the app)
//   VITE_FIREBASE_DB_URL   - RTDB base URL
//
// Run manually: node scripts/sync-imdb-ratings.mjs

const IMDB_COOKIE = process.env.IMDB_COOKIE;
const IMDB_USER_ID = process.env.IMDB_USER_ID;
const FIREBASE_API_KEY = process.env.VITE_FIREBASE_API_KEY;
const FIREBASE_DB_URL = process.env.VITE_FIREBASE_DB_URL;

if (!IMDB_COOKIE) throw new Error('IMDB_COOKIE is not set');
if (!IMDB_USER_ID) throw new Error('IMDB_USER_ID is not set');
if (!FIREBASE_API_KEY) throw new Error('VITE_FIREBASE_API_KEY is not set');
if (!FIREBASE_DB_URL) throw new Error('VITE_FIREBASE_DB_URL is not set');

const IMDB_HEADERS = {
  'content-type': 'application/json',
  'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36',
  origin: 'https://www.imdb.com',
  referer: 'https://www.imdb.com/',
  cookie: IMDB_COOKIE,
};

const RATINGS_QUERY = `
  query MyRatings($userId: ID!, $first: Int!, $after: String) {
    advancedTitleSearch(
      first: $first
      after: $after
      constraints: {
        explicitContentConstraint: { explicitContentFilter: INCLUDE_ADULT }
        singleUserRatingConstraint: { filterType: INCLUDE, userId: $userId }
      }
      sort: { sortBy: SINGLE_USER_RATING_DATE, sortOrder: DESC }
    ) {
      total
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          title {
            id
            titleText { text }
            titleType { id }
            userRating { value date }
          }
        }
      }
    }
  }
`;

// Fetches ratings newest-first, stopping as soon as it reaches one at or
// before `sinceDate` (or exhausting all pages if `sinceDate` is null).
async function fetchNewRatings(sinceDate) {
  const ratings = {};
  let after = null;
  let page = 0;
  let stopped = false;

  while (true) {
    page++;
    const variables = { userId: IMDB_USER_ID, first: 250, ...(after ? { after } : {}) };
    const res = await fetch('https://api.graphql.imdb.com/', {
      method: 'POST',
      headers: IMDB_HEADERS,
      body: JSON.stringify({ query: RATINGS_QUERY, variables }),
    });
    if (!res.ok) throw new Error(`IMDb GraphQL HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(`IMDb GraphQL error: ${JSON.stringify(json.errors)}`);

    const result = json.data.advancedTitleSearch;
    for (const edge of result.edges) {
      const t = edge.node.title;
      if (!t.userRating) continue;
      if (sinceDate && t.userRating.date <= sinceDate) { stopped = true; break; }
      ratings[t.id] = { value: t.userRating.value, date: t.userRating.date };
    }
    console.log(`page ${page}: ${result.edges.length} items scanned, ${Object.keys(ratings).length} new/updated so far`);

    if (stopped || !result.pageInfo.hasNextPage) break;
    after = result.pageInfo.endCursor;
  }

  return ratings;
}

async function getFirebaseIdToken() {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }) }
  );
  if (!res.ok) throw new Error(`Firebase anonymous sign-in HTTP ${res.status}`);
  const json = await res.json();
  return json.idToken;
}

async function rtdbRequest(path, token, method, body) {
  const url = `${FIREBASE_DB_URL.replace(/\/$/, '')}/${path}.json?auth=${token}`;
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`RTDB ${method} ${path} HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

const token = await getFirebaseIdToken();
const checkpoint = await rtdbRequest('imdbRatingsMeta/lastSyncDate', token, 'GET');
console.log(checkpoint ? `Last synced up to: ${checkpoint}` : 'No checkpoint yet — full first sync.');

// Captured before fetching starts, so nothing rated during this run's
// execution window can be missed by the next run's checkpoint.
const runStartedAt = new Date().toISOString();

const newRatings = await fetchNewRatings(checkpoint);
console.log(`Fetched ${Object.keys(newRatings).length} new/updated ratings from IMDb.`);

if (Object.keys(newRatings).length > 0) {
  // PATCH merges these keys into /imdbRatings without touching existing ones
  await rtdbRequest('imdbRatings', token, 'PATCH', newRatings);
}
await rtdbRequest('imdbRatingsMeta/lastSyncDate', token, 'PUT', runStartedAt);
console.log(`Done. Checkpoint advanced to ${runStartedAt}.`);
