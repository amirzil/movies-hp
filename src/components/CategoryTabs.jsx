export default function CategoryTabs({ activeTab, onTabChange, movieCount, seriesCount }) {
  const tabs = [
    { id: 'movies', label: 'Movies', count: movieCount },
    { id: 'series', label: 'Series', count: seriesCount },
  ];

  return (
    <div className="flex gap-2 px-6 pt-20 pb-3 max-w-screen-2xl mx-auto">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`relative px-8 py-4 text-xl font-semibold rounded-xl transition-all ${
            activeTab === tab.id
              ? 'text-white bg-white/10'
              : 'text-gray-500 hover:text-white hover:bg-white/5'
          }`}
        >
          {tab.label}
          {tab.count > 0 && (
            <span className={`ml-2.5 text-sm px-2.5 py-0.5 rounded-full ${
              activeTab === tab.id
                ? 'bg-purple-500 text-white'
                : 'bg-white/10 text-gray-500'
            }`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
