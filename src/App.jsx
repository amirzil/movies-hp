import { useState, useMemo } from 'react';
import Header from './components/Header.jsx';
import CategoryTabs from './components/CategoryTabs.jsx';
import FilterBar from './components/FilterBar.jsx';
import MediaGrid from './components/MediaGrid.jsx';
import MediaModal from './components/MediaModal.jsx';
import { useMediaData } from './hooks/useMediaData.js';

function titleCase(s) {
  return s.replace(/\S+/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}

function applyFilters(items, { genre, status, service, search, returning }) {
  return items.filter(item => {
    if (genre     && !item.genre?.toLowerCase().includes(genre.toLowerCase())) return false;
    if (status    && item.status?.toLowerCase()  !== status.toLowerCase())     return false;
    if (service   && item.service?.toLowerCase() !== service.toLowerCase())    return false;
    if (search    && !item.title?.toLowerCase().includes(search.toLowerCase())) return false;
    // "Returning Shows" — series you've already rated (i.e. watched at
    // least part of), to surface ones that might have a new season out
    if (returning && item.myRating == null) return false;
    return true;
  });
}

function applySort(items, sort) {
  if (!sort) return items;
  return [...items].sort((a, b) => {
    if (sort === 'rating') {
      return parseFloat(b.rating || 0) - parseFloat(a.rating || 0);
    }
    if (sort === 'year-desc') {
      return parseInt(b.year || 0) - parseInt(a.year || 0);
    }
    if (sort === 'year-asc') {
      return parseInt(a.year || 0) - parseInt(b.year || 0);
    }
    return 0;
  });
}

export default function App() {
  const [activeTab, setActiveTab] = useState('series');
  const [selectedItem, setSelectedItem] = useState(null);
  const [filters, setFilters] = useState({ genre: '', status: '', service: '', search: '', returning: false });
  const [sort, setSort] = useState('');
  const [posterSize, setPosterSize] = useState('md');
  const { movies, series, watched, loading, error, overrideItem, imdbSyncStatus } = useMediaData();

  const items = activeTab === 'movies' ? movies : activeTab === 'series' ? series : watched;

  const filtered = useMemo(() => applyFilters(items, filters), [items, filters]);
  const displayed = useMemo(() => applySort(filtered, sort), [filtered, sort]);

  const genres = useMemo(() => (
    [...new Set(
      items.flatMap(i => i.genre?.split(',').map(g => g.trim()) || [])
    )].filter(Boolean).sort()
  ), [items]);

  const statuses = useMemo(() => (
    [...new Set(items.map(i => i.status).filter(Boolean))].sort()
  ), [items]);

  const services = useMemo(() => {
    // The sheets mix casing for the same service (e.g. "Prime"/"prime",
    // "Disney"/"disney", a stray "Disney " with trailing space) — dedupe
    // case/whitespace-insensitively instead of showing each variant as its
    // own filter button.
    const byKey = new Map();
    for (const item of items) {
      const raw = item.service?.trim();
      if (!raw) continue;
      const key = raw.toLowerCase();
      if (!byKey.has(key)) byKey.set(key, titleCase(raw));
    }
    return [...byKey.values()].sort();
  }, [items]);

  function handleTabChange(tab) {
    setActiveTab(tab);
    setFilters({ genre: '', status: '', service: '', search: '', returning: false });
    setSort('');
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#0d0d1a] flex items-center justify-center text-center px-6">
        <div>
          <p className="text-red-400 font-medium mb-2">Failed to load data</p>
          <p className="text-gray-500 text-sm">{error}</p>

          <p className="text-gray-600 text-xs mt-4">
            Make sure your Google Sheet is set to "Anyone with the link can view"
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white">
      <Header
        search={filters.search}
        onSearch={s => setFilters(f => ({ ...f, search: s }))}
      />

      {imdbSyncStatus?.syncFailing && (
        <div className="bg-amber-900/40 border-b border-amber-700/50 text-amber-300 text-sm px-4 py-2 text-center">
          IMDb ratings sync is failing — the session cookie has likely expired and needs re-capturing.
        </div>
      )}

      <CategoryTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        movieCount={movies.length}
        seriesCount={series.length}
        watchedCount={watched.length}
      />

      {!loading && (
        <FilterBar
          genres={genres}
          statuses={statuses}
          services={services}
          filters={filters}
          onFilterChange={setFilters}
          sort={sort}
          onSortChange={setSort}
          posterSize={posterSize}
          onSizeChange={setPosterSize}
          showReturningFilter={activeTab === 'series'}
        />
      )}

      <MediaGrid
        items={displayed}
        loading={loading}
        onItemClick={setSelectedItem}
        posterSize={posterSize}
      />

      {selectedItem && (
        <MediaModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onCorrect={(item, newData) => {
            overrideItem(item.mediaType, item.title, item.year, newData);
            setSelectedItem(prev => ({ ...prev, ...newData }));
          }}
        />
      )}


    </div>
  );
}
