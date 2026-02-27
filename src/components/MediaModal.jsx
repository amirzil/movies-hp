import { useEffect, useState } from 'react';
import { fetchTrailer, searchTMDBMultiple, saveOverride } from '../utils/tmdb.js';

const STATUS_COLOR = {
  'watched':       'text-green-400',
  'watching':      'text-blue-400',
  'want to watch': 'text-amber-400',
};

function getStatusColor(status) {
  const lower = status?.toLowerCase() || '';
  for (const [k, v] of Object.entries(STATUS_COLOR)) {
    if (lower.includes(k)) return v;
  }
  return 'text-gray-400';
}

function PickerGrid({ title, mediaType, onSelect, onCancel }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    searchTMDBMultiple(title, mediaType).then(r => {
      setResults(r);
      setLoading(false);
    });
  }, [title, mediaType]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Pick the correct match</h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-white text-sm transition">
          ← Back
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-[2/3] rounded-lg bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : results.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">No results found</p>
      ) : (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 overflow-y-auto max-h-[50vh]">
          {results.map(r => (
            <button
              key={r.tmdbId}
              onClick={() => onSelect(r)}
              className="group text-left focus:outline-none"
            >
              <div className="aspect-[2/3] rounded-lg overflow-hidden bg-[#1a1a2e] ring-2 ring-transparent group-hover:ring-purple-500 transition">
                {r.posterUrl
                  ? <img src={r.posterUrl} alt={r.tmdbTitle} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center p-2 text-center text-gray-600 text-[10px]">{r.tmdbTitle}</div>
                }
              </div>
              <p className="text-white text-[11px] font-medium mt-1 line-clamp-1">{r.tmdbTitle}</p>
              {r.tmdbYear && <p className="text-gray-500 text-[10px]">{r.tmdbYear}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MediaModal({ item, onClose, onCorrect }) {
  const [trailerKey, setTrailerKey] = useState(null);
  const [picking, setPicking] = useState(false);

  // Fetch trailer
  useEffect(() => {
    setTrailerKey(null);
    setPicking(false);
    if (item.tmdbId && item.mediaType) {
      fetchTrailer(item.tmdbId, item.mediaType).then(key => {
        if (key) setTrailerKey(key);
      });
    }
  }, [item.tmdbId, item.mediaType]);

  // Close on Escape
  useEffect(() => {
    const handler = e => e.key === 'Escape' && (picking ? setPicking(false) : onClose());
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, picking]);

  // Lock body scroll
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  function handleSelect(newData) {
    saveOverride(item.mediaType, item.title, item.year, newData);
    onCorrect(item, newData);
    setPicking(false);
  }

  const genres = item.genre
    ? item.genre.split(',').map(g => g.trim()).filter(Boolean)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[#13131f] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl max-h-[92vh] sm:max-h-[88vh] overflow-y-auto shadow-2xl border border-white/5">

        {/* Hero backdrop (only in main view) */}
        {!picking && item.backdropUrl && (
          <div className="relative h-44 sm:h-60 overflow-hidden rounded-t-2xl flex-shrink-0">
            <img src={item.backdropUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#13131f] via-[#13131f]/40 to-transparent" />
          </div>
        )}

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 bg-black/50 hover:bg-black/80 text-white rounded-full p-2 transition"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Picker view */}
        {picking ? (
          <PickerGrid
            title={item.title}
            mediaType={item.mediaType}
            onSelect={handleSelect}
            onCancel={() => setPicking(false)}
          />
        ) : (
          /* Main info view */
          <div className="p-6 flex gap-5">
            {item.posterUrl && (
              <div className={`flex-shrink-0 w-28 sm:w-36 ${item.backdropUrl ? '-mt-16 sm:-mt-20' : ''}`}>
                <img
                  src={item.posterUrl}
                  alt={item.title}
                  className="w-full rounded-xl shadow-2xl border border-white/10"
                />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h2 className="text-xl sm:text-2xl font-bold text-white leading-tight">{item.title}</h2>

              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                {item.year && <span className="text-gray-400 text-sm">{item.year}</span>}
                {item.service && (
                  <span className="text-xs px-2 py-0.5 rounded bg-white/10 text-gray-300 border border-white/10">
                    {item.service}
                  </span>
                )}
                {item.status && (
                  <span className={`text-sm font-medium ${getStatusColor(item.status)}`}>
                    {item.status}
                  </span>
                )}
                {item.tmdbRating && (
                  <span className="text-yellow-400 text-sm font-medium">★ {item.tmdbRating} TMDB</span>
                )}
                {item.rating && (
                  <span className="text-purple-300 text-sm">IMDB: {item.rating}</span>
                )}
                {item.rottenTomatoes && (
                  <span className="text-red-400 text-sm">🍅 {item.rottenTomatoes}</span>
                )}
                {item.votes && (
                  <span className="text-gray-500 text-xs">{item.votes} votes</span>
                )}
              </div>

              {trailerKey && (
                <a
                  href={`https://www.youtube.com/watch?v=${trailerKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded-lg transition"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Watch Trailer
                </a>
              )}

              {genres.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {genres.map(g => (
                    <span key={g} className="px-2.5 py-1 bg-white/5 text-gray-400 text-xs rounded-full border border-white/10">
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {item.overview && (
                <p className="text-gray-300 text-sm leading-relaxed mt-4">{item.overview}</p>
              )}

              {item.notes && (
                <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">My Notes</p>
                  <p className="text-gray-300 text-sm leading-relaxed">{item.notes}</p>
                </div>
              )}

              {/* Wrong match button */}
              <button
                onClick={() => setPicking(true)}
                className="mt-5 text-xs text-gray-600 hover:text-gray-400 transition underline underline-offset-2"
              >
                Wrong movie/show? Pick a different match →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
