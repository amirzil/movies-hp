# Project Memory — movies_hp

## 2026-09-24 — Recovered a missed production deploy

**Context:** Production (`movies-watchlist-hp.web.app`) was serving the
2026-06-06 build from `085b77e`. PR #1 "Add Watched tab combining movies and
series" merged to `main` as `a36239f` on 2026-08-13, but **no GitHub Actions
run was ever created for that push** — the repo had 36 runs, all `push`
events, newest 2026-06-06. Production was ~2 months stale and the Watched tab
was absent from the live bundle (verified: 0 occurrences of `watchedCount`).

**Decided:** Re-trigger the existing `deploy.yml` with an empty commit
(`3adb0b0`) pushed to `main`.

**Why:** It reuses the path that produced all 36 prior successful deploys,
keeps credentials in GitHub secrets, and changes no project files. There was
also precedent — `085b77e` was itself a "Trigger redeploy" commit.

**Rejected:**
- *Add `workflow_dispatch` to `deploy.yml` and dispatch it.* Would make future
  manual redeploys possible without no-op commits, but modifies a file beyond
  the ask. Worth revisiting if this recurs.
- *Local `npm run build` + `firebase deploy`.* Fastest and commit-free, but
  bypasses CI and builds from local `.env` instead of GitHub secrets, so the
  artifact could drift from what CI produces (`VITE_FIREBASE_DB_URL` is
  hardcoded in the workflow but read from `.env` locally).

**Outcome:** Run 35973121625 succeeded in 42s. Live bundle is now
`index-PmCu2ppA.js`, byte-identical to a local build of `a36239f` except for
7 bytes — the API key values Vite inlines. Watched tab confirmed live.

**Unresolved:** Why the 2026-08-13 push produced no workflow run is still
unexplained. Actions was enabled, the workflow `active`, all five secrets
present, repo public and not archived. The same trigger worked fine on
2026-09-24, so the mechanism is functional. If a merge to `main` ever appears
not to deploy again, check `gh api repos/amirzil/movies-hp/actions/runs`
directly — `gh run list --commit <sha>` lagged by minutes during this session
and falsely showed no run.

**Note:** the `origin` remote URL has a `gho_` OAuth token embedded in it.
Consider switching to SSH or a credential helper and rotating that token.

## 2026-09-26 — Added a scheduled drift-check so deploys self-heal

**Context:** the 2026-08-13 missed deploy above had no discoverable cause,
which means a single `on: push` trigger has no way to notice or recover from
itself failing silently again.

**Decided:** kept the `push` trigger as-is, and added `schedule: '*/30 * * * *'`
to `deploy.yml`. Every run (push or scheduled) now stamps its build with
`dist/version.txt` = `${{ github.sha }}`, fetches the live `version.txt`, and
only runs install/build/deploy if it differs from `origin/main`'s HEAD. Push
still deploys immediately; the cron is a same-workflow fallback that redeploys
within 30 minutes if a push event is ever missed again, with no visible
no-op cost the rest of the time (one `curl`, skips the rest).

**Rejected:**
- *`workflow_dispatch` only, no schedule.* Makes manual redeploys easy but
  doesn't detect a missed deploy — still relies on someone noticing
  production is stale, which is exactly what didn't happen for two months.
- *Drift-check + `workflow_dispatch` combined.* Marginally more convenient
  (manual redeploy without an empty commit) but the user picked the plainer
  option; can be added later if a manual trigger is ever needed.

**Verified:** confirmed `/version.txt` was previously swallowed by the SPA
catch-all rewrite (200, `text/html`, served `index.html`) before this change.
After deploying `cb04d64`, `/version.txt` returns 200, `text/plain`, with the
exact commit SHA — confirming Firebase Hosting serves a real static file
ahead of the `"source": "**"` rewrite, as assumed.

