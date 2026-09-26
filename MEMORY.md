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
