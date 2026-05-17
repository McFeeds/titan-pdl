"use client";

import { createClient } from "@/lib/supabase/client";
import { Conference, PokemonWithMoves } from "@/types/database";
import { useEffect, useMemo, useRef, useState } from "react";

const TYPE_COLORS: Record<string, string> = {
  Normal: "#A8A878", Fire: "#F08030", Water: "#6890F0", Electric: "#F8D030",
  Grass: "#78C850", Ice: "#98D8D8", Fighting: "#C03028", Poison: "#A040A0",
  Ground: "#E0C068", Flying: "#A890F0", Psychic: "#F85888", Bug: "#A8B820",
  Rock: "#B8A038", Ghost: "#705898", Dragon: "#7038F8", Dark: "#705848",
  Steel: "#B8B8D0", Fairy: "#EE99AC",
};

const POKEMON_TYPES = Object.keys(TYPE_COLORS).map((t) => t.toLowerCase());

// Diagonal split gradient per conference, matching the paired game versions
const CONFERENCE_THEMES: Record<string, { gradient: string; shadow: string }> = {
  hoenn: {
    // Ruby (deep red) → Sapphire (deep blue), top-left to bottom-right
    gradient: "linear-gradient(135deg, #7A1010 50%, #10107A 50%)",
    shadow: "0 10px 25px rgba(70, 10, 70, 0.4)",
  },
  sinnoh: {
    // Diamond (icy blue) → Pearl (soft rose), top-left to bottom-right
    gradient: "linear-gradient(135deg, #2A74A8 50%, #A85880 50%)",
    shadow: "0 10px 25px rgba(80, 100, 150, 0.4)",
  },
};

function getConferenceTheme(name: string) {
  return (
    CONFERENCE_THEMES[name.toLowerCase()] ?? {
      gradient: "#4f46e5",
      shadow: "0 10px 15px rgba(99, 102, 241, 0.2)",
    }
  );
}

const STAT_ALIASES: Record<string, string> = {
  hp: "hp", health: "hp",
  attack: "atk", atk: "atk",
  defense: "def", def: "def", defence: "def",
  "special attack": "spa", spatk: "spa", spa: "spa",
  "special defense": "spd", spdef: "spd", spd: "spd", "special defence": "spd",
  speed: "spe", spe: "spe",
  points: "point_value", pts: "point_value", point: "point_value",
};

type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe" | "point_value";

function findStat(str: string): StatKey | null {
  const n = str.toLowerCase().trim();
  if (STAT_ALIASES[n]) return STAT_ALIASES[n] as StatKey;
  for (const [alias, stat] of Object.entries(STAT_ALIASES)) {
    if (n.startsWith(alias)) return stat as StatKey;
  }
  return null;
}

