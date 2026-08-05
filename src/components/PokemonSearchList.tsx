"use client";

import { useMemo, useState } from "react";

export interface SearchablePokemon {
  id: number;
  name: string;
  point_value: number;
}

export default function PokemonSearchList({
  pokemon,
  onPick,
  autoFocus = true,
  maxHeightClassName = "max-h-56",
}: {
  pokemon: SearchablePokemon[];
  onPick: (pokemon: SearchablePokemon) => void;
  autoFocus?: boolean;
  maxHeightClassName?: string;
}) {
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? pokemon.filter((p) => p.name.toLowerCase().includes(q)) : pokemon;
  }, [query, pokemon]);

  return (
    <div className="flex flex-col gap-2">
      <input
        autoFocus={autoFocus}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search pokemon…"
        className="bg-[#0d0d1f] border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <div className={`${maxHeightClassName} overflow-y-auto flex flex-col gap-0.5`}>
        {results.length === 0 ? (
          <p className="text-xs text-gray-600 italic px-2 py-1">No pokemon found.</p>
        ) : (
          results.map((p) => (
            <button
              key={p.id}
              onClick={() => onPick(p)}
              className="flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-left"
            >
              <span className="text-sm text-gray-200">{p.name}</span>
              <span className="text-xs font-mono text-gray-500">{p.point_value} pts</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
