"use client";

import { ATTACKING_TYPES, getEffectiveness, typeColor } from "@/lib/pokemon-types";
import { ImportantMove, PokemonWithMoves } from "@/types/database";
import { useEffect, useMemo, useState } from "react";

const SLOT_COUNT = 12;
const DEFAULT_BUDGET = 115;
const STORAGE_KEY = "titan-pdl-draft-teams";

const DEFAULT_MOVE_NAMES = [
  "Fake Out", "Follow Me", "Rage Powder", "Tailwind", "Trick Room",
  "Imprison", "Icy Wind", "Encore", "Taunt", "Thunder Wave",
  "Will-O-Wisp", "Wide Guard", "Haze", "Aurora Veil", "Reflect", "Light Screen",
];

// ─── Types ────────────────────────────────────────────────────────────────────

type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe" | "bst";

interface SavedTeam {
  id: string;
  name: string;
  slotIds: (number | null)[];
  budget: number;
  savedAt: string;
}

// ─── Storage ──────────────────────────────────────────────────────────────────

function readTeams(): SavedTeam[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}
function writeTeams(t: SavedTeam[]) { localStorage.setItem(STORAGE_KEY, JSON.stringify(t)); }

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function titleCase(s: string) { return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase(); }
function formatAbility(s: string) { return s.replace(/-/g, " "); }
function spriteUrl(n: number, large = false) {
  return large
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${n}.png`
    : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${n}.png`;
}
function bst(p: PokemonWithMoves) { return p.hp + p.atk + p.def + p.spa + p.spd + p.spe; }
function avg(nums: number[]) {
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
}

// ─── Type chart cell helpers ──────────────────────────────────────────────────

function effLabel(e: number) {
  if (e === 0) return "0"; if (e === 0.25) return "¼"; if (e === 0.5) return "½";
  if (e === 2) return "2"; if (e === 4) return "4"; return "";
}
function effBg(e: number): string {
  if (e === 0)    return "#14532d";
  if (e === 0.25) return "#166534";
  if (e === 0.5)  return "#15803d";
  if (e === 2)    return "#b91c1c";
  if (e === 4)    return "#7f1d1d";
  return "transparent";
}
function ovrScore(pokemon: PokemonWithMoves[], type: string) {
  return pokemon.reduce((sum, p) => {
    const e = getEffectiveness(type, p.type_1, p.type_2);
    if (e === 0 || e === 0.25) return sum - 2;
    if (e === 0.5) return sum - 1;
    if (e === 2) return sum + 1;
    if (e === 4) return sum + 2;
    return sum;
  }, 0);
}
function ovrBg(score: number): string {
  if (score >= 3) return "#7f1d1d";
  if (score >= 1) return "#b91c1c";
  if (score <= -3) return "#14532d";
  if (score <= -1) return "#166534";
  return "#1f2937";
}

// ─── Shared components ────────────────────────────────────────────────────────