**Watch for:** GitHub auto-disables scheduled workflows after 60 days of
repo inactivity — if this repo goes quiet for 2 months, the cron (not just
push) stops firing until someone re-enables it in the Actions tab.

## 2026-09-26 — Personal IMDb ratings + current-season indicator

**Context:** wanted "my rating" shown on Watched-tab items, and on Series-tab
items where earlier seasons are already watched, plus an indicator of which
season is currently airing/completed for those.

**Investigated:** IMDb blocks direct scraping hard — plain `curl` on the
ratings page got a 202 bot-challenge with an empty body; a real (headless
*and* headed) browser via agent-browser got an interactive "Human
Verification" CAPTCHA wall, even authenticated. This is very likely IP-
reputation based (datacenter IP), not a headless-detection trick, since a
real Chrome hit it too. Confirmed the same document-route block applies even
with a valid session cookie attached.

However, IMDb's own frontend runs on a public GraphQL API
(`api.graphql.imdb.com`) that is *not* behind that same wall — a captured
sidebar request replayed via plain `curl` from this same (challenge-walled)
environment returned 200 with real data. Better still: raw ad-hoc GraphQL
queries are accepted (only introspection is blocked), so rather than being
limited to whatever persisted query IMDb's frontend happens to send, a
custom query requesting `title.userRating { value date }` (discovered by
trial against the schema) returns the exact personal-rating field, which no
captured frontend request even asked for. Fetched and verified all 856/856
ratings this way, cleanly paginated.

**Decided:** `scripts/sync-imdb-ratings.mjs` + `.github/workflows/
sync-imdb-ratings.yml` (`workflow_dispatch` only — no schedule, see below),
using a session cookie stored as the `IMDB_COOKIE` secret (`IMDB_USER_ID` =
`ur45409091`, not secret, from the ratings-page GraphQL calls). Writes
`{imdbId: {value, date}}` to Firebase RTDB at `/imdbRatings`, the same
anonymous-auth pattern the app already uses for `/overrides` and
`/media_cache` (empirically tested: a fresh anon sign-in can write a new
top-level RTDB node with no rule changes needed).

App reads it via `loadImdbRatings()` in `tmdb.js`, attached as `item.myRating`
once `imdbId` resolves (`useMediaData.js`), rendered in `MediaCard.jsx` as
"Me {rating}". For series, `getCurrentSeasonInfo()` derives the latest
*aired-or-airing* season from TMDB's `last_episode_to_air`/
`next_episode_to_air` (deliberately not the full `seasons[]` list, so an
announced-but-unaired season is never shown), gated on already having a
`myRating` for that show — shown as "S{n}[ airing]".

**Rejected:**
- *Manual CSV export → new Sheet tab.* Zero ToS ambiguity, no cookie
  expiry to manage — the clean fallback if the GraphQL approach ever breaks
  for good. Rejected only because the GraphQL path turned out to work and is
  push-button once set up.
- *Scheduled sync (cron), not just manual.* The session cookie expires
  periodically (unlike the deploy secrets) — a cron would fail silently
  until someone noticed ratings were stale. Manual `workflow_dispatch` makes
  that failure visible instead of hidden.
- *Rating granularity: series vs. per-season.* Settled empirically instead
  of asking — the 856 ratings include 0 `tvSeason` entries (474 movie, 285
  tvSeries, 69 tvMiniSeries, 9 tvEpisode as a rare exception), confirming
  whole-series-level rating is the actual pattern.

**Caveat flagged to the user, explicitly accepted:** every response from
this API carries IMDb's own disclaimer that "public, commercial, and/or
non-private use... is not allowed," and this app is deployed to a public
URL. Not resolved one way or the other — a conscious risk the user chose to
accept, not a settled legal conclusion.

**Maintenance:** `IMDB_COOKIE` **will** expire eventually. When the sync
workflow starts failing, re-capture from a logged-in browser (DevTools →
Network → filter `graphql` → find a `RatingsPage` request → right-click →
Copy → Copy as cURL → save to a file, never paste the cookie into chat) and
`gh secret set IMDB_COOKIE < file`. `IMDB_USER_ID` (`ur45409091`) does not
expire.

