import { useState, useEffect } from 'react';
import { fetchSheetData, fetchWatchedData } from '../utils/sheets.js';
import { searchTMDB, loadOverrides, loadMediaCache, fetchOmdbShowInfo } from '../utils/tmdb.js';
import { SHEET_NAMES } from '../config.js';

const BATCH_SIZE = 8;

async function enrichBatch(items, onBatchDone) {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const tmdbResults = await Promise.all(
      batch.map(item => searchTMDB(item.title, item.year, item.mediaType))
    );
    // Fetch OMDB for each item that got a tmdbId — hits localStorage cache if already fetched
    const omdbResults = await Promise.all(
      tmdbResults.map((tmdb, j) =>
        tmdb?.tmdbId
          ? fetchOmdbShowInfo(tmdb.tmdbId, batch[j].mediaType, tmdb.tmdbTitle || batch[j].title, tmdb.tmdbYear || batch[j].year)
          : Promise.resolve(null)
      )
    );
    onBatchDone(tmdbResults.map((tmdb, j) => ({ index: i + j, tmdb, omdb: omdbResults[j] })));
  }
}

export function useMediaData() {
  const [movies, setMovies] = useState([]);
  const [series, setSeries] = useState([]);
  const [watched, setWatched] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [rawMovies, rawSeries, rawWatched] = await Promise.all([
          fetchSheetData(SHEET_NAMES.movies),
          fetchSheetData(SHEET_NAMES.series),
          fetchWatchedData(),
          loadOverrides(),    // load overrides before TMDB enrichment
          loadMediaCache(),   // load TMDB cache from RTDB to avoid redundant API calls
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
            updates.forEach(({ index, tmdb, omdb }) => {
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
              };
            });
            return next;
          });
        });

        enrichBatch(seriesWithType, updates => {
          if (!active) return;
          setSeries(prev => {
            const next = [...prev];
            updates.forEach(({ index, tmdb, omdb }) => {
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
              };
            });
            return next;
          });
        });

        enrichBatch(rawWatched, updates => {
          if (!active) return;
          setWatched(prev => {
            const next = [...prev];
            updates.forEach(({ index, tmdb, omdb }) => {
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
              };
            });
            return next;
          });
        });
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

  return { movies, series, watched, loading, error, overrideItem };
}
