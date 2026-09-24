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
