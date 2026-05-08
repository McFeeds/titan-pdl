import Link from "next/link";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col items-center justify-center gap-10 px-4 pt-16 pb-12">
      {/* Logo placeholder */}
      <div className="relative w-52 h-52 rounded-full border-4 border-white/10 overflow-hidden bg-[#111128] shadow-2xl shadow-black/50">
        {/* Upper half red tint */}
        <div className="absolute inset-x-0 top-0 h-1/2 bg-red-900/30" />
        {/* Dividing line */}
        <div className="absolute inset-x-0 top-1/2 h-px bg-white/20" />
        {/* Center button */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full border-4 border-white/10 bg-[#0d0d1f] flex items-center justify-center">
          <div className="w-6 h-6 rounded-full bg-white/10" />
        </div>
        {/* Placeholder label */}
        <span className="absolute bottom-8 left-0 right-0 text-center text-xs text-gray-500 font-medium tracking-widest uppercase">
          League Logo
        </span>
      </div>

      {/* League name */}
      <div className="text-center flex flex-col gap-1">
        <h1 className="text-5xl font-extrabold text-white tracking-tight">
          Titan PDL
        </h1>
        <p className="text-gray-500 text-sm tracking-widest uppercase font-medium">
          Pokemon Draft League
        </p>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-4 w-full max-w-md">
        <Link
          href="/standings"
          className="flex-1 flex items-center justify-center px-10 py-5 bg-red-700 hover:bg-red-600 active:bg-red-800 text-white text-xl font-bold rounded-xl transition-colors shadow-lg shadow-red-900/40"
        >
          Current League
        </Link>
        <Link
          href="/hall-of-fame"
          className="flex-1 flex items-center justify-center px-10 py-5 border-2 border-yellow-400/70 hover:border-yellow-400 hover:bg-yellow-400/10 active:bg-yellow-400/20 text-yellow-400 text-xl font-bold rounded-xl transition-colors"
        >
          Hall of Fame
        </Link>
      </div>
    </main>
  );
}