function buildFilter(
  query: string,
  allPokemon: PokemonWithMoves[]
): (p: PokemonWithMoves) => boolean {
  if (!query.trim()) return () => true;
  const q = query.toLowerCase();
  const filters: ((p: PokemonWithMoves) => boolean)[] = [];

  // Type filter
  const matchedTypes = POKEMON_TYPES.filter((t) =>
    new RegExp(`\\b${t}\\b`, "i").test(q)
  );
  if (matchedTypes.length > 0) {
    filters.push((p) =>
      matchedTypes.some(
        (t) => p.type_1.toLowerCase() === t || p.type_2?.toLowerCase() === t
      )
    );
  }

  // Stat filters
  const statPatterns: [RegExp, "gt" | "lt" | "gte" | "lte"][] = [
    [/(?:over|more than|above|greater than)\s+(\d+)\s+([\w\s.]+?)(?=\s+(?:and|that|or|with|,)|$)/gi, "gt"],
    [/(?:under|less than|below|fewer than)\s+(\d+)\s+([\w\s.]+?)(?=\s+(?:and|that|or|with|,)|$)/gi, "lt"],
    [/(?:at least|minimum(?:\s+of)?)\s+(\d+)\s+([\w\s.]+?)(?=\s+(?:and|that|or|with|,)|$)/gi, "gte"],
    [/(?:at most|maximum(?:\s+of)?|no more than)\s+(\d+)\s+([\w\s.]+?)(?=\s+(?:and|that|or|with|,)|$)/gi, "lte"],
  ];
  for (const [regex, op] of statPatterns) {
    let match;
    while ((match = regex.exec(q)) !== null) {
      const value = parseInt(match[1]);
      const stat = findStat(match[2].trim());
      if (!stat) continue;
      const s = stat, v = value;
      filters.push((p) => {
        const val = p[s] as number;
        if (op === "gt") return val > v;
        if (op === "lt") return val < v;
        if (op === "gte") return val >= v;
        return val <= v;
      });
    }
  }

  // Move filter: "with the move X", "with move X", "can learn X", etc.
  const movePattern =
    /(?:with the move|with move|can learn|learns?|knows?)\s+([a-z][a-z\s'-]+?)(?=\s+(?:and|that|which|or|,)|\s*$)/gi;
  let moveMatch;
  while ((moveMatch = movePattern.exec(q)) !== null) {
    const moveName = moveMatch[1].trim();
    filters.push((p) =>
      p.moves.some(
        (m) =>
          m.name.toLowerCase().includes(moveName) ||
          moveName.includes(m.name.toLowerCase())
      )
    );
  }

  // Ability filter: detect known ability names in query
  const allAbilities = new Set<string>();
  allPokemon.forEach((p) => {
    if (p.ability_1) allAbilities.add(p.ability_1.toLowerCase());
    if (p.ability_2) allAbilities.add(p.ability_2.toLowerCase());
    if (p.hidden_ability) allAbilities.add(p.hidden_ability.toLowerCase());
  });
  const matchedAbilities = [...allAbilities]
    .sort((a, b) => b.length - a.length)
    .filter((a) =>
      new RegExp(
        `\\b${a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i"
      ).test(q)
    );
  if (matchedAbilities.length > 0) {
    filters.push((p) => {
      const pAbilities = [p.ability_1, p.ability_2, p.hidden_ability]
        .filter(Boolean)
        .map((a) => a!.toLowerCase());
      return matchedAbilities.some((a) => pAbilities.includes(a));
    });
  }

  // Name search fallback
  if (filters.length === 0) {
    const term = q.trim();
    filters.push((p) => p.name.toLowerCase().includes(term));
  }

  return (p) => filters.every((f) => f(p));
}

interface Props {
  conferences: Conference[];
  pokemon: PokemonWithMoves[];
  activeSeasonId: number | null;
  draftedByConference: { conferenceId: number; pokemonIds: number[] }[];
  userConferenceId: number | null;
}

export default function DraftBoard({
  conferences,
  pokemon,
  activeSeasonId,
  draftedByConference: initialDrafted,
  userConferenceId,
}: Props) {
  const defaultConferenceId = userConferenceId ?? conferences[0]?.id ?? null;
  const [selectedConferenceId, setSelectedConferenceId] = useState<number | null>(defaultConferenceId);
  const [rawQuery, setRawQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [draftedMap, setDraftedMap] = useState<Record<number, Set<number>>>(
    () => {
      const map: Record<number, Set<number>> = {};
      for (const { conferenceId, pokemonIds } of initialDrafted) {
        map[conferenceId] = new Set(pokemonIds);
      }
      return map;
    }
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(rawQuery), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [rawQuery]);

  useEffect(() => {
    if (!activeSeasonId) return;
    const supabase = createClient();

    const channel = supabase
      .channel("rosters-live")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rosters" },
        (payload) => {
          const row = payload.new as {
            pokemon_id: number;
            conference_id: number;
            season_id: number;
          };
          if (row.season_id !== activeSeasonId) return;
          setDraftedMap((prev) => {
            const next = new Set(prev[row.conference_id]);
            next.add(row.pokemon_id);
            return { ...prev, [row.conference_id]: next };
          });
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "rosters" },
        (payload) => {
          const row = payload.old as {
            pokemon_id: number;
            conference_id: number;
            season_id: number;
          };
          if (row.season_id !== activeSeasonId) return;
          setDraftedMap((prev) => {
            if (!prev[row.conference_id]) return prev;
            const next = new Set(prev[row.conference_id]);
            next.delete(row.pokemon_id);
            return { ...prev, [row.conference_id]: next };
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeSeasonId]);

  const draftedIds =
    selectedConferenceId !== null
      ? (draftedMap[selectedConferenceId] ?? new Set<number>())
      : new Set<number>();

  const filterFn = useMemo(
    () => buildFilter(debouncedQuery, pokemon),
    [debouncedQuery, pokemon]
  );
  const filteredPokemon = useMemo(
    () => pokemon.filter(filterFn),
    [pokemon, filterFn]
  );

  const groups = useMemo(() => {
    const map = new Map<number, PokemonWithMoves[]>();
    for (const p of filteredPokemon) {
      if (!map.has(p.point_value)) map.set(p.point_value, []);
      map.get(p.point_value)!.push(p);
    }
    return [...map.entries()].sort((a, b) => b[0] - a[0]);
  }, [filteredPokemon]);

  const noResults = !!debouncedQuery.trim() && filteredPokemon.length === 0;

  return (
    <main className="pt-20 pb-16 min-h-screen">
      <div className="max-w-7xl mx-auto px-6">
        {/* Conference toggle */}
        <div className="my-6">
          <div className="bg-white/5 rounded-2xl p-1.5 flex w-full border border-white/10">
            {conferences.map((conf) => {
              const isSelected = selectedConferenceId === conf.id;
              const theme = getConferenceTheme(conf.name);
              return (
                <button
                  key={conf.id}
                  onClick={() => setSelectedConferenceId(conf.id)}
                  className={`flex-1 py-4 rounded-xl font-bold text-xl tracking-wide transition-[color,box-shadow] duration-200 ${
                    isSelected
                      ? "text-white"
                      : "text-gray-400 hover:text-white hover:bg-white/5"
                  }`}
                  style={
                    isSelected
                      ? {
                          background: theme.gradient,
                          boxShadow: theme.shadow,
                          textShadow: "0 1px 4px rgba(0,0,0,0.6)",
                        }
                      : undefined
                  }
                >
                  {conf.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder='Search... e.g. "Water types with Intimidate", "Move Fake Out less than 15 points", "Over 100 speed"'
            value={rawQuery}
            onChange={(e) => setRawQuery(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 transition-colors text-sm"
          />
        </div>

        {/* Live indicator */}
        {activeSeasonId && (
          <div className="flex items-center gap-2 mb-6 text-xs text-gray-500">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse inline-block" />
            Live draft updates enabled
          </div>
        )}

        {/* No results */}
        {noResults && (
          <div className="text-center py-20 text-gray-500 text-sm">
            No pokemon match your search.
          </div>
        )}

        {/* Board rows grouped by point value */}
        {groups.map(([pointValue, group]) => (
          <div key={pointValue} className="mb-10">
            <div className="flex items-center gap-4 mb-5">
              <div className="h-px flex-1 bg-white/10" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-white tabular-nums">
                  {pointValue}
                </span>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  pts
                </span>
              </div>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="flex flex-wrap gap-3">
              {group.map((p) => (
                <PokemonCard
                  key={p.id}
                  pokemon={p}
                  isDrafted={draftedIds.has(p.id)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function PokemonCard({
  pokemon,
  isDrafted,
}: {
  pokemon: PokemonWithMoves;
  isDrafted: boolean;
}) {
  const types = [pokemon.type_1, pokemon.type_2].filter(Boolean) as string[];
  const primaryColor = TYPE_COLORS[pokemon.type_1] ?? "#6b7280";

  return (
    <div className="group relative flex flex-col items-center">
      {/* Card */}
      <div
        className={`relative w-[72px] rounded-lg overflow-hidden border-t-2 border border-white/10 transition-all duration-200 ${
          isDrafted
            ? "opacity-25 grayscale"
            : "hover:scale-110 hover:z-10 hover:border-white/20 cursor-pointer"
        }`}
        style={{ borderTopColor: isDrafted ? "transparent" : primaryColor }}
      >
        {pokemon.dex_number ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${pokemon.dex_number}.png`}
            alt={pokemon.name}
            width={72}
            height={72}
            className="w-full h-auto"
            onError={(e) => {
              e.currentTarget.src = `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.dex_number}.png`;
            }}
          />
        ) : (
          <div className="w-full aspect-square flex items-center justify-center text-gray-600 text-2xl bg-white/5">
            ?
          </div>
        )}
      </div>

      {/* Name */}
      <span
        className={`mt-1 text-[10px] text-center w-[72px] truncate leading-tight ${
          isDrafted ? "text-gray-600" : "text-gray-300"
        }`}
      >
        {pokemon.name}
      </span>

      {/* Hover tooltip */}
      {!isDrafted && (
        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-[#12122a] border border-white/15 rounded-xl px-3 py-2.5 opacity-0 group-hover:opacity-100 pointer-events-none z-30 transition-opacity shadow-2xl min-w-[160px]">
          <p className="font-semibold text-white text-sm">{pokemon.name}</p>

          {/* Types */}
          <div className="flex gap-1 mt-1">
            {types.map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                style={{
                  backgroundColor: (TYPE_COLORS[t] ?? "#6b7280") + "33",
                  color: TYPE_COLORS[t] ?? "#9ca3af",
                }}
              >
                {t}
              </span>
            ))}
          </div>

          {/* Abilities */}
          <p className="text-gray-500 text-[10px] mt-1.5">
            {[pokemon.ability_1, pokemon.ability_2, pokemon.hidden_ability]
              .filter(Boolean)
              .join(" · ")}
          </p>

          {/* Stats */}
          <div className="mt-1.5 grid grid-cols-3 gap-x-3 gap-y-0.5 text-[10px] text-gray-500">
            {(
              [
                ["HP", pokemon.hp],
                ["Atk", pokemon.atk],
                ["Def", pokemon.def],
                ["SpA", pokemon.spa],
                ["SpD", pokemon.spd],
                ["Spe", pokemon.spe],
              ] as [string, number][]
            ).map(([label, val]) => (
              <span key={label}>
                {label}{" "}
                <span className="text-gray-300 font-medium">{val}</span>
              </span>
            ))}
          </div>

          {/* Notable moves */}
          {pokemon.moves.length > 0 && (
            <p className="text-indigo-400 text-[10px] mt-1.5 leading-tight">
              {pokemon.moves.map((m) => m.name).join(", ")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
