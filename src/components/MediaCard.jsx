function noSubs(subs) {
  const v = subs?.trim().toLowerCase();
  return v === 'n' || v === 'no';
}

function NoSubsBadge() {
  return (
    <div
      title="No Hebrew subtitles"
      className="flex items-center gap-1 bg-black/70 text-red-400 text-[10px] font-semibold px-1.5 py-0.5 rounded leading-none border border-red-500/40"
    >
      {/* Subtitle/CC icon with slash */}
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="6" width="20" height="14" rx="2" />
        <path d="M8 12h4M8 16h8" />
        <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="2.5" />
      </svg>
      עב
    </div>
  );
}

const STATUS_BADGE = {
  'watched':       { bg: 'bg-green-500', label: 'Watched' },
  'watching':      { bg: 'bg-blue-500',  label: 'Watching' },
  'want to watch': { bg: 'bg-amber-500', label: 'Want' },
};

function StatusBadge({ status }) {
  if (!status) return null;
  const lower = status.toLowerCase();
  const match = Object.entries(STATUS_BADGE).find(([k]) => lower.includes(k));
  if (!match) return null;
  return (
    <span className={`${match[1].bg} text-white text-[10px] font-semibold px-1.5 py-0.5 rounded leading-none`}>
      {match[1].label}
    </span>
  );
}

export default function MediaCard({ item, onClick }) {
  return (
    <div
      onClick={() => onClick(item)}
      className="group relative cursor-pointer rounded-lg overflow-hidden bg-[#1a1a2e] aspect-[2/3]"
    >
      {/* Poster or placeholder */}
      {item.posterUrl ? (
        <img
          src={item.posterUrl}
          alt={item.title}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 bg-gradient-to-br from-purple-900/20 to-blue-900/20">
          <svg className="w-10 h-10 text-gray-700 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
              d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
          </svg>
          <p className="text-center text-sm font-medium text-white line-clamp-3 leading-snug">{item.title}</p>
          {item.year && <p className="text-gray-500 text-xs mt-1">{item.year}</p>}
        </div>
      )}

      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
        <h3 className="text-white font-semibold text-sm line-clamp-2 leading-tight">{item.title}</h3>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {item.year && <span className="text-gray-300 text-xs">{item.year}</span>}
          {item.rating && (
            <span className="text-yellow-400 text-xs font-medium">★ {item.rating}</span>
          )}
          {item.rottenTomatoes && (
            <span className="text-red-400 text-xs font-medium">🍅 {item.rottenTomatoes}</span>
          )}
        </div>
      </div>

      {/* Status badge */}
      {item.status && (
        <div className="absolute top-2 right-2">
          <StatusBadge status={item.status} />
        </div>
      )}

      {/* No Hebrew subtitles badge */}
      {noSubs(item.subs) && (
        <div className="absolute bottom-2 left-2">
          <NoSubsBadge />
        </div>
      )}
    </div>
  );
}