function PokeballIcon({ className, filled = false }: { className?: string; filled?: boolean }) {
  if (filled) return (
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
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" stroke="currentColor" strokeWidth="5">
      <circle cx="50" cy="50" r="45" /><line x1="5" y1="50" x2="95" y2="50" />
      <circle cx="50" cy="50" r="14" /><circle cx="50" cy="50" r="6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function TypeBadge({ type, small }: { type: string; small?: boolean }) {
  const c = typeColor(type);
  return (
    <span
      className={small ? "text-[10px] px-1.5 py-0 rounded font-semibold leading-tight" : "text-xs px-2 py-0.5 rounded font-semibold"}
      style={{ backgroundColor: c + "33", color: c }}
    >
      {titleCase(type)}
    </span>
  );
}

function SpriteOrBall({ dexNumber, name, className }: {
  dexNumber: number | null | undefined;
  name?: string;
  className: string;
}) {
  const [attempt, setAttempt] = useState<"small" | "large" | "ball">("small");
  if (!dexNumber || attempt === "ball") return <PokeballIcon className={className} filled />;
  const src = attempt === "small" ? spriteUrl(dexNumber) : spriteUrl(dexNumber, true);
  return (
    <div className={`overflow-hidden shrink-0 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={name ?? ""} title={name}
        className="w-full h-full object-contain"
        style={{ transform: "scale(1.7)", transformOrigin: "center 30%" }}
        onError={() => setAttempt((a) => a === "small" ? "large" : "ball")} />
    </div>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest shrink-0">{label}</span>
      <div className="flex-1 border-t border-white/10" />
    </div>
  );
}

// ─── Type Chart view ──────────────────────────────────────────────────────────

function TypeChartView({ slots }: { slots: (PokemonWithMoves | null)[] }) {
  const selected = slots.filter(Boolean) as PokemonWithMoves[];

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-[11px] border-collapse">
        <thead>
          <tr>
            {/* Narrower name col so table fits without horizontal scroll */}
            <th className="w-24 px-2 py-1 text-left text-gray-500 font-medium border-b border-white/10 bg-white/5 sticky left-0 z-10" />
            {ATTACKING_TYPES.map((t) => {
              const c = typeColor(t);
              return (
                <th key={t} className="px-0.5 py-1 text-center font-semibold border-b border-white/10 bg-white/5 min-w-[30px]"
                  style={{ color: c }}>
                  {t.slice(0, 3)}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {slots.map((slot, i) => (
            <tr key={i} className="border-b border-white/5" style={{ height: "28px" }}>
              <td className="px-1 bg-white/[0.02] sticky left-0">
                {slot ? (
                  <div className="flex items-center gap-1 h-full">
                    <SpriteOrBall dexNumber={slot.dex_number} name={slot.name} className="w-5 h-5 shrink-0" />
                    <span className="text-gray-300 truncate max-w-[52px] text-[10px]">{slot.name}</span>
                  </div>
                ) : (
                  <span className="text-gray-700 text-[10px]">{i + 1}</span>
                )}
              </td>
              {ATTACKING_TYPES.map((t) => {
                if (!slot) return <td key={t} className="px-0.5 text-center" />;
                const e = getEffectiveness(t, slot.type_1, slot.type_2);
                const label = effLabel(e);
                return (
                  <td key={t} className="px-0.5 text-center font-bold"
                    style={{ backgroundColor: effBg(e), color: e !== 1 ? "#fff" : "transparent" }}>
                    {label}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-white/20">
            <td className="px-2 py-1 text-[9px] font-bold text-gray-400 bg-white/5 sticky left-0">Overall</td>
            {ATTACKING_TYPES.map((t) => {
              const score = ovrScore(selected, t);
              return (
                <td key={t} className="px-0.5 py-1"
                  style={{ backgroundColor: ovrBg(score) }} />
              );
            })}
          </tr>
          <tr>
            <td className="px-2 py-1 text-[9px] font-bold text-gray-400 bg-white/5 rounded-bl-xl sticky left-0">Type Count</td>
            {ATTACKING_TYPES.map((t) => {
              const count = selected.filter(
                (p) => p.type_1.toLowerCase() === t.toLowerCase() || p.type_2?.toLowerCase() === t.toLowerCase()
              ).length;
              return (
                <td key={t} className="px-0.5 py-1 text-center text-[10px] font-bold"
                  style={{ color: count > 0 ? typeColor(t) : "#4b5563" }}>
                  {count}
                </td>
              );
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Stats view ───────────────────────────────────────────────────────────────

const STAT_COLS: { key: StatKey; label: string }[] = [
  { key: "hp", label: "HP" }, { key: "atk", label: "Atk" }, { key: "def", label: "Def" },
  { key: "spa", label: "SpA" }, { key: "spd", label: "SpD" }, { key: "spe", label: "Spe" },
  { key: "bst", label: "BST" },
];

function statVal(p: PokemonWithMoves, key: StatKey) {
  return key === "bst" ? bst(p) : p[key];
}

function StatsView({ slots }: { slots: (PokemonWithMoves | null)[] }) {
  const [sort, setSort] = useState<StatKey>("spe");
  const [dir, setDir] = useState<1 | -1>(-1);
  const selected = slots.filter(Boolean) as PokemonWithMoves[];

  function handleSort(key: StatKey) {
    if (sort === key) setDir((d) => (d === -1 ? 1 : -1));
    else { setSort(key); setDir(-1); }
  }

  const sorted = [...selected].sort((a, b) => (statVal(a, sort) - statVal(b, sort)) * dir);
  const emptyCount = slots.length - selected.length;

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03]">
            <th className="w-5 pl-1.5" />
            <th className="text-left px-1 py-1 text-[10px] text-gray-400 font-medium">Name</th>
            {STAT_COLS.map(({ key, label }) => (
              <th key={key}
                onClick={() => handleSort(key)}
                className="w-8 px-0.5 py-1 text-center text-[10px] font-semibold cursor-pointer select-none transition-colors hover:text-white"
                style={{ color: sort === key ? "#a5b4fc" : "#6b7280", backgroundColor: sort === key ? "rgba(99,102,241,0.1)" : undefined }}>
                {label}{sort === key ? (dir === -1 ? "↓" : "↑") : ""}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => (
            <tr key={p.id} className={`border-b border-white/5 ${i % 2 === 0 ? "" : "bg-white/[0.02]"}`}>
              <td className="pl-1.5 py-0.5">
                <SpriteOrBall dexNumber={p.dex_number} name={p.name} className="w-5 h-5" />
              </td>
              <td className="px-1 py-0.5 text-[11px] font-medium text-gray-200 truncate max-w-[80px]">{p.name}</td>
              {STAT_COLS.map(({ key }) => (
                <td key={key} className="px-0.5 py-0.5 text-center text-[11px] font-mono w-8"
                  style={{
                    color: sort === key ? "#c7d2fe" : "#9ca3af",
                    backgroundColor: sort === key ? "rgba(99,102,241,0.08)" : undefined,
                    fontWeight: sort === key ? 700 : 400,
                  }}>
                  {statVal(p, key)}
                </td>
              ))}
            </tr>
          ))}
          {Array.from({ length: emptyCount }).map((_, i) => (
            <tr key={`empty-${i}`} className={`border-b border-white/5 ${(sorted.length + i) % 2 === 0 ? "" : "bg-white/[0.02]"}`}>
              <td className="pl-1.5 py-0.5">
                <PokeballIcon className="w-5 h-5 text-gray-800" />
              </td>
              <td className="px-1 py-0.5 text-[11px] text-gray-700">—</td>
              {STAT_COLS.map(({ key }) => (
                <td key={key} className="px-0.5 py-0.5 text-center text-[11px] text-gray-800 w-8">—</td>
              ))}
            </tr>
          ))}
        </tbody>
        {selected.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-white/20 bg-white/[0.04]">
              <td />
              <td className="px-1 py-0.5 text-[9px] font-bold text-gray-500">AVG</td>
              {STAT_COLS.map(({ key }) => {
                const vals = selected.map((p) => statVal(p, key));
                const a = avg(vals);
                return (
                  <td key={key} className="px-0.5 py-0.5 text-center text-[10px] font-bold w-8"
                    style={{ color: sort === key ? "#818cf8" : "#6b7280", backgroundColor: sort === key ? "rgba(99,102,241,0.08)" : undefined }}>
                    {a}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// ─── Moves view ───────────────────────────────────────────────────────────────

function MovesView({
  slots, allMoves, selectedMoves, setSelectedMoves,
}: {
  slots: (PokemonWithMoves | null)[];
  allMoves: ImportantMove[];
  selectedMoves: (number | null)[];
  setSelectedMoves: React.Dispatch<React.SetStateAction<(number | null)[]>>;
}) {
  const selected = slots.filter(Boolean) as PokemonWithMoves[];
  const usedMoveIds = new Set(selectedMoves.filter(Boolean));

  function setMove(i: number, id: string) {
    setSelectedMoves((prev) => { const n = [...prev]; n[i] = id ? Number(id) : null; return n; });
  }

  return (
    <div className="flex flex-col gap-1">
      {selectedMoves.map((moveId, i) => {
        const learnedBy = moveId
          ? selected.filter((p) => p.moves.some((m) => m.id === moveId))
          : [];
        return (
          <div key={i} className="flex items-center gap-1.5 bg-white/[0.03] border border-white/10 rounded-md px-2 py-0.5">
            <select
              value={moveId ?? ""}
              onChange={(e) => setMove(i, e.target.value)}
              className="w-36 shrink-0 bg-[#12122a] border border-white/10 rounded px-1 py-0.5 text-[11px] text-white focus:outline-none focus:border-indigo-500 transition-colors"
            >
              <option value="">— None —</option>
              {allMoves.map((m) => (
                <option key={m.id} value={m.id} disabled={usedMoveIds.has(m.id) && moveId !== m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <div className="flex items-center gap-0.5 shrink-0">
              {learnedBy.map((p) => (
                <SpriteOrBall key={p.id} dexNumber={p.dex_number} name={p.name} className="w-5 h-5" />
              ))}
              {moveId && learnedBy.length === 0 && (
                <span className="text-[10px] text-gray-600 italic">—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props { pokemon: PokemonWithMoves[] }

export default function DraftPlanner({ pokemon }: Props) {
  const [teamName, setTeamName] = useState("My New Team");
  const [currentTeamId, setCurrentTeamId] = useState<string | null>(null);
  const [slots, setSlots] = useState<(PokemonWithMoves | null)[]>(Array(SLOT_COUNT).fill(null));
  const [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [showBudgetEdit, setShowBudgetEdit] = useState(false);
  const [brokenArtwork, setBrokenArtwork] = useState<Set<number>>(new Set());
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedTeams, setSavedTeams] = useState<SavedTeam[]>([]);
  const [saveFlash, setSaveFlash] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedMoves, setSelectedMoves] = useState<(number | null)[]>(() => {
    const nameToId = new Map<string, number>();
    pokemon.forEach((p) => p.moves.forEach((m) => nameToId.set(m.name.toLowerCase(), m.id)));
    return DEFAULT_MOVE_NAMES.map((name) => nameToId.get(name.toLowerCase()) ?? null);
  });

  useEffect(() => { setSavedTeams(readTeams()); }, []);

  const usedIds = new Set(slots.flatMap((p) => (p ? [p.id] : [])));
  const pointsSpent = slots.reduce((sum, p) => sum + (p?.point_value ?? 0), 0);
  const pointsRemaining = budget - pointsSpent;
  const overBudget = pointsRemaining < 0;

  const sortedPokemon = useMemo(() => [...pokemon].sort((a, b) => a.name.localeCompare(b.name)), [pokemon]);

  const allMoves = useMemo(() => {
    const map = new Map<number, ImportantMove>();
    pokemon.forEach((p) => p.moves.forEach((m) => map.set(m.id, m)));
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [pokemon]);

  function setSlot(index: number, id: string) {
    const found = id ? (pokemon.find((p) => p.id === Number(id)) ?? null) : null;
    setSlots((prev) => { const n = [...prev]; n[index] = found; return n; });
    setBrokenArtwork((prev) => { const n = new Set(prev); n.delete(index); return n; });
  }

  function handleSave() {
    const existing = readTeams();
    const slotIds = slots.map((s) => s?.id ?? null);
    let updated: SavedTeam[];
    if (currentTeamId) {
      updated = existing.map((t) =>
        t.id === currentTeamId ? { ...t, name: teamName, slotIds, budget, savedAt: new Date().toISOString() } : t
      );
    } else {
      const nt: SavedTeam = { id: Date.now().toString(), name: teamName, slotIds, budget, savedAt: new Date().toISOString() };
      updated = [...existing, nt];
      setCurrentTeamId(nt.id);
    }
    writeTeams(updated); setSavedTeams(updated);
    setSaveFlash(true); setTimeout(() => setSaveFlash(false), 1200);
  }

  function handleLoad(team: SavedTeam) {
    setSlots(team.slotIds.map((id) => (id ? (pokemon.find((p) => p.id === id) ?? null) : null)));
    setTeamName(team.name); setBudget(team.budget ?? DEFAULT_BUDGET);
    setCurrentTeamId(team.id);
    setShowLoadModal(false);
  }

  function handleDelete(id: string) {
    const updated = readTeams().filter((t) => t.id !== id);
    writeTeams(updated); setSavedTeams(updated);
    if (currentTeamId === id) setCurrentTeamId(null);
  }

  return (
    // Fixed-height layout so the entire page fits in the viewport without scrolling
    <main className="h-screen pt-20 overflow-hidden flex flex-col bg-[#0a0a1a]">
      <div className="flex-1 w-full px-3 py-3 flex flex-col min-h-0">

        {/* Header — spacer matches left col width so team name aligns with center column */}
        <div className="flex items-center mb-3 shrink-0 gap-4">
          <div className="w-80 shrink-0" />
          <div className="flex items-center gap-1.5">
          <input type="text" value={teamName} onChange={(e) => setTeamName(e.target.value)}
            className="text-xl font-bold text-white bg-transparent border-b border-transparent hover:border-white/20 focus:border-white/40 focus:outline-none w-44 min-w-0" />

          <button onClick={handleSave} title="Save team"
            className={`p-1.5 rounded transition-colors ${saveFlash ? "text-emerald-400" : "text-gray-500 hover:text-white"}`}>
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M3 4a1 1 0 011-1h9.586a1 1 0 01.707.293l2.414 2.414A1 1 0 0117 6.414V16a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm9 1v3H6V5H4v11h12V6.414L13.586 5H12zM6 11h8v4H6v-4z" />
            </svg>
          </button>

          <button onClick={() => { setSavedTeams(readTeams()); setShowLoadModal(true); }} title="Load team"
            className="p-1.5 rounded text-gray-500 hover:text-white transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
            </svg>
          </button>

          {currentTeamId && (
            confirmDeleteId === currentTeamId ? (
              <span className="flex items-center gap-1 text-sm">
                <span className="text-gray-400">Delete?</span>
                <button onClick={() => { handleDelete(currentTeamId); setConfirmDeleteId(null); }}
                  className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors font-medium text-xs">Yes</button>
                <button onClick={() => setConfirmDeleteId(null)}
                  className="px-2 py-0.5 rounded bg-white/5 text-gray-400 hover:bg-white/10 transition-colors font-medium text-xs">No</button>
              </span>
            ) : (
              <button onClick={() => setConfirmDeleteId(currentTeamId)} title="Delete this team"
                className="p-1.5 rounded text-gray-500 hover:text-red-400 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            )
          )}
          </div>
        </div>

        {/* 3-column layout — fills remaining viewport height */}
        <div className="flex-1 flex gap-4 min-h-0">

          {/* ── Col 1: Selectors ── */}
          <div className="w-80 shrink-0 flex flex-col gap-1.5 overflow-y-auto">
            {slots.map((slot, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="w-8 h-8 shrink-0 flex items-center justify-center">
                  {!slot ? (
                    <PokeballIcon className="w-6 h-6 text-gray-700" />
                  ) : (
                    <SpriteOrBall dexNumber={slot.dex_number} name={slot.name} className="w-8 h-8" />
                  )}
                </div>
                <select value={slot?.id ?? ""} onChange={(e) => setSlot(i, e.target.value)}
                  className="flex-1 min-w-0 bg-[#12122a] border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors">
                  <option value="">— Empty —</option>
                  {sortedPokemon.map((p) => (
                    <option key={p.id} value={p.id} disabled={usedIds.has(p.id) && slot?.id !== p.id}>{p.name}</option>
                  ))}
                </select>
                <span className="text-xs font-mono w-7 text-right shrink-0 text-gray-300">
                  {slot ? slot.point_value : <span className="text-gray-600">—</span>}
                </span>
              </div>
            ))}

            <div className="mt-2 border-t border-white/10 pt-2 shrink-0">
              {showBudgetEdit && (
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs text-gray-500">Budget</span>
                  <input type="number" min={0} value={budget} autoFocus
                    onChange={(e) => setBudget(Math.max(0, Number(e.target.value)))}
                    className="w-20 bg-[#12122a] border border-white/10 rounded-lg px-2 py-0.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-colors" />
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm text-gray-400">Spent: <span className="text-white font-semibold">{pointsSpent}</span></span>
                  <span className={`text-sm font-semibold ${overBudget ? "text-red-400" : "text-emerald-400"}`}>
                    Remaining: {pointsRemaining}
                  </span>
                  {overBudget && <span className="text-[10px] text-red-400">Over by {Math.abs(pointsRemaining)}</span>}
                </div>
                <button onClick={() => setShowBudgetEdit((v) => !v)} title="Configure budget"
                  className="text-gray-600 hover:text-gray-300 transition-colors p-1 rounded">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* ── Col 2: Pokémon grid (fills space) + Type Chart (anchored at bottom) ── */}
          <div className="flex-1 flex flex-col gap-3 min-h-0">

            {/* Pokémon grid — flex-1, takes all space above the type chart */}
            <div className="flex-1 flex flex-col min-h-0">
              <SectionHeading label="Pokémon" />
              <div className="flex-1 min-h-0 grid grid-cols-6 gap-1.5" style={{ gridTemplateRows: "1fr 1fr" }}>
                {slots.map((slot, i) => (
                  <div key={i}
                    className="bg-white/5 border border-white/10 rounded-xl overflow-hidden flex flex-col p-2 gap-1">
                    {slot ? (
                      <>
                        <div className="flex-1 min-h-0 flex items-center justify-center">
                          {slot.dex_number && !brokenArtwork.has(i) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={spriteUrl(slot.dex_number, true)} alt={slot.name}
                              className="h-full w-full object-contain"
                              onError={(e) => {
                                if (e.currentTarget.src.includes("official-artwork")) {
                                  e.currentTarget.src = spriteUrl(slot.dex_number!);
                                } else {
                                  setBrokenArtwork((p) => new Set([...p, i]));
                                }
                              }} />
                          ) : (
                            <PokeballIcon className="w-12 h-12" filled />
                          )}
                        </div>
                        <div className="shrink-0 h-[90px] flex flex-col items-center justify-start gap-0.5 pt-1">
                          <span className="text-xs font-bold text-white text-center leading-tight truncate w-full">{slot.name}</span>
                          <div className="flex flex-wrap gap-0.5 justify-center">
                            <TypeBadge type={slot.type_1} small />
                            {slot.type_2 && <TypeBadge type={slot.type_2} small />}
                          </div>
                          <span className="text-[10px] leading-[14px] text-gray-400 truncate w-full text-center">
                            {slot.ability_1 ? formatAbility(slot.ability_1) : " "}
                          </span>
                          <span className="text-[10px] leading-[14px] text-gray-400 truncate w-full text-center">
                            {slot.ability_2 ? formatAbility(slot.ability_2) : " "}
                          </span>
                          <span className="text-[10px] leading-[14px] text-indigo-400 truncate w-full text-center">
                            {slot.hidden_ability ? <>{formatAbility(slot.hidden_ability)} <span className="text-gray-600">(H)</span></> : " "}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center opacity-15 gap-1">
                        <PokeballIcon className="w-8 h-8 text-gray-400" />
                        <span className="text-[10px] text-gray-400">{i + 1}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Type Chart — shrink-0, anchored at bottom of center column */}
            <div className="shrink-0">
              <SectionHeading label="Type Chart" />
              <TypeChartView slots={slots} />
            </div>

          </div>

          {/* ── Col 3: Stats + Moves ── */}
          <div className="w-[340px] shrink-0 flex flex-col gap-3 min-h-0">

            {/* Stats — shrinks to content, so Moves gets the rest */}
            <div className="shrink-0">
              <SectionHeading label="Stats" />
              <StatsView slots={slots} />
            </div>

            {/* Moves — fills remaining height, scrolls internally if needed */}
            <div className="flex-1 flex flex-col min-h-0">
              <SectionHeading label="Moves" />
              <div className="flex-1 min-h-0 overflow-y-auto">
                <MovesView slots={slots} allMoves={allMoves}
                  selectedMoves={selectedMoves} setSelectedMoves={setSelectedMoves} />
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Load modal */}
      {showLoadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowLoadModal(false)}>
          <div className="bg-[#12122a] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Load Team</h2>
              <button onClick={() => setShowLoadModal(false)} className="text-gray-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            {savedTeams.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-8">No saved teams yet.</p>
            ) : (
              <ul className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                {savedTeams.map((team) => (
                  <li key={team.id}
                    className="flex items-center gap-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl px-4 py-3 cursor-pointer transition-colors group"
                    onClick={() => handleLoad(team)}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{team.name}</p>
                      <p className="text-xs text-gray-500">
                        {team.slotIds.filter(Boolean).length} Pokémon · {new Date(team.savedAt).toLocaleDateString()}
                      </p>
                    </div>
                    {confirmDeleteId === team.id ? (
                      <span className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button onClick={() => { handleDelete(team.id); setConfirmDeleteId(null); }}
                          className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 hover:bg-red-500/40 transition-colors text-xs font-medium">Yes</button>
                        <button onClick={() => setConfirmDeleteId(null)}
                          className="px-2 py-0.5 rounded bg-white/5 text-gray-400 hover:bg-white/10 transition-colors text-xs font-medium">No</button>
                      </span>
                    ) : (
                      <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(team.id); }}
                        className="text-gray-600 hover:text-red-400 transition-colors shrink-0 opacity-0 group-hover:opacity-100" title="Delete">
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
