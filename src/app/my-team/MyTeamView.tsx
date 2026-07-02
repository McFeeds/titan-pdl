"use client";

import { useState } from "react";
import { typeColor } from "@/lib/pokemon-types";
import type { Pokemon, RosterPokemon } from "@/types/database";
import { updateRosterNickname } from "./actions";

// --- Types ---

interface PokemonStat {
  pokemon_id: number;
  brought: number;
  kills: number;
  deaths: number;
}

interface ScheduleEntry {
  id: number;
  week_number: number;
  played_at: string | null;
  is_home: boolean;
  opponent: { id: number; team_name: string; logo_url: string | null };
  my_games_won: number;
  opp_games_won: number;
  total_games: number;
}

interface Props {
  team: { id: number; team_name: string; logo_url: string | null };
  teamId: number;
  seasonId: number;
  roster: RosterPokemon[];
  schedule: ScheduleEntry[];
  pokemonStats: PokemonStat[];
  totalGamesPlayed: number;
  record: { wins: number; losses: number };
}

// --- Shared helpers ---

function titleCase(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

function spriteUrl(n: number, large = false) {
  return large
    ? `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${n}.png`
    : `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${n}.png`;
}

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
      <circle cx="50" cy="50" r="45" />
      <line x1="5" y1="50" x2="95" y2="50" />
      <circle cx="50" cy="50" r="14" />
      <circle cx="50" cy="50" r="6" fill="currentColor" stroke="none" />
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

function SectionHeading({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 mb-3">
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest shrink-0">{label}</span>
      <div className="flex-1 border-t border-white/10" />
    </div>
  );
}

// --- Pokemon card for the roster grid ---

function PokemonCard({ pokemon, seasonId }: { pokemon: RosterPokemon; seasonId: number }) {
  const [attempt, setAttempt] = useState<"large" | "small" | "ball">("large");
  const [editing, setEditing] = useState(false);
  const [inputValue, setInputValue] = useState(pokemon.nickname ?? "");
  const [displayedNickname, setDisplayedNickname] = useState<string | null>(pokemon.nickname);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const trimmed = inputValue.trim() || null;
    if (trimmed === displayedNickname) { setEditing(false); return; }
    setSaving(true);
    const { error } = await updateRosterNickname(pokemon.id, seasonId, trimmed);
    setSaving(false);
    if (!error) {
      setDisplayedNickname(trimmed);
      setEditing(false);
    } else {
      setInputValue(displayedNickname ?? "");
      setEditing(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") { setInputValue(displayedNickname ?? ""); setEditing(false); }
  }

  return (
    <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden flex flex-col">
      {/* Nickname slot */}
      <div className="px-2 pt-1.5 h-[22px] flex items-center justify-center">
        {editing ? (
          <input
            autoFocus
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={handleKeyDown}
            className="w-full text-[10px] text-center bg-white/10 text-indigo-300 rounded px-1 outline-none border border-indigo-500/50 font-semibold leading-none"
            placeholder="Nickname…"
            maxLength={20}
            disabled={saving}
          />
        ) : (
          <button
            onClick={() => { setInputValue(displayedNickname ?? ""); setEditing(true); }}
            className={`text-[10px] font-semibold truncate w-full text-center transition-colors ${
              displayedNickname
                ? "text-indigo-300 hover:text-indigo-200"
                : "text-transparent hover:text-gray-600"
            }`}
          >
            {displayedNickname ?? "nickname…"}
          </button>
        )}
      </div>
      <div className="h-36 flex items-center justify-center p-2 overflow-hidden">
        {pokemon.dex_number && attempt !== "ball" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={attempt === "large" ? spriteUrl(pokemon.dex_number, true) : spriteUrl(pokemon.dex_number)}
            alt={pokemon.name}
            className="h-full w-full object-contain"
            onError={() => setAttempt((a) => (a === "large" ? "small" : "ball"))}
          />
        ) : (
          <PokeballIcon className="w-14 h-14" filled />
        )}
      </div>
      <div className="px-2 pb-2.5 flex flex-col items-center gap-1">
        <span className="text-xs font-bold text-white text-center leading-tight truncate w-full text-center">
          {pokemon.name}
        </span>
        <div className="flex gap-0.5 justify-center flex-wrap">
          <TypeBadge type={pokemon.type_1} small />
          {pokemon.type_2 && <TypeBadge type={pokemon.type_2} small />}
        </div>
      </div>
    </div>
  );
}

// --- Schedule table ---

function ScheduleTable({ schedule }: { schedule: ScheduleEntry[] }) {
  if (schedule.length === 0) {
    return (
      <p className="text-sm text-gray-600 italic">No matches scheduled.</p>
    );
  }

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden flex-1">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03]">
            <th className="px-4 py-2.5 text-left text-[10px] text-gray-500 font-bold uppercase tracking-wider w-16">Wk</th>
            <th className="px-3 py-2.5 text-left text-[10px] text-gray-500 font-bold uppercase tracking-wider">Opponent</th>
            <th className="px-4 py-2.5 text-center text-[10px] text-gray-500 font-bold uppercase tracking-wider w-24">Result</th>
          </tr>
        </thead>
        <tbody>
          {schedule.map((entry, i) => {
            const played = entry.my_games_won >= 2 || entry.opp_games_won >= 2;
            const inProgress = !played && entry.total_games > 0;
            const myWin = entry.my_games_won >= 2;

            return (
              <tr
                key={entry.id}
                className={`border-b border-white/5 ${i % 2 === 0 ? "" : "bg-white/[0.02]"}`}
              >
                {/* Week */}
                <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">
                  {entry.week_number}
                </td>

                {/* Opponent */}
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    {entry.opponent.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={entry.opponent.logo_url}
                        alt=""
                        className="w-5 h-5 rounded object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded bg-indigo-600/50 shrink-0 flex items-center justify-center text-[9px] font-bold text-indigo-300">
                        {entry.opponent.team_name[0]?.toUpperCase()}
                      </div>
                    )}
                    <span className="text-gray-200 text-xs truncate">{entry.opponent.team_name}</span>
                  </div>
                </td>

                {/* Result */}
                <td className="px-4 py-2.5 text-center">
                  {played ? (
                    <span
                      className={`text-xs font-bold font-mono ${
                        myWin ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {myWin ? "W" : "L"}{" "}
                      <span className="text-gray-400 font-normal">
                        {entry.my_games_won}–{entry.opp_games_won}
                      </span>
                    </span>
                  ) : inProgress ? (
                    <span className="text-xs text-amber-500 italic">In progress</span>
                  ) : (
                    <span className="text-xs text-gray-600">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// --- Pokemon stats table ---

function PokemonStatsTable({
  roster,
  pokemonStats,
  totalGamesPlayed,
}: {
  roster: Pokemon[];
  pokemonStats: PokemonStat[];
  totalGamesPlayed: number;
}) {
  const [sortKey, setSortKey] = useState<"brought" | "kills" | "deaths">("brought");
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const statsMap = new Map(pokemonStats.map((s) => [s.pokemon_id, s]));

  const rows = roster
    .map((p) => {
      const s = statsMap.get(p.id);
      return {
        pokemon: p,
        brought: s?.brought ?? 0,
        kills: s?.kills ?? 0,
        deaths: s?.deaths ?? 0,
      };
    })
    .sort((a, b) => (a[sortKey] - b[sortKey]) * sortDir);

  function handleSort(key: typeof sortKey) {
    if (sortKey === key) setSortDir((d) => (d === -1 ? 1 : -1));
    else { setSortKey(key); setSortDir(-1); }
  }

  const headerCls = (key: typeof sortKey) =>
    `px-3 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none transition-colors hover:text-white ${
      sortKey === key ? "text-indigo-400" : "text-gray-500"
    }`;

  return (
    <div className="rounded-xl border border-white/10 overflow-hidden">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.03]">
            <th className="px-3 py-2.5 text-left text-[10px] text-gray-500 font-bold uppercase tracking-wider">
              Pokemon
            </th>
            <th className={headerCls("brought")} onClick={() => handleSort("brought")}>
              Brought{sortKey === "brought" ? (sortDir === -1 ? " ↓" : " ↑") : ""}
            </th>
            <th className={headerCls("kills")} onClick={() => handleSort("kills")}>
              Kills{sortKey === "kills" ? (sortDir === -1 ? " ↓" : " ↑") : ""}
            </th>
            <th className={headerCls("deaths")} onClick={() => handleSort("deaths")}>
              Deaths{sortKey === "deaths" ? (sortDir === -1 ? " ↓" : " ↑") : ""}
            </th>
            <th className="px-3 py-2.5 text-center text-[10px] text-gray-500 font-bold uppercase tracking-wider">
              K/D
            </th>
            <th className="px-3 py-2.5 text-center text-[10px] text-gray-500 font-bold uppercase tracking-wider">
              GP
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ pokemon, brought, kills, deaths }, i) => {
            const kd =
              deaths > 0
                ? (kills / deaths).toFixed(2)
                : kills > 0
                ? "∞"
                : "—";

            return (
              <tr
                key={pokemon.id}
                className={`border-b border-white/5 ${i % 2 === 0 ? "" : "bg-white/[0.02]"}`}
              >
                {/* Pokemon */}
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <PokemonMiniSprite pokemon={pokemon} />
                    <span className="text-gray-200 text-xs font-medium">{pokemon.name}</span>
                  </div>
                </td>

                {/* Brought */}
                <td className="px-3 py-2 text-center font-mono text-xs text-gray-300">
                  {brought}
                </td>

                {/* Kills */}
                <td className="px-3 py-2 text-center font-mono text-xs text-gray-300">
                  {kills}
                </td>

                {/* Deaths */}
                <td className="px-3 py-2 text-center font-mono text-xs text-gray-300">
                  {deaths}
                </td>

                {/* K/D */}
                <td className="px-3 py-2 text-center font-mono text-xs text-gray-400">
                  {kd}
                </td>

                {/* GP (team total games played) */}
                <td className="px-3 py-2 text-center font-mono text-xs text-gray-500">
                  {totalGamesPlayed}
                </td>
              </tr>
            );
          })}
        </tbody>
        {roster.length > 0 && (
          <tfoot>
            <tr className="border-t-2 border-white/20 bg-white/[0.04]">
              <td className="px-3 py-2 text-[10px] font-bold text-gray-500">Totals</td>
              <td className="px-3 py-2 text-center font-mono text-xs font-bold text-gray-400">
                {rows.reduce((s, r) => s + r.brought, 0)}
              </td>
              <td className="px-3 py-2 text-center font-mono text-xs font-bold text-gray-400">
                {rows.reduce((s, r) => s + r.kills, 0)}
              </td>
              <td className="px-3 py-2 text-center font-mono text-xs font-bold text-gray-400">
                {rows.reduce((s, r) => s + r.deaths, 0)}
              </td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

// Small sprite for the stats table rows
function PokemonMiniSprite({ pokemon }: { pokemon: Pokemon }) {
  const [attempt, setAttempt] = useState<"small" | "ball">("small");
  if (!pokemon.dex_number || attempt === "ball") {
    return <PokeballIcon className="w-6 h-6 text-gray-700" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={spriteUrl(pokemon.dex_number)}
      alt={pokemon.name}
      className="w-6 h-6 object-contain shrink-0"
      onError={() => setAttempt("ball")}
    />
  );
}

// --- Main export ---

export default function MyTeamView({
  team,
  seasonId,
  roster,
  schedule,
  pokemonStats,
  totalGamesPlayed,
  record,
}: Props) {
  return (
    <main className="min-h-screen bg-[#0a0a1a] pt-20 px-6 pb-12">
      {/* Team header */}
      <div className="flex items-center gap-4 mb-8 pt-4">
        {team.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={team.logo_url}
            alt=""
            className="w-16 h-16 rounded-xl object-cover shrink-0"
          />
        ) : (
          <div className="w-16 h-16 rounded-xl bg-indigo-600 shrink-0 flex items-center justify-center text-2xl font-bold text-white">
            {team.team_name[0]?.toUpperCase()}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-white">{team.team_name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-semibold text-emerald-400">{record.wins}W</span>
            <span className="text-gray-600">–</span>
            <span className="text-sm font-semibold text-red-400">{record.losses}L</span>
            {totalGamesPlayed > 0 && (
              <span className="text-xs text-gray-600 ml-1">
                ({totalGamesPlayed} game{totalGamesPlayed !== 1 ? "s" : ""} played)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Roster grid */}
      <section className="mb-8">
        <SectionHeading label="Roster" />
        {roster.length === 0 ? (
          <p className="text-sm text-gray-600 italic">No pokemon on roster.</p>
        ) : (
          <div className="grid grid-cols-6 gap-3">
            {roster.map((p) => (
              <PokemonCard key={p.id} pokemon={p} seasonId={seasonId} />
            ))}
          </div>
        )}
      </section>

      {/* Schedule + Stats tables */}
      <div className="flex gap-6">
        {/* Schedule */}
        <div className="flex-1 min-w-0 flex flex-col">
          <SectionHeading label="Schedule" />
          <ScheduleTable schedule={schedule} />
        </div>

        {/* Pokemon stats */}
        <div className="flex-1 min-w-0">
          <SectionHeading label="Season Stats" />
          <PokemonStatsTable
            roster={roster}
            pokemonStats={pokemonStats}
            totalGamesPlayed={totalGamesPlayed}
          />
        </div>
      </div>
    </main>
  );
}
