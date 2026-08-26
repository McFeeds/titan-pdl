"use client";

import { useState } from "react";
import type { MatchupEntry, PokemonBasic } from "./types";

// --- Icons ---

function PokeballFilled({ className }: { className?: string }) {
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

// --- Pokemon sprite ---

function PokemonSprite({ pokemon }: { pokemon: PokemonBasic }) {
  const [failed, setFailed] = useState(false);
  if (!pokemon.dex_number || failed) {
    return <PokeballFilled className="w-8 h-8 opacity-30" />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${pokemon.dex_number}.png`}
      alt={pokemon.name}
      title={pokemon.name}
      className="w-8 h-8 object-contain drop-shadow-sm"
      onError={() => setFailed(true)}
    />
  );
}

// --- Team logo ---

function TeamLogo({ team }: { team: Pick<MatchupEntry["home_team"], "team_name" | "logo_url"> }) {
  return team.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={team.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0" />
  ) : (
    <div className="w-10 h-10 rounded-lg bg-indigo-600/40 shrink-0 flex items-center justify-center text-sm font-bold text-indigo-300">
      {team.team_name[0]?.toUpperCase()}
    </div>
  );
}

// --- Team row inside a matchup card ---

function TeamRow({
  team,
  pokemon,
  gamesWon,
  played,
  won,
  lost,
}: {
  team: MatchupEntry["home_team"];
  pokemon: PokemonBasic[];
  gamesWon: number;
  played: boolean;
  won: boolean;
  lost: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
        won
          ? "bg-white/[0.08] border border-indigo-500/25"
          : lost
          ? "bg-white/[0.02]"
          : "bg-white/[0.04]"
      }`}
    >
      <TeamLogo team={team} />

      {/* Name + record */}
      <div className={`shrink-0 w-28 min-w-0 ${lost ? "opacity-50" : ""}`}>
        <p className={`text-xs font-bold truncate leading-tight ${won ? "text-white" : "text-gray-300"}`}>
          {team.team_name}
        </p>
        <p className="text-[10px] text-gray-600 mt-0.5 font-mono">
          {team.wins}–{team.losses}
        </p>
        {team.coaches.length > 0 && (
          <p className="text-[9px] text-gray-600 truncate mt-0.5" title={team.coaches.join(", ")}>
            {team.coaches.join(", ")}
          </p>
        )}
      </div>

      {/* Pokemon sprites */}
      <div className={`flex flex-1 flex-wrap gap-0.5 min-w-0 ${lost ? "opacity-40" : ""}`}>
        {pokemon.map((p, i) => (
          <PokemonSprite key={`${p.id}-${i}`} pokemon={p} />
        ))}
      </div>

      {/* Games won */}
      {played && (
        <span
          className={`text-2xl font-bold font-mono shrink-0 ml-1 ${
            won ? "text-indigo-400" : "text-gray-700"
          }`}
        >
          {gamesWon}
        </span>
      )}
    </div>
  );
}

// --- Matchup card ---

