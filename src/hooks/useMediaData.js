import { useState, useEffect } from 'react';
import { fetchSheetData } from '../utils/sheets.js';
import { searchTMDB } from '../utils/tmdb.js';
import { SHEET_NAMES } from '../config.js';

const BATCH_SIZE = 8;

async function enrichBatch(items, type, onBatchDone) {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(item => searchTMDB(item.title, item.year, type))
    );
    onBatchDone(results.map((tmdb, j) => ({ index: i + j, tmdb })));
  }
}

export function useMediaData() {
  const [movies, setMovies] = useState([]);
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const [rawMovies, rawSeries] = await Promise.all([
          fetchSheetData(SHEET_NAMES.movies),
          fetchSheetData(SHEET_NAMES.series),
        ]);
        if (!active) return;

        const moviesWithType = rawMovies.map(m => ({ ...m, mediaType: 'movie' }));
        const seriesWithType = rawSeries.map(s => ({ ...s, mediaType: 'tv' }));
        setMovies(moviesWithType);
        setSeries(seriesWithType);
        setLoading(false);

        // Enrich both lists with TMDB data incrementally (batched)
        // Sheet data takes priority — only fill in missing fields from TMDB
        enrichBatch(moviesWithType, 'movie', updates => {
          if (!active) return;
          setMovies(prev => {
            const next = [...prev];
            updates.forEach(({ index, tmdb }) => {
              if (!tmdb) return;
              const existing = next[index];
              next[index] = {
                ...tmdb,
                ...existing,
                // Only use TMDB poster/backdrop if sheet didn't provide them
                posterUrl:   existing.posterUrl  || tmdb.posterUrl,
                backdropUrl: existing.backdropUrl || tmdb.backdropUrl,
                overview:    existing.overview   || tmdb.overview,
                tmdbRating:  tmdb.tmdbRating,
              };
            });
            return next;
          });
        });

        enrichBatch(seriesWithType, 'tv', updates => {
          if (!active) return;
          setSeries(prev => {
            const next = [...prev];
            updates.forEach(({ index, tmdb }) => {
              if (!tmdb) return;
              const existing = next[index];
              next[index] = {
                ...tmdb,
                ...existing,
                posterUrl:   existing.posterUrl  || tmdb.posterUrl,
                backdropUrl: existing.backdropUrl || tmdb.backdropUrl,
                overview:    existing.overview   || tmdb.overview,
                tmdbRating:  tmdb.tmdbRating,
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
    const setter = mediaType === 'movie' ? setMovies : setSeries;
    setter(prev => prev.map(item =>
      item.title === title && item.year === year
        ? { ...item, ...newData }
        : item
    ));
  }

  return { movies, series, loading, error, overrideItem };
}
