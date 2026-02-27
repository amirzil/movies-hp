import MediaCard from './MediaCard.jsx';

const SIZE_PX = { sm: 160, md: 220, lg: 300 };

function SkeletonCard() {
  return <div className="aspect-[2/3] rounded-lg bg-white/5 animate-pulse" />;
}

export default function MediaGrid({ items, loading, onItemClick, posterSize = 'md' }) {
  const minPx = SIZE_PX[posterSize] ?? 160;
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fill, minmax(${minPx}px, 1fr))`,
    gap: '1rem',
  };

  if (loading) {
    return (
      <div className="max-w-screen-2xl mx-auto px-6 pb-10" style={gridStyle}>
        {Array.from({ length: 24 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 text-gray-600">
        <svg className="w-14 h-14 mb-4 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p className="text-sm">No results found</p>
      </div>
    );
  }

  return (
    <div className="max-w-screen-2xl mx-auto px-6 pb-10" style={gridStyle}>
      {items.map((item, i) => (
        <MediaCard
          key={`${item.title}-${item.year}-${i}`}
          item={item}
          onClick={onItemClick}
        />
      ))}
    </div>
  );
}