## 2026-09-26 — Client-triggered sync instead of a schedule

**Context:** first built as a monthly `cron` in the workflow itself (simple,
but the same silent-failure problem as any schedule: nobody would notice a
dead cookie until they went looking). User asked instead: check staleness
when the page loads, and only re-fetch if it's been over a month, with an
on-page message if the cookie's expired.

**The constraint that shaped this:** "when the page opens" means client-side
— the browser, not CI. This app is a static Vite site; anything under
`VITE_*` is baked into the public JS bundle, readable by anyone who opens
the (public-URL) site. The actual `IMDB_COOKIE` must never go there — that
would hand out the real logged-in IMDb/Amazon session to any visitor. This
wasn't a tradeoff to weigh, it was a hard no regardless of how the request
was phrased.

**Decided:** the client only ever touches non-sensitive things —
`/imdbRatingsMeta/lastSyncDate` (a timestamp, safe to read) and a **separate,
fine-grained GitHub PAT** (`VITE_GH_TRIGGER_TOKEN`, repo `GH_ACTIONS_TRIGGER_TOKEN`
secret feeding it) scoped to **Actions: read/write on this repo only** — it
can start/inspect workflow runs, nothing else, and cannot reach
`IMDB_COOKIE` or any other secret. `src/utils/imdbRatingsSync.js`: on load,
reads the checkpoint; if >30 days old (and not already tried in the last
24h, via a localStorage cooldown), POSTs to GitHub's `workflow_dispatch` API
to run `sync-imdb-ratings.yml`. Separately reads that workflow's last run
`conclusion`; if `failure`, `App.jsx` shows an amber banner ("sync is
failing — cookie likely expired").

Also made the sync script itself incremental at the same time: sorts by
rating date descending, stops as soon as it reaches an already-synced date
(the same `lastSyncDate` checkpoint), and `PATCH`-merges only new/changed
keys into `/imdbRatings` instead of overwriting the whole node. A routine
trigger is one lightweight GraphQL page, not all 856 ratings again.

**Rejected:**
- *Monthly `cron` in the workflow* (what this replaces). Simplest, but same
  "fails silently, nobody notices" problem the deploy drift-check exists to
  avoid — reintroducing it here for the same reason didn't make sense once
  a better option existed.
- *Firebase Cloud Function as a proxy.* Fully server-side and genuinely
  automatic, but requires enabling Firebase's paid Blaze plan for a
  currently-free static-hosting project — a billing change, not made without
  asking. Reasonable to revisit if the token-based approach ever proves
  insufficient.
- *IMDb cookie (or a broad token) directly in client code.* Not offered as
  an option at all — flagged and excluded outright as a real account-
  compromise risk, not a style choice.

**Setup still needed:** `GH_ACTIONS_TRIGGER_TOKEN` must be created manually
via github.com/settings/personal-access-tokens/new (fine-grained PATs can't
be created via API/CLI) — repo: movies-hp only, permission: Actions read/
write only — then `gh secret set GH_ACTIONS_TRIGGER_TOKEN < file`. Until
that secret exists, `VITE_GH_TRIGGER_TOKEN` builds as empty and the sync
trigger/banner code no-ops safely (traced through the code paths, not yet
observed live in a browser: every GH-token-dependent function short-circuits
on the empty string before making a network call).

**Update 2026-09-26:** `GH_ACTIONS_TRIGGER_TOKEN` created and set (fine-
grained PAT, `movies-hp` only, Actions read/write). Verified live: the token
is in the deployed bundle and a direct API call with it returns 200 against
the workflow-runs endpoint. Deploy fully wired end to end.

## 2026-09-27 — Fixed three unidentified Watched-list items, found two bugs

**Context:** user reported "The Life of Chuck", "Ainda Estou Aqui", and "The
Ministry of Ungentlemanly Warfare" weren't showing posters/ratings, with the
correct IMDb IDs supplied.

**Found — two separate, unrelated root causes:**
1. **CSV parsing bug** (general, affects any row): `sheets.js` did
   `text.split('\n')` *before* parsing quotes. Google Sheets exports a cell's
   own embedded line break as a literal `\n` inside a quoted CSV field —
   splitting the whole text on `\n` first cuts that field across two
   physical lines, corrupting the row's column alignment. Both "The Life of
   Chuck" and "The Ministry of Ungentlemanly Warfare" had an accidental
   trailing newline typed into their title cell in the sheet, triggering
   this. Root-caused by literally fetching the sheet's raw CSV and diffing
   Python's `csv` module's parse against the app's own — the corruption was
   immediately visible.
2. **Foreign-title mismatch** (per-item, not a bug in the general sense):
   "Ainda Estou Aqui" is entered under its original Portuguese title; TMDB
   indexes the same film as "I'm Still Here" and a title-text search never
   finds it. No sheet-parsing issue involved — confirmed by fetching the
   fixed-parser output directly and seeing the row was already well-formed.

**Decided:**
- Fixed #1 in code: replaced the per-line `parseCSVLine` with a single
  `parseCSV(text)` that walks the whole response respecting quotes across
  newlines. Verified against the live sheet before shipping — the corrupted
  titles came back clean and correctly column-aligned.
- Fixed #2 (and gave #1's two titles their data immediately, without
  waiting for next TMDB search) via the app's *existing* override
  mechanism — the same one `MediaModal`'s "correct this" flow writes to.
  Looked up each title's real TMDB match via `/find/{imdb_id}` and wrote
  `posterUrl`/`overview`/`tmdbRating`/`tmdbId`/etc. directly to
  `/overrides/<key>` in RTDB (merged in via `database:update`, not
  overwriting the 7 overrides already there from the user's own past
  corrections). Once `tmdbId` is right, the existing TMDB→OMDB→imdbId
  chain resolves on its own — including `myRating`, since all three
  already had personal ratings synced (8, 8, 7) waiting for a working
  match.

