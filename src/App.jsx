import { useState, useMemo } from 'react';
import Header from './components/Header.jsx';
import CategoryTabs from './components/CategoryTabs.jsx';
import FilterBar from './components/FilterBar.jsx';
import MediaGrid from './components/MediaGrid.jsx';
import MediaModal from './components/MediaModal.jsx';
import { useMediaData } from './hooks/useMediaData.js';

function applyFilters(items, { genre, status, service, search }) {
  return items.filter(item => {
    if (genre   && !item.genre?.toLowerCase().includes(genre.toLowerCase())) return false;
    if (status  && item.status?.toLowerCase()  !== status.toLowerCase())     return false;
    if (service && item.service?.toLowerCase() !== service.toLowerCase())    return false;
    if (search  && !item.title?.toLowerCase().includes(search.toLowerCase())) return false;
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
  const [activeTab, setActiveTab] = useState('movies');
  const [selectedItem, setSelectedItem] = useState(null);
  const [filters, setFilters] = useState({ genre: '', status: '', service: '', search: '' });
  const [sort, setSort] = useState('');
  const [posterSize, setPosterSize] = useState('md');

  const { movies, series, loading, error, overrideItem } = useMediaData();

  const items = activeTab === 'movies' ? movies : series;

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

  const services = useMemo(() => (
    [...new Set(items.map(i => i.service).filter(Boolean))].sort()
  ), [items]);

  function handleTabChange(tab) {
    setActiveTab(tab);
    setFilters({ genre: '', status: '', service: '', search: '' });
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

      <CategoryTabs
        activeTab={activeTab}
        onTabChange={handleTabChange}
        movieCount={movies.length}
        seriesCount={series.length}
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
