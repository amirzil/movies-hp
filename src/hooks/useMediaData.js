import { useState, useEffect } from 'react';
import { fetchSheetData, fetchWatchedData } from '../utils/sheets.js';
import { searchTMDB, loadOverrides, loadMediaCache, loadImdbRatings, fetchOmdbShowInfo, getCurrentSeasonInfo } from '../utils/tmdb.js';
import { checkImdbRatingsSync } from '../utils/imdbRatingsSync.js';
import { SHEET_NAMES } from '../config.js';

const BATCH_SIZE = 8;

async function enrichBatch(items, onBatchDone, imdbRatings, allowTypeFallback = false) {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const tmdbResults = await Promise.all(
      batch.map(item => searchTMDB(item.title, item.year, item.mediaType, { allowOtherType: allowTypeFallback }))
    );
    // The sheet's own mediaType guess can be wrong for the Watched list (see
    // searchTMDB's allowOtherType); once a real match comes back, its own
    // mediaType is the one actually confirmed by TMDB and should be trusted
    // over the sheet's guess for every downstream type-sensitive lookup.
    const actualTypes = batch.map((item, j) => tmdbResults[j]?.mediaType || item.mediaType);
    // Fetch OMDB for each item that got a tmdbId — hits localStorage cache if already fetched
    const omdbResults = await Promise.all(
      tmdbResults.map((tmdb, j) =>
        tmdb?.tmdbId
          ? fetchOmdbShowInfo(tmdb.tmdbId, actualTypes[j], tmdb.tmdbTitle || batch[j].title, tmdb.tmdbYear || batch[j].year)
          : Promise.resolve(null)
      )
    );
    // My personal rating, once we know the imdbId — same for movies and series
    const myRatings = omdbResults.map(omdb => omdb?.imdbId ? imdbRatings[omdb.imdbId]?.value ?? null : null);
    // Current-season info only matters for series, and only once we know we've
    // actually rated (i.e. watched at least part of) this one
    const currentSeasons = await Promise.all(
      batch.map((item, j) =>
        actualTypes[j] === 'tv' && myRatings[j] != null && tmdbResults[j]?.tmdbId
          ? getCurrentSeasonInfo(tmdbResults[j].tmdbId)
          : Promise.resolve(null)
      )
    );
    onBatchDone(tmdbResults.map((tmdb, j) => ({
      index: i + j,
      tmdb,
      omdb: omdbResults[j],
      myRating: myRatings[j],
      currentSeason: currentSeasons[j],
      mediaType: actualTypes[j],
    })));
  }
}

