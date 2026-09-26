// Pulls the account's personal IMDb ratings via IMDb's internal GraphQL API
// (api.graphql.imdb.com) and writes them to Firebase RTDB at /imdbRatings,
// keyed by IMDb title id (tconst). The app reads that node the same way it
// already reads /overrides and /media_cache.
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
      sort: { sortBy: SINGLE_USER_RATING_DATE, sortOrder: ASC }
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

async function fetchAllRatings() {
  const ratings = {};
  let after = null;
  let page = 0;

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
      ratings[t.id] = { value: t.userRating.value, date: t.userRating.date };
    }
    console.log(`page ${page}: ${result.edges.length} items (${Object.keys(ratings).length}/${result.total} so far)`);

    if (!result.pageInfo.hasNextPage) break;
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

async function writeRatingsToRTDB(ratings) {
  const token = await getFirebaseIdToken();
  const url = `${FIREBASE_DB_URL.replace(/\/$/, '')}/imdbRatings.json?auth=${token}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(ratings),
  });
  if (!res.ok) throw new Error(`RTDB write HTTP ${res.status}: ${await res.text()}`);
}

const ratings = await fetchAllRatings();
console.log(`Fetched ${Object.keys(ratings).length} ratings from IMDb.`);
await writeRatingsToRTDB(ratings);
console.log('Wrote ratings to Firebase RTDB at /imdbRatings.');
