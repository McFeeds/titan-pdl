"use client";

import { PokemonWithMoves } from "@/types/database";
import { useState } from "react";

const TYPE_COLORS: Record<string, string> = {
  Normal: "#A8A878", Fire: "#F08030", Water: "#6890F0", Electric: "#F8D030",
  Grass: "#78C850", Ice: "#98D8D8", Fighting: "#C03028", Poison: "#A040A0",
  Ground: "#E0C068", Flying: "#A890F0", Psychic: "#F85888", Bug: "#A8B820",
  Rock: "#B8A038", Ghost: "#705898", Dragon: "#7038F8", Dark: "#705848",
  Steel: "#B8B8D0", Fairy: "#EE99AC",
};

const SLOT_COUNT = 12;
const DEFAULT_BUDGET = 120;

function typeColor(type: string): string {
  const key = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  return TYPE_COLORS[key] ?? "#6b7280";
}

function titleCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

function formatAbility(name: string): string {
  return name.replace(/-/g, " ");
}

function spriteUrl(dexNumber: number, large = false): string {
  return large
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dexNumber}.png`
    : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${dexNumber}.png`;
}

// outline = empty slot, filled = pokemon selected but no image available
function PokeballIcon({ className, filled = false }: { className?: string; filled?: boolean }) {
  if (filled) {
    return (
      <svg viewBox="0 0 100 100" className={className}>
        <path d="M 5 50 A 45 45 0 0 1 95 50 Z" fill="#EF4444" />
        <path d="M 5 50 A 45 45 0 0 0 95 50 Z" fill="white" />
        <circle cx="50" cy="50" r="45" fill="none" stroke="#6b7280" strokeWidth="4" />
        <line x1="5" y1="50" x2="36" y2="50" stroke="#6b7280" strokeWidth="4" />
        <line x1="64" y1="50" x2="95" y2="50" stroke="#6b7280" strokeWidth="4" />
        <circle cx="50" cy="50" r="14" fill="white" stroke="#6b7280" strokeWidth="4" />
        <circle cx="50" cy="50" r="6" fill="#374151" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="5">
      <circle cx="50" cy="50" r="45" />
      <line x1="5" y1="50" x2="95" y2="50" />
      <circle cx="50" cy="50" r="14" />
      <circle cx="50" cy="50" r="6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TypeBadge({ type }: { type: string }) {
  const color = typeColor(type);
  return (
    <span
      className="text-xs px-2 py-0.5 rounded font-semibold"
      style={{ backgroundColor: color + "33", color }}
    >
      {titleCase(type)}
    </span>
  );
}

interface Props {
  pokemon: PokemonWithMoves[];
}

export default function DraftPlanner({ pokemon }: Props) {
  const [slots, setSlots] = useState<(PokemonWithMoves | null)[]>(
    Array(SLOT_COUNT).fill(null)
  );
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [showBudgetEdit, setShowBudgetEdit] = useState(false);
  // Track broken images per slot index, cleared when the slot selection changes
  const [brokenIcons, setBrokenIcons] = useState<Set<number>>(new Set());
  const [brokenArtwork, setBrokenArtwork] = useState<Set<number>>(new Set());

  const usedIds = new Set(slots.flatMap((p) => (p ? [p.id] : [])));
  const pointsSpent = slots.reduce((sum, p) => sum + (p?.point_value ?? 0), 0);
  const pointsRemaining = budget - pointsSpent;
  const overBudget = pointsRemaining < 0;

  function setSlot(index: number, id: string) {
    const found = id ? (pokemon.find((p) => p.id === Number(id)) ?? null) : null;
    setSlots((prev) => {
      const next = [...prev];
      next[index] = found;
      return next;
    });
    setBrokenIcons((prev) => { const n = new Set(prev); n.delete(index); return n; });
    setBrokenArtwork((prev) => { const n = new Set(prev); n.delete(index); return n; });
  }

  function markIconBroken(index: number) {
    setBrokenIcons((prev) => new Set([...prev, index]));
  }

  function markArtworkBroken(index: number) {
    setBrokenArtwork((prev) => new Set([...prev, index]));
  }

  return (
    <main className="pt-20 pb-16 min-h-screen">
      <div className="max-w-[1400px] mx-auto px-6">
        <h1 className="text-2xl font-bold text-white mt-6 mb-6">Draft Planner</h1>

        <div className="flex gap-6 items-stretch">

          {/* ── Left panel: 12 selection slots + budget ── */}
          <div className="w-80 shrink-0 flex flex-col gap-2">
            {slots.map((slot, i) => (
              <div key={i} className="flex items-center gap-2">
                {/* Small sprite — never overlaid, always conditional */}
                <div className="w-10 h-10 shrink-0 flex items-center justify-center">
                  {!slot ? (
                    // Empty: dim outline pokeball
                    <PokeballIcon className="w-7 h-7 text-gray-700" />
                  ) : slot.dex_number && !brokenIcons.has(i) ? (
                    // Pokemon with (hopefully) working sprite
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={spriteUrl(slot.dex_number)}
                      alt={slot.name}
                      className="w-10 h-10 object-contain"
                      onError={() => markIconBroken(i)}
                    />
                  ) : (
                    // Pokemon selected but no sprite — red/white pokeball
                    <PokeballIcon className="w-7 h-7" filled />
                  )}
                </div>

                {/* Selector */}
                <select
                  value={slot?.id ?? ""}
                  onChange={(e) => setSlot(i, e.target.value)}
                  className="flex-1 min-w-0 bg-[#12122a] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                >
                  <option value="">— Empty —</option>
                  {pokemon.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={usedIds.has(p.id) && slot?.id !== p.id}
                    >
                      {p.name}
                    </option>
                  ))}
                </select>

                {/* Point value */}
                <span className="text-sm font-mono w-8 text-right shrink-0 text-gray-300">
                  {slot ? slot.point_value : <span className="text-gray-600">—</span>}
                </span>
              </div>
            ))}

            {/* Budget / remaining */}
            <div className="mt-3 border-t border-white/10 pt-3">
              {showBudgetEdit && (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-500">Budget</span>
                  <input
                    type="number"
                    min={0}
                    value={budget}
                    onChange={(e) => setBudget(Math.max(0, Number(e.target.value)))}
                    className="w-24 bg-[#12122a] border border-white/10 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
                    autoFocus
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-base text-gray-400">
                    Spent: <span className="text-white font-semibold">{pointsSpent}</span>
                  </span>
                  <span className={`text-base font-semibold ${overBudget ? "text-red-400" : "text-emerald-400"}`}>
                    Remaining: {pointsRemaining}
                  </span>
                  {overBudget && (
                    <span className="text-xs text-red-400">Over by {Math.abs(pointsRemaining)}</span>
                  )}
                </div>
                <button
                  onClick={() => setShowBudgetEdit((v) => !v)}
                  title="Configure budget"
                  className="text-gray-600 hover:text-gray-300 transition-colors p-1 rounded"
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* ── Right panel: 6×2 grid with explicit fixed row heights ── */}
          <div
            className="flex-1 grid grid-cols-6 gap-3"
            style={{ gridTemplateRows: "320px 320px" }}
          >
            {slots.map((slot, i) => (
              <div
                key={i}
                className="bg-white/5 border border-white/10 rounded-xl flex flex-col overflow-hidden p-3 gap-1.5"
              >
                {slot ? (
                  <>
                    {/* Artwork — never overlaid, always conditional */}
                    <div className="flex-1 min-h-0 flex items-center justify-center">
                      {slot.dex_number && !brokenArtwork.has(i) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={spriteUrl(slot.dex_number, true)}
                          alt={slot.name}
                          className="h-full w-full object-contain"
                          onError={(e) => {
                            // Cascade: official artwork → small sprite → pokeball
                            if (e.currentTarget.src.includes("official-artwork")) {
                              e.currentTarget.src = spriteUrl(slot.dex_number!);
                            } else {
                              markArtworkBroken(i);
                            }
                          }}
                        />
                      ) : (
                        <PokeballIcon className="w-20 h-20" filled />
                      )}
                    </div>

                    {/* Info — fixed height so every card's image fills identical space */}
                    <div className="shrink-0 h-[86px] flex flex-col items-center justify-start gap-1">
                      <span className="text-xs font-bold text-white text-center leading-tight">
                        {slot.name}
                      </span>
                      <div className="flex flex-wrap gap-1 justify-center">
                        <TypeBadge type={slot.type_1} />
                        {slot.type_2 && <TypeBadge type={slot.type_2} />}
                      </div>
                      <div className="text-center flex flex-col w-full" style={{ gap: 2 }}>
                        <span className="text-[10px] leading-[14px] text-gray-400 truncate block">
                          {slot.ability_1 ? formatAbility(slot.ability_1) : " "}
                        </span>
                        <span className="text-[10px] leading-[14px] text-gray-400 truncate block">
                          {slot.ability_2 ? formatAbility(slot.ability_2) : " "}
                        </span>
                        <span className="text-[10px] leading-[14px] text-indigo-400 truncate block">
                          {slot.hidden_ability
                            ? <>{formatAbility(slot.hidden_ability)} <span className="text-gray-600">(H)</span></>
                            : " "}
                        </span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-20">
                    <PokeballIcon className="w-12 h-12 text-gray-400" />
                    <span className="text-xs text-gray-400">{i + 1}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
