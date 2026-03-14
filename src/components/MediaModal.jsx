import { useEffect, useState } from 'react';
import { fetchTrailer, searchTMDBMultiple, saveOverride, fetchSeasonStats, fetchOmdbShowInfo, getOmdbError } from '../utils/tmdb.js';

const SEASON_COLORS = [
  '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b',
  '#ef4444', '#ec4899', '#06b6d4', '#84cc16',
  '#f97316', '#a855f7',
];

function EpisodeRatingChart({ seasons, className = '' }) {
  const [hovered, setHovered] = useState(null);

  const allRatings = seasons.flatMap(s => s.episodes.map(e => e.rating));
  const minRating = Math.max(0, Math.floor(Math.min(...allRatings) - 0.5));
  const maxRating = Math.min(10, Math.ceil(Math.max(...allRatings) + 0.5));
  const maxEp = Math.max(...seasons.map(s => s.episodes.length));

  const W = 500, H = 180;
  const ML = 28, MR = 8, MT = 8, MB = 20;
  const chartW = W - ML - MR;
  const chartH = H - MT - MB;

  function xPos(ep) { return ML + (ep - 1) / Math.max(maxEp - 1, 1) * chartW; }
  function yPos(r) { return MT + (1 - (r - minRating) / (maxRating - minRating)) * chartH; }

  const yTicks = [];
  for (let r = Math.ceil(minRating); r <= Math.floor(maxRating); r++) yTicks.push(r);

  const xLabels = [];
  const step = maxEp <= 10 ? 2 : maxEp <= 20 ? 5 : 10;
  for (let n = step; n <= maxEp; n += step) xLabels.push(n);

  return (
    <div className={`mt-4 ${className}`}>
      <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Episode Ratings (IMDB)</p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
        {seasons.map((s, i) => (
          <div key={s.season} className="flex items-center gap-1.5">
            <div className="w-4 h-0.5 rounded-full" style={{ backgroundColor: SEASON_COLORS[i % SEASON_COLORS.length] }} />
            <span className="text-[10px] text-gray-400">S{String(s.season).padStart(2, '0')}</span>
          </div>
        ))}
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          style={{ height: 180 }}
          onMouseLeave={() => setHovered(null)}
        >
          {/* Gridlines + Y labels */}
          {yTicks.map(r => (
            <g key={r}>
              <line x1={ML} y1={yPos(r)} x2={W - MR} y2={yPos(r)} stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
              <text x={ML - 4} y={yPos(r)} textAnchor="end" dominantBaseline="middle" fill="#6b7280" fontSize="8">{r}</text>
            </g>
          ))}

          {/* X axis */}
          <line x1={ML} y1={MT + chartH} x2={W - MR} y2={MT + chartH} stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
          {xLabels.map(n => (
            <text key={n} x={xPos(n)} y={MT + chartH + 9} textAnchor="middle" fill="#6b7280" fontSize="8">{n}</text>
          ))}

          {/* Lines + dots per season */}
          {seasons.map((s, si) => {
            const color = SEASON_COLORS[si % SEASON_COLORS.length];
            const pts = s.episodes.map((e, i) => `${xPos(i + 1)},${yPos(e.rating)}`).join(' ');
            return (
              <g key={s.season}>
                <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5"
                  strokeLinejoin="round" strokeLinecap="round" opacity="0.8" />
                {s.episodes.map((e, i) => (
                  <circle
                    key={i}
                    cx={xPos(i + 1)} cy={yPos(e.rating)} r="3"
                    fill={color} opacity={hovered?.season === s.season && hovered?.ep === i + 1 ? 1 : 0.75}
                    style={{ cursor: 'crosshair' }}
                    onMouseEnter={() => setHovered({ season: s.season, ep: i + 1, rating: e.rating, name: e.name, color })}
                  />
                ))}
              </g>
            );
          })}
        </svg>

        {hovered && (
          <div className="absolute top-1 right-1 bg-[#1a1a2e] border border-white/10 rounded-lg px-3 py-2 text-xs pointer-events-none shadow-lg">
            <p className="text-gray-400 mb-0.5">
              S{String(hovered.season).padStart(2, '0')} E{String(hovered.ep).padStart(2, '0')}
            </p>
            {hovered.name && <p className="text-white font-medium text-[11px] mb-0.5 max-w-[150px] truncate">{hovered.name}</p>}
            <p className="font-semibold" style={{ color: hovered.color }}>★ {hovered.rating.toFixed(1)}</p>
          </div>
        )}
      </div>
    </div>
  );
}

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
  const [seasonStats, setSeasonStats] = useState(null);
  const [omdbData, setOmdbData] = useState(null);
  const [omdbError, setOmdbError] = useState(null);
  const [omdbDebug, setOmdbDebug] = useState([]);

  // Fetch trailer, episode stats, and OMDB enrichment on open
  useEffect(() => {
    setTrailerKey(null);
    setPicking(false);
    setSeasonStats(null);
    setOmdbData(null);
    setOmdbError(null);
    setOmdbDebug([]);
    if (item.tmdbId && item.mediaType) {
      fetchTrailer(item.tmdbId, item.mediaType).then(key => {
        if (key) setTrailerKey(key);
      });
      fetchOmdbShowInfo(item.tmdbId, item.mediaType, item.title, item.year,
        step => setOmdbDebug(prev => [...prev, step])
      ).then(data => {
        if (data) setOmdbData(data);
        const err = getOmdbError();
        if (err) setOmdbError(err);
      });
      if (item.mediaType === 'tv') {
        fetchSeasonStats(item.tmdbId).then(stats => {
          if (stats?.length) setSeasonStats(stats);
        });
      }
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

  // Merge OMDB data into item — sheet data takes priority, OMDB fills missing fields
  const rating         = item.rating         || omdbData?.rating         || null;
  const votes          = item.votes          || omdbData?.votes          || null;
  const rottenTomatoes = item.rottenTomatoes || omdbData?.rottenTomatoes || null;
  const overview       = item.overview       || omdbData?.plot           || null;

  const genres = item.genre
    ? item.genre.split(',').map(g => g.trim()).filter(Boolean)
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-[#13131f] rounded-t-2xl sm:rounded-2xl w-full sm:max-w-3xl lg:max-w-5xl max-h-[92vh] sm:max-h-[88vh] overflow-y-auto shadow-2xl border border-white/5">

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

            <div className={`flex-1 min-w-0 ${seasonStats ? 'lg:grid lg:grid-cols-[1fr_320px] lg:gap-6 lg:items-start' : ''}`}>
              {/* Left column: text info */}
              <div>
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
                  {rating && (
                    <span className="text-purple-300 text-sm">IMDB: {rating}</span>
                  )}
                  {rottenTomatoes && (
                    <span className="text-red-400 text-sm">🍅 {rottenTomatoes}</span>
                  )}
                  {votes && (
                    <span className="text-gray-500 text-xs">{votes} votes</span>
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

                {overview && (
                  <p className="text-gray-300 text-sm leading-relaxed mt-4">{overview}</p>
                )}

                {item.notes && (
                  <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">My Notes</p>
                    <p className="text-gray-300 text-sm leading-relaxed">{item.notes}</p>
                  </div>
                )}

                {/* Chart shown below on small screens */}
                {seasonStats && (
                  <div className="lg:hidden">
                    <EpisodeRatingChart seasons={seasonStats} />
                  </div>
                )}

                {/* OMDB debug panel — shown when no rating was found */}
                {!rating && omdbDebug.length > 0 && (
                  <div className="mt-4 p-3 rounded-xl bg-white/5 border border-white/10">
                    <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">OMDB Debug</p>
                    <div className="space-y-1">
                      {omdbDebug.map((step, i) => (
                        <p key={i} className="text-gray-400 text-[11px] font-mono break-all">{step}</p>
                      ))}
                    </div>
                  </div>
                )}

                {/* OMDB error banner */}
                {omdbError && (
                  <div className="mt-4 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs">
                    <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                    </svg>
                    <span>OMDB: {omdbError}</span>
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

              {/* Right column: chart always visible on large screens */}
              {seasonStats && (
                <div className="hidden lg:block">
                  <EpisodeRatingChart seasons={seasonStats} className="mt-0" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
