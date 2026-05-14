"use client";

import { useState, useTransition } from "react";
import { updatePointValue } from "./actions";

type Pokemon = {
  id: number;
  name: string;
  type_1: string;
  type_2: string | null;
  point_value: number;
};

const inputCls =
  "w-20 px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500";

function Row({ pokemon }: { pokemon: Pokemon }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(pokemon.point_value.toString());
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const fd = new FormData();
    fd.append("id", pokemon.id.toString());
    fd.append("point_value", value);
    startTransition(async () => {
      await updatePointValue(fd);
      setEditing(false);
    });
  }

  return (
    <tr className="border-t border-white/5 hover:bg-white/5">
      <td className="py-2 pr-6 text-white font-medium">{pokemon.name}</td>
      <td className="py-2 pr-6 text-gray-400 text-xs">
        {pokemon.type_1}
        {pokemon.type_2 ? ` / ${pokemon.type_2}` : ""}
      </td>
      <td className="py-2 pr-6">
        {editing ? (
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={value}
              min={0}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
              className={inputCls}
            />
            <button
              onClick={handleSave}
              disabled={isPending}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium disabled:opacity-50"
            >
              {isPending ? "…" : "Save"}
            </button>
            <button
              onClick={() => setEditing(false)}
              className="text-xs text-gray-500 hover:text-gray-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-white tabular-nums hover:text-indigo-300 transition-colors"
          >
            {pokemon.point_value} pts
          </button>
        )}
      </td>
    </tr>
  );
}

export default function PokemonTable({ pokemon }: { pokemon: Pokemon[] }) {
  const [search, setSearch] = useState("");

  const filtered = search
    ? pokemon.filter((p) =>
        p.name.toLowerCase().includes(search.toLowerCase())
      )
    : pokemon;

  return (
    <div>
      <input
        type="search"
        placeholder="Search Pokémon…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-64 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-400 text-xs uppercase tracking-wide">
              <th className="pb-3 pr-6">Name</th>
              <th className="pb-3 pr-6">Type</th>
              <th className="pb-3">Points</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <Row key={p.id} pokemon={p} />
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <p className="text-gray-500 text-sm mt-4">No Pokémon found.</p>
        )}
      </div>
    </div>
  );
}