**Found but deliberately not fixed — flagging instead:** these three rows
are real movies but not shift-detected (their columns are correctly
aligned, not shifted from a movies-sheet paste) and don't have
`Comments: movie` set, so `fetchWatchedData` defaults their `mediaType` to
`'tv'`. That default is a pre-existing, general gap (the sheet has no
reliable positive movie/tv signal once a row is both non-shifted and
untagged) — not something introduced by this fix, and not touched here,
since the *sanctioned* fix already exists in the sheet itself:

**Superseded same day — no sheet edit needed after all.** User asked: why
not just try TV search, then fall back to movie search if nothing matches?
Implemented exactly that: `searchTMDB` gained an opt-in `allowOtherType`
flag (default off), enabled only for the Watched list's `enrichBatch` call
— Movies/Series keep strict single-type search, since their type is certain
from which sheet a row came from and a genuinely-failed search there
shouldn't risk a false cross-type match. Verified against all three titles
before shipping: a plain simulation of the fallback logic against live TMDB
data resolved all three correctly (movie search succeeding where the
sheet-guessed tv search came up empty) — same as the manual overrides
achieved, but automatic and general for any future ambiguous row.

Once a match lands, its *actual* matched type — not the sheet's original
guess — now also drives the OMDB external-ids lookup and the current-season
check for that item (both were querying TMDB's `/tv/{id}`-shaped endpoints
using whatever type the sheet originally guessed; left as `'tv'`, that would
have meant a movie's TMDB id got queried in the *TV* id space — a different,
unrelated numbering scheme — silently returning wrong or empty data, or in
rare cases a bogus season badge for an actual movie).