function MatchupCard({ matchup }: { matchup: MatchupEntry }) {
  const [showReplays, setShowReplays] = useState(false);

  const played = matchup.decided;
  const inProgress = !played && matchup.total_games > 0;
  const homeWon = played && matchup.home_games_won > matchup.away_games_won;
  const awayWon = played && matchup.away_games_won > matchup.home_games_won;

  return (
    <div className="bg-[#0d0d20] border border-white/10 rounded-2xl overflow-hidden flex flex-col">
      {/* Status badge */}
      <div className="flex justify-end px-4 pt-3 pb-1">
        {played ? (
          <span className="text-[10px] font-bold tracking-[0.15em] text-indigo-400 uppercase">
            Final
          </span>
        ) : inProgress ? (
          <span className="text-[10px] font-bold tracking-[0.15em] text-amber-400 uppercase">
            Live
          </span>
        ) : (
          <span className="text-[10px] font-bold tracking-[0.15em] text-gray-700 uppercase">
            Upcoming
          </span>
        )}
      </div>

      {/* Teams */}
      <div className="px-3 pb-3 flex flex-col gap-1.5">
        <TeamRow
          team={matchup.home_team}
          pokemon={matchup.home_pokemon}
          gamesWon={matchup.home_games_won}
          played={played}
          won={homeWon}
          lost={played && !homeWon}
        />

        <div className="flex items-center gap-2 px-1">
          <div className="flex-1 border-t border-white/5" />
          <span className="text-[9px] font-bold text-gray-700 tracking-[0.2em]">VS</span>
          <div className="flex-1 border-t border-white/5" />
        </div>

        <TeamRow
          team={matchup.away_team}
          pokemon={matchup.away_pokemon}
          gamesWon={matchup.away_games_won}
          played={played}
          won={awayWon}
          lost={played && !awayWon}
        />
      </div>

      {/* Singles/doubles breakdown — only for the singles_doubles format */}
      {played && matchup.match_format === "singles_doubles" && (
        <div className="px-4 pb-3 flex items-center gap-3 text-[10px] text-gray-500">
          {matchup.component_breakdown.map((c) => (
            <span key={c.label}>
              <span className="font-semibold text-gray-600">{c.label}:</span>{" "}
              {c.winnerTeamName ?? "—"}
            </span>
          ))}
        </div>
      )}

      {/* View Match footer — only on completed matches */}
      {played && (
        <div className="border-t border-white/[0.06] mt-auto">
          {matchup.replay_links.length > 0 ? (
            <>
              <button
                onClick={() => setShowReplays((s) => !s)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-indigo-400 hover:text-indigo-300 hover:bg-white/[0.02] transition-colors"
              >
                <span>View Match</span>
                <span className="text-xs">{showReplays ? "▲" : "→"}</span>
              </button>

              {showReplays && (
                <div className="border-t border-white/[0.06] px-4 py-3 flex flex-col gap-2">
                  {matchup.replay_links.map((r) => (
                    <a
                      key={`${r.game_type}-${r.game_number}`}
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-gray-500 hover:text-white transition-colors group"
                    >
                      <span className="font-semibold text-gray-600 group-hover:text-gray-400 shrink-0">
                        {matchup.match_format === "singles_doubles"
                          ? r.game_type === "singles" ? "Singles" : `Doubles Game ${r.game_number}`
                          : `Game ${r.game_number}`}
                      </span>
                      <span className="flex-1 border-t border-dashed border-white/10" />
                      <span className="text-indigo-400 group-hover:text-indigo-300 font-semibold shrink-0">
                        Watch replay →
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="px-4 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-700">
                No replays available
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main view ---

export default function SchedulesView({
  conferences,
  userConferenceId,
  matchups,
}: {
  conferences: { id: number; name: string }[];
  userConferenceId: number | null;
  matchups: MatchupEntry[];
}) {
  const [selectedConferenceId, setSelectedConferenceId] = useState<number | null>(
    userConferenceId ?? conferences[0]?.id ?? null
  );
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const conferenceMatchups = matchups.filter((m) => m.conference_id === selectedConferenceId);

  const weeks = [...new Set(conferenceMatchups.map((m) => m.week_number))].sort(
    (a, b) => a - b
  );

  // Default to the latest completed week so you land on current action, not week 1
  const latestPlayedWeek = weeks.reduce<number | null>((acc, wk) => {
    const done = conferenceMatchups
      .filter((m) => m.week_number === wk)
      .some((m) => m.decided);
    return done ? wk : acc;
  }, null);

  const effectiveWeek = selectedWeek ?? latestPlayedWeek ?? weeks[0] ?? null;
  const weekMatchups = conferenceMatchups.filter((m) => m.week_number === effectiveWeek);

  function handleConferenceChange(id: number) {
    setSelectedConferenceId(id);
    setSelectedWeek(null);
  }

  return (
    <main className="min-h-screen bg-[#0a0a1a] pt-20 px-6 pb-12">
      <div className="max-w-5xl mx-auto">
        <div className="pt-6 mb-6">
          <h1 className="text-2xl font-bold text-white">Schedule</h1>
          <p className="text-sm text-gray-500 mt-1">Season matchups by week</p>
        </div>

        {/* Conference tabs */}
        {conferences.length > 0 && (
          <div className="flex gap-2 mb-5 flex-wrap">
            {conferences.map((conf) => (
              <button
                key={conf.id}
                onClick={() => handleConferenceChange(conf.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  selectedConferenceId === conf.id
                    ? "bg-indigo-600 text-white"
                    : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                }`}
              >
                {conf.name}
              </button>
            ))}
          </div>
        )}

        {weeks.length === 0 ? (
          <p className="text-gray-600 text-sm italic mt-4">No matches scheduled yet.</p>
        ) : (
          <>
            {/* Week selector */}
            <div className="flex items-center gap-2 mb-7 flex-wrap">
              <span className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">
                Week
              </span>
              {weeks.map((wk) => {
                const isActive = effectiveWeek === wk;
                const hasResults = conferenceMatchups
                  .filter((m) => m.week_number === wk)
                  .some((m) => m.decided);
                return (
                  <button
                    key={wk}
                    onClick={() => setSelectedWeek(wk)}
                    className={`relative w-9 h-9 rounded-xl text-sm font-bold transition-colors border ${
                      isActive
                        ? "bg-white/15 text-white border-white/20"
                        : "bg-white/[0.03] text-gray-500 hover:bg-white/8 hover:text-gray-300 border-white/5"
                    }`}
                  >
                    {wk}
                    {hasResults && (
                      <span
                        className={`absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full ${
                          isActive ? "bg-indigo-400" : "bg-gray-600"
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Matchup grid */}
            {weekMatchups.length === 0 ? (
              <p className="text-sm text-gray-600 italic">No matchups this week.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {weekMatchups.map((m) => (
                  <MatchupCard key={m.id} matchup={m} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
