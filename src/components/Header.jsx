export default function Header({ search, onSearch }) {
  return (
    <header className="fixed top-0 left-0 right-0 z-40 bg-[#0d0d1a]/90 backdrop-blur-sm border-b border-white/5">
      <div className="max-w-screen-2xl mx-auto px-6 py-4 flex items-center justify-between gap-6">
        <h1 className="text-xl font-bold text-white tracking-tight whitespace-nowrap">
          <span className="text-purple-400">My</span> Watch List
        </h1>
        <div className="relative flex-1 max-w-md">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="Search titles..."
            value={search}
            onChange={e => onSearch(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-full py-2 pl-10 pr-4 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/60 focus:bg-white/8 transition"
          />
        </div>
      </div>
    </header>
  );
}
