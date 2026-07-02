"use client";

import { useState } from "react";

interface TeamBasic {
  id: number;
  team_name: string;
  logo_url: string | null;
}

interface MatchupEntry {
  id: number;
  week_number: number;
  conference_id: number | null;
  home_team: TeamBasic;
  away_team: TeamBasic;
  home_games_won: number;
  away_games_won: number;
  total_games: number;
  played_at: string | null;
}

interface Props {
  conferences: { id: number; name: string }[];
  userConferenceId: number | null;
  matchups: MatchupEntry[];
}

function TeamLogo({ team, flip = false }: { team: TeamBasic; flip?: boolean }) {
  return team.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={team.logo_url}
      alt=""
      className={`w-12 h-12 rounded-xl object-cover shrink-0 ${flip ? "order-last" : ""}`}
    />
  ) : (
    <div
      className={`w-12 h-12 rounded-xl bg-indigo-600/40 shrink-0 flex items-center justify-center text-base font-bold text-indigo-300 ${
        flip ? "order-last" : ""
      }`}
    >
      {team.team_name[0]?.toUpperCase()}
    </div>
  );
}

function MatchupCard({ matchup }: { matchup: MatchupEntry }) {
  const played = matchup.home_games_won >= 2 || matchup.away_games_won >= 2;
  const inProgress = !played && matchup.total_games > 0;
  const homeWon = matchup.home_games_won >= 2;
  const awayWon = matchup.away_games_won >= 2;

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl px-6 py-4 flex items-center gap-4">
      {/* Home team */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <TeamLogo team={matchup.home_team} />
        <div className="min-w-0">
          <p
            className={`text-sm font-bold truncate ${
              played ? (homeWon ? "text-white" : "text-gray-500") : "text-gray-200"
            }`}
          >
            {matchup.home_team.team_name}
          </p>
          {played && (
            <p
              className={`text-[11px] font-semibold mt-0.5 ${
                homeWon ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {homeWon ? "WIN" : "LOSS"}
            </p>
          )}
        </div>
      </div>

      {/* Center score / status */}
      <div className="shrink-0 w-24 flex flex-col items-center gap-0.5">
        {played ? (
          <p className="text-2xl font-bold font-mono tracking-tight text-white">
            {matchup.home_games_won}
            <span className="text-gray-600 mx-1.5">–</span>
            {matchup.away_games_won}
          </p>
        ) : inProgress ? (
          <span className="text-xs font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
            Live
          </span>
        ) : (
          <p className="text-sm font-medium text-gray-600">vs</p>
        )}
      </div>

      {/* Away team */}
      <div className="flex items-center gap-3 flex-1 min-w-0 justify-end">
        <div className="min-w-0 text-right">
          <p
            className={`text-sm font-bold truncate ${
              played ? (awayWon ? "text-white" : "text-gray-500") : "text-gray-200"
            }`}
          >
            {matchup.away_team.team_name}
          </p>
          {played && (
            <p
              className={`text-[11px] font-semibold mt-0.5 ${
                awayWon ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {awayWon ? "WIN" : "LOSS"}
            </p>
          )}
        </div>
        <TeamLogo team={matchup.away_team} flip />
      </div>
    </div>
  );
}

export default function SchedulesView({ conferences, userConferenceId, matchups }: Props) {
  const [selectedConferenceId, setSelectedConferenceId] = useState<number | null>(
    userConferenceId ?? conferences[0]?.id ?? null
  );
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);

  const conferenceMatchups = matchups.filter((m) => m.conference_id === selectedConferenceId);

  const weeks = [...new Set(conferenceMatchups.map((m) => m.week_number))].sort(
    (a, b) => a - b
  );

  // Default to the latest week that has completed results; fall back to week 1
  const latestPlayedWeek = weeks.reduce<number | null>((acc, wk) => {
    const hasResult = conferenceMatchups
      .filter((m) => m.week_number === wk)
      .some((m) => m.home_games_won >= 2 || m.away_games_won >= 2);
    return hasResult ? wk : acc;
  }, null);

  const effectiveWeek = selectedWeek ?? latestPlayedWeek ?? weeks[0] ?? null;
  const weekMatchups = conferenceMatchups.filter((m) => m.week_number === effectiveWeek);

  function handleConferenceChange(confId: number) {
    setSelectedConferenceId(confId);
    setSelectedWeek(null); // reset to default week for new conference
  }

  return (
    <main className="min-h-screen bg-[#0a0a1a] pt-20 px-6 pb-12">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
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
            <div className="flex gap-1.5 mb-7 flex-wrap">
              {weeks.map((wk) => {
                const isActive = effectiveWeek === wk;
                const hasResults = conferenceMatchups
                  .filter((m) => m.week_number === wk)
                  .some((m) => m.home_games_won >= 2 || m.away_games_won >= 2);
                return (
                  <button
                    key={wk}
                    onClick={() => setSelectedWeek(wk)}
                    className={`px-3.5 py-1 rounded-lg text-xs font-semibold transition-colors relative ${
                      isActive
                        ? "bg-white/15 text-white"
                        : "text-gray-500 hover:bg-white/5 hover:text-gray-300"
                    }`}
                  >
                    Wk {wk}
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

            {/* Week heading */}
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">
              Week {effectiveWeek}
            </p>

            {/* Matchup cards */}
            <div className="flex flex-col gap-3">
              {weekMatchups.length === 0 ? (
                <p className="text-sm text-gray-600 italic">No matchups for this week.</p>
              ) : (
                weekMatchups.map((m) => <MatchupCard key={m.id} matchup={m} />)
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
