export default function Loading() {
  return (
    <main className="h-screen pt-20 flex items-center justify-center bg-[#0a0a1a]">
      <div className="flex flex-col items-center gap-3 text-gray-500">
        <svg className="w-8 h-8 animate-spin text-indigo-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        <span className="text-sm">Loading draft planner…</span>
      </div>
    </main>
  );
}