Removed the three manual overrides written for this issue earlier — they're
redundant now (and were keyed `movie__...`, which the app would never have
looked up anyway while `mediaType` stayed `'tv'` for these rows).

**Same day, follow-up — "why don't we identify September 5?":** the
fallback above wasn't enough for every case. TMDB's search is fuzzy: guessing
`'tv'` for "September 5" (a movie) returned a real, non-empty TV result
("Five Days in September: The Rebirth of an Orchestra" — a loose text match,
wrong show entirely), so the "only try the other type when the first found
*nothing*" rule never fired, even though movie search's first result is an
exact match. Added `isExactTitleMatch` (case/punctuation-insensitive) and
changed the rule to: accept the guessed type only if it's an exact match;
otherwise also try the other type and prefer *that* if it's exact (or if the
guessed type found nothing at all, same as before). Verified all four
titles reported so far pass before shipping.

**Process note worth remembering:** local `npm run build` verification in
this worktree was silently meaningless for a while, and I shipped several
commits on faith in "the build completes" rather than "the code is actually
in the bundle." The worktree has no `.env` (gitignored, only in the main
checkout) — with `TMDB_API_KEY` etc. resolving to a compile-time-constant
`''`, Vite/Rollup provably tree-shook `searchTMDB`'s entire body down to
`return null;` even with `--minify false`, so grepping the output for new
code found nothing regardless of what the source actually said. Caught it
by embedding a string-literal marker directly inside the new function and
finding it absent even unminified — that's what exposed the missing env,
not the initial "hash didn't change" observation (which was real, but I
initially chased it as a caching bug). Fixed by copying `.env` into this
worktree so local builds here match what CI actually produces. If a local
build here ever again looks suspiciously unchanged, check for real env vars
before suspecting a cache.

## 2026-09-27 — Wrong-match picker now offers movies, not just the guessed type

**Context:** user noticed the "pick the correct match" picker (`MediaModal`'s
`PickerGrid`) only ever searched the item's own assumed `mediaType` — an
item guessed `'tv'` could never be manually corrected to a movie in that UI,
even though that's exactly the ambiguity the Watched-sheet type-fallback
work this week was about.

**Decided:** `PickerGrid` now fetches both `searchTMDBMultiple(title,
mediaType)` and the other type, merges the results, and labels each poster
tile "Movie"/"TV" so they're distinguishable. `handleSelect` now saves the
override under `newData.mediaType` (whichever type was actually picked),
not the item's original guess.

That in turn meant `getOverride` needed to check both type keys — the
Watched sheet's guess for an item doesn't change on the sheet itself, so a
manually-picked movie override for a `'tv'`-guessed item would otherwise get
saved correctly but never found again on the next load. Made this
unconditional (not gated behind `searchTMDB`'s `allowOtherType`, which stays
Watched-list-only): a saved override is always a human-confirmed choice, so
there's no false-positive risk in checking both types, unlike the automatic
search fallback where a wrong guess could silently substitute the wrong
title.

**Also fixed while there:** `PickerGrid`'s list `key` was `r.tmdbId` alone —
movie and TV id numbering are separate namespaces in TMDB, so a coincidental
collision between them could have broken React's reconciliation for that
tile. Now `${r.mediaType}-${r.tmdbId}`.

## 2026-10-13 — Added a "Returning Shows" filter on the Series tab

**Decided:** a toggle filter, Series-tab only (`showReturningFilter` prop
into `FilterBar`, gated on `activeTab === 'series'` in `App.jsx`), using the
same `item.myRating != null` signal already powering the "Me {rating}" badge
and the current-season indicator — i.e. series you've already rated (watched
at least part of), to help spot ones with a new season out. No new data
source needed; this is purely a filter over data already being enriched.

Reset to `false` on tab change, consistent with the other filters.

## 2026-10-13 — Service filter duplicates, and index.html caching stale

User reported two things after the Returning Shows deploy: didn't see the
new filter, and "Prime" shows up twice in the Service filter.

