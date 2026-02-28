const STATUS_ACTIVE = {
  'watched':       'bg-green-500/20 text-green-400 border-green-500/40',
  'watching':      'bg-blue-500/20 text-blue-400 border-blue-500/40',
  'want to watch': 'bg-amber-500/20 text-amber-400 border-amber-500/40',
};

function getStatusActiveClass(status) {
  const lower = status?.toLowerCase() || '';
  return STATUS_ACTIVE[lower] || 'bg-purple-500/20 text-purple-400 border-purple-500/40';
}

const SORT_OPTIONS = [
  { value: '',           label: 'Default' },
  { value: 'rating',     label: '★ IMDB' },
  { value: 'year-desc',  label: 'Year ↓' },
  { value: 'year-asc',   label: 'Year ↑' },
];

const SIZE_OPTIONS = [
  { value: 'sm', label: 'S' },
  { value: 'md', label: 'M' },
  { value: 'lg', label: 'L' },
];

export default function FilterBar({ genres, statuses, services, filters, onFilterChange, sort, onSortChange, posterSize, onSizeChange }) {
  return (
    <div className="max-w-screen-2xl mx-auto px-6 py-2 space-y-2">

      {/* Sort + Size row */}
      <div className="flex items-center justify-between gap-4">
        {/* Sort */}
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 uppercase tracking-wider flex-shrink-0">Sort</span>
          <div className="flex gap-1">
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onSortChange(opt.value)}
                className={`px-3 py-1 text-xs rounded-lg border transition-all ${
                  sort === opt.value
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Poster size */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <span className="text-xs text-gray-600 uppercase tracking-wider">Size</span>
          <div className="flex gap-1">
            {SIZE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => onSizeChange(opt.value)}
                className={`w-8 h-7 text-xs font-semibold rounded-lg border transition-all ${
                  posterSize === opt.value
                    ? 'bg-white/15 text-white border-white/25'
                    : 'bg-white/5 text-gray-500 border-white/10 hover:bg-white/10 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Status filter */}
      {statuses.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 uppercase tracking-wider w-12 flex-shrink-0">Status</span>
          <div className="flex gap-2 flex-wrap">
            {['', ...statuses].map(status => (
              <button
                key={status || '__all__'}
                onClick={() => onFilterChange({ ...filters, status })}
                className={`px-3 py-1 text-xs rounded-full border transition-all ${
                  filters.status === status
                    ? status
                      ? getStatusActiveClass(status)
                      : 'bg-white/15 text-white border-white/20'
                    : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
                }`}
              >
                {status || 'All'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Service filter */}
      {services?.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 uppercase tracking-wider w-12 flex-shrink-0">Service</span>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {['', ...services].map(service => (
              <button
                key={service || '__all__'}
                onClick={() => onFilterChange({ ...filters, service })}
                className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap transition-all flex-shrink-0 ${
                  filters.service === service
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                    : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
                }`}
              >
                {service || 'All'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Genre filter */}
      {genres.length > 0 && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 uppercase tracking-wider w-12 flex-shrink-0">Genre</span>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {['', ...genres].map(genre => (
              <button
                key={genre || '__all__'}
                onClick={() => onFilterChange({ ...filters, genre })}
                className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap transition-all flex-shrink-0 ${
                  filters.genre === genre
                    ? 'bg-purple-500/20 text-purple-300 border-purple-500/40'
                    : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
                }`}
              >
                {genre || 'All'}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