export function useMediaData() {
  const [movies, setMovies] = useState([]);
  const [series, setSeries] = useState([]);
  const [watched, setWatched] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [imdbSyncStatus, setImdbSyncStatus] = useState(null);

  useEffect(() => {
    let active = true;

    // Independent of the main data load — checks staleness and, if needed,
    // asks GitHub Actions to run the sync (see utils/imdbRatingsSync.js).
    checkImdbRatingsSync().then(status => { if (active) setImdbSyncStatus(status); });

    async function load() {
      try {
        const [rawMovies, rawSeries, rawWatched, , , imdbRatings] = await Promise.all([
          fetchSheetData(SHEET_NAMES.movies),
          fetchSheetData(SHEET_NAMES.series),
          fetchWatchedData(),
          loadOverrides(),    // load overrides before TMDB enrichment
          loadMediaCache(),   // load TMDB cache from RTDB to avoid redundant API calls
          loadImdbRatings(),  // personal ratings, synced separately into RTDB
        ]);
        if (!active) return;

        const moviesWithType = rawMovies.map(m => ({ ...m, mediaType: 'movie' }));
        const seriesWithType = rawSeries.map(s => ({ ...s, mediaType: 'tv' }));
        setMovies(moviesWithType);
        setSeries(seriesWithType);
        setWatched(rawWatched);
        setLoading(false);

        // Enrich all three lists with TMDB data incrementally (batched)
        // Sheet data takes priority — only fill in missing fields from TMDB
        enrichBatch(moviesWithType, updates => {
          if (!active) return;
          setMovies(prev => {
            const next = [...prev];
            updates.forEach(({ index, tmdb, omdb, myRating }) => {
              if (!tmdb) return;
              const existing = next[index];
              next[index] = {
                ...tmdb,
                ...existing,
                posterUrl:      existing.posterUrl      || tmdb.posterUrl,
                backdropUrl:    existing.backdropUrl    || tmdb.backdropUrl,
                overview:       existing.overview       || tmdb.overview       || omdb?.plot,
                tmdbRating:     tmdb.tmdbRating,
                rating:         existing.rating         || omdb?.rating,
                votes:          existing.votes          || omdb?.votes,
                rottenTomatoes: existing.rottenTomatoes || omdb?.rottenTomatoes,
                runtime:        existing.runtime        || omdb?.runtime,
                imdbId:         existing.imdbId         || omdb?.imdbId,
                myRating:       existing.myRating       ?? myRating,
              };
            });
            return next;
          });
        }, imdbRatings);

        enrichBatch(seriesWithType, updates => {
          if (!active) return;
          setSeries(prev => {
            const next = [...prev];
            updates.forEach(({ index, tmdb, omdb, myRating, currentSeason }) => {
              if (!tmdb) return;
              const existing = next[index];
              next[index] = {
                ...tmdb,
                ...existing,
                posterUrl:      existing.posterUrl      || tmdb.posterUrl,
                backdropUrl:    existing.backdropUrl    || tmdb.backdropUrl,
                overview:       existing.overview       || tmdb.overview       || omdb?.plot,
                tmdbRating:     tmdb.tmdbRating,
                rating:         existing.rating         || omdb?.rating,
                votes:          existing.votes          || omdb?.votes,
                rottenTomatoes: existing.rottenTomatoes || omdb?.rottenTomatoes,
                imdbId:         existing.imdbId         || omdb?.imdbId,
                myRating:       existing.myRating       ?? myRating,
                currentSeason:  existing.currentSeason  ?? currentSeason,
              };
            });
            return next;
          });
        }, imdbRatings);

        enrichBatch(rawWatched, updates => {
          if (!active) return;
          setWatched(prev => {
            const next = [...prev];
            updates.forEach(({ index, tmdb, omdb, myRating, mediaType }) => {
              if (!tmdb) return;
              const existing = next[index];
              next[index] = {
                ...tmdb,
                ...existing,
                // The Watched sheet can't reliably say movie vs TV for every
                // row — trust whichever type TMDB actually matched over the
                // sheet's own guess (see enrichBatch's allowTypeFallback).
                mediaType:      mediaType || existing.mediaType,
                posterUrl:      existing.posterUrl      || tmdb.posterUrl,
                backdropUrl:    existing.backdropUrl    || tmdb.backdropUrl,
                overview:       existing.overview       || tmdb.overview       || omdb?.plot,
                tmdbRating:     tmdb.tmdbRating,
                rating:         existing.rating         || omdb?.rating,
                votes:          existing.votes          || omdb?.votes,
                rottenTomatoes: existing.rottenTomatoes || omdb?.rottenTomatoes,
                myRating:       existing.myRating       ?? myRating,
                runtime:        existing.runtime        || omdb?.runtime,
                imdbId:         existing.imdbId         || omdb?.imdbId,
              };
            });
            return next;
          });
        }, imdbRatings, true);
      } catch (e) {
        if (active) { setError(e.message); setLoading(false); }
      }
    }

    load();
    return () => { active = false; };
  }, []);

  function overrideItem(mediaType, title, year, newData) {
    const patch = arr => arr.map(item =>
      item.title === title && item.year === year
        ? { ...item, ...newData }
        : item
    );
    const setter = mediaType === 'movie' ? setMovies : setSeries;
    setter(patch);
    setWatched(patch);
  }

  return { movies, series, watched, loading, error, overrideItem, imdbSyncStatus };
}
