// Simple Icons CDN slugs + brand colors for known streaming services
const SERVICE_LOGO_MAP = {
  'netflix':     { slug: 'netflix',          color: 'E50914' },
  'apple':       { slug: 'appletv',          color: 'ffffff' },
  'disney':      { slug: 'disneyplus',       color: '0063e5' },
  'prime':       { slug: 'amazonprimevideo', color: '00A8E0' },
  'prime video': { slug: 'amazonprimevideo', color: '00A8E0' },
  'hbo':         { slug: 'hbo',              color: 'ffffff' },
  'kodi':        { slug: 'kodi',             color: '17B2E7' },
  'paramount':   { slug: 'paramountplus',    color: '0064FF' },
  'hulu':        { slug: 'hulu',             color: '1CE783' },
  'max':         { slug: 'max',              color: '002BE7' },
};

function getServiceLogo(service) {
  const entry = SERVICE_LOGO_MAP[service.toLowerCase().trim()];
  if (!entry) return null;
  return `https://cdn.simpleicons.org/${entry.slug}/${entry.color}`;
}

// Deterministic muted color for unknown services
const FALLBACK_COLORS = [
  'bg-pink-500/20 text-pink-300 border-pink-500/40',
  'bg-orange-500/20 text-orange-300 border-orange-500/40',
  'bg-teal-500/20 text-teal-300 border-teal-500/40',
  'bg-violet-500/20 text-violet-300 border-violet-500/40',
];
function fallbackColor(service) {
  let hash = 0;
  for (const c of service) hash = (hash * 31 + c.charCodeAt(0)) & 0xff;
  return FALLBACK_COLORS[hash % FALLBACK_COLORS.length];
}

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
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide items-center">

            {/* All button */}
            <button
              onClick={() => onFilterChange({ ...filters, service: '' })}
              className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap transition-all flex-shrink-0 ${
                filters.service === ''
                  ? 'bg-white/15 text-white border-white/20'
                  : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
              }`}
            >
              All
            </button>

            {services.map(service => {
              const logoUrl = getServiceLogo(service);
              const isActive = filters.service === service;
              return logoUrl ? (
                /* Logo button for known services */
                <button
                  key={service}
                  onClick={() => onFilterChange({ ...filters, service })}
                  title={service}
                  className={`flex-shrink-0 w-9 h-9 rounded-xl border flex items-center justify-center transition-all ${
                    isActive
                      ? 'bg-white/15 border-white/30 ring-1 ring-white/30'
                      : 'bg-white/5 border-white/10 hover:bg-white/12 hover:border-white/20'
                  }`}
                >
                  <img
                    src={logoUrl}
                    alt={service}
                    className="w-5 h-5 object-contain"
                    onError={e => { e.target.style.display = 'none'; }}
                  />
                </button>
              ) : (
                /* Text fallback for unknown services */
                <button
                  key={service}
                  onClick={() => onFilterChange({ ...filters, service })}
                  className={`px-3 py-1 text-xs rounded-full border whitespace-nowrap transition-all flex-shrink-0 ${
                    isActive
                      ? fallbackColor(service)
                      : 'bg-white/5 text-gray-400 border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {service}
                </button>
              );
            })}
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