**Service duplicates:** real data problem, not UI — the sheets mix casing
for the same service: `Prime`/`prime` (List), `Disney`/`disney` (movies,
Watched), `Kodi`/`kodi` (Watched), plus a stray `"Disney "` with a trailing
space (Watched). `App.jsx`'s services list deduped on exact string equality,
so each variant got its own filter button, even though the filter *match*
itself was already case-insensitive. Fixed by deduping on a normalized
lowercase/trimmed key and displaying a consistent title-cased label.
**Not merged:** `Amazon` (Watched) is a separate literal string from
`Prime` — left alone since collapsing two genuinely different labels into
one is an editorial call, not a casing bug; flagged to the user rather than
assumed.

**Missing filter — real cause was caching, not a bad deploy.** Confirmed
first: the live JS bundle *did* contain the new filter code — so this
wasn't a repeat of the dead-code-elimination incident. The actual cause:
`firebase.json` had no `headers` config at all, so Firebase's default
`max-age=3600` applied uniformly, including to `index.html` itself. A
browser that loaded the site within the last hour kept serving the old
`index.html` (pointing at the old content-hashed bundle filename) and never
even requested the new JS.

**Got the first fix wrong, caught it empirically:** added a `"source":
"index.html"` no-cache rule — `curl -I` on `/index.html` directly showed
`no-cache` as expected, but `curl -I` on `/` (what every real visitor
actually requests) still showed the stale `max-age=3600`. Firebase matches
header `source` patterns against the *requested* path, evaluated **before**
the SPA catch-all rewrite resolves it to `/index.html` — so a rule naming
the destination file never fires for the path people actually hit. Fixed
with `"source": "**"` → `no-cache`, with a more specific `"source":
"**/assets/**"` rule for the content-hashed JS/CSS (long-lived immutable
cache — safe, since every build gets new filenames) listed after it so it
overrides the catch-all for that one path. `version.txt` now gets no-cache
for free from the same catch-all (it also needed this, since a CDN-cached
copy would have undermined the drift-check workflow's whole purpose).
Verified this version by curling `/` directly post-deploy, not just
`/index.html` — same "don't trust the single surface test" lesson as the
missing-`.env` build incident a couple weeks back.

## 2026-10-25 — Per-season average IMDB rating chart

**Context:** the existing `EpisodeRatingChart` in the TV show modal plots
per-*episode* ratings and mixes IMDB with a TMDB fallback per point (each
dot's tooltip says which source it came from) — not what was asked for, a
per-season average, IMDB-only.

**Decided:** new `SeasonAverageChart`, one bar per season, averaging only
episodes with `isImdb: true` — episodes that only got the TMDB fallback are
excluded from the average rather than diluting it, and a season with zero
IMDB-rated episodes is left off the chart entirely (not shown as a false
zero). Shown directly below the existing episode chart, same component file,
same `SEASON_COLORS` indexed by season number (not filtered array position)
so a bar's color still matches its season's line above even if an
in-between season gets skipped.

**Bars use a fixed 0–10 baseline, not the data's own range** — caught this
against the dataviz skill's own mark spec ("bars grow from a single
baseline") before shipping: a bar chart's length *is* its value, so a
truncated axis would visually exaggerate small differences between
seasons, unlike the line chart above it, where position (not length) carries
the value and zooming into the data's own range is fine. Fixed 0–10 also
keeps bars comparable across different shows, not just within one.

**Verified beyond "it compiles":** built and ran the real app in a browser
(agent-browser), opened Invincible's modal, and independently fetched its
raw OMDB per-episode ratings outside the app to compute season averages by
hand — S01 8.62, S02 8.36, S03 8.98, S04 zero rated episodes (it just aired)
— confirmed via the DOM's accessibility tree, not just a screenshot, that
the rendered bars exist for exactly S01–S03 with proportional heights
matching those numbers. S04 correctly absent.
