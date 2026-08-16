"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createMatch, generateRoundRobinSchedule } from "./actions";

const selectCls =
  "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm [&>option]:bg-[#0d0d1f]";
const inputCls =
  "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm";

type Season = { id: number; name: string; is_active: boolean };
type Team = { id: number; team_name: string };
type Match = {
  id: number;
  season_id: number;
  week_number: number;
  home_team_id: number;
  away_team_id: number;
};
type Conference = { id: number; name: string };
type Group = { id: number; name: string; conference_id: number };
type TeamSeason = { team_id: number; season_id: number; group_id: number | null; conference_id: number };

type Props = {
  seasons: Season[];
  teams: Team[];
  matches: Match[];
  conferences: Conference[];
  groups: Group[];
  teamSeasons: TeamSeason[];
};

export default function MatchesManager({ seasons, teams, matches, conferences, groups, teamSeasons }: Props) {
  const activeSeason = seasons.find((s) => s.is_active);
  const [seasonId, setSeasonId] = useState(activeSeason?.id.toString() ?? "");
  const [weekFilter, setWeekFilter] = useState("");
  const [state, formAction, pending] = useActionState(createMatch, null);

  const [rrConferenceId, setRrConferenceId] = useState("");
  const [rrGroupId, setRrGroupId] = useState("");
  const [rrState, rrFormAction, rrPending] = useActionState(generateRoundRobinSchedule, null);

  const rrGroups = rrConferenceId
    ? groups.filter((g) => g.conference_id === Number(rrConferenceId))
    : groups;
  const rrGroupTeamCount = rrGroupId
    ? teamSeasons.filter((ts) => ts.season_id === Number(seasonId) && ts.group_id === Number(rrGroupId)).length
    : 0;

  const teamMap = new Map(teams.map((t) => [t.id, t.team_name]));

  const filteredMatches = matches
    .filter((m) => m.season_id === Number(seasonId))
    .filter((m) => !weekFilter || m.week_number === Number(weekFilter))
    .sort((a, b) => a.week_number - b.week_number);

  const weeks = [...new Set(
    matches.filter((m) => m.season_id === Number(seasonId)).map((m) => m.week_number)
  )].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-8">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Season</label>
          <select className={selectCls} value={seasonId} onChange={(e) => { setSeasonId(e.target.value); setWeekFilter(""); }}>
            <option value="">— Select —</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.is_active ? " (active)" : ""}</option>
            ))}
          </select>
        </div>
        {weeks.length > 0 && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">Week</label>
            <select className={selectCls} value={weekFilter} onChange={(e) => setWeekFilter(e.target.value)}>
              <option value="">All weeks</option>
              {weeks.map((w) => (
                <option key={w} value={w}>Week {w}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Match list */}
      {seasonId && (
        <>
          {filteredMatches.length === 0 ? (
            <p className="text-gray-500 text-sm">No matches found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-400 text-xs uppercase tracking-wide">
                    <th className="pb-3 pr-6">Week</th>
                    <th className="pb-3 pr-6">Matchup</th>
                    <th className="pb-3" />
                  </tr>
                </thead>
                <tbody>
                  {filteredMatches.map((match) => (
                    <tr key={match.id} className="border-t border-white/5">
                      <td className="py-3 pr-6 text-gray-400 text-xs">Week {match.week_number}</td>
                      <td className="py-3 pr-6 text-white font-medium">
                        {teamMap.get(match.home_team_id) ?? `Team ${match.home_team_id}`}
                        <span className="text-gray-500 font-normal mx-2">vs</span>
                        {teamMap.get(match.away_team_id) ?? `Team ${match.away_team_id}`}
                      </td>
                      <td className="py-3">
                        <Link
                          href={`/admin/matches/${match.id}`}
                          className="text-indigo-400 hover:text-indigo-300 text-xs font-medium"
                        >
                          Manage
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add match form */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Add Match
            </h2>
            <form action={formAction} className="flex items-start gap-3 flex-wrap">
              <input type="hidden" name="season_id" value={seasonId} />
              <div className="flex flex-col gap-1">
                <input
                  name="week_number"
                  type="number"
                  min={1}
                  placeholder="Week #"
                  className={`${inputCls} w-24`}
                />
              </div>
              <select name="home_team_id" className={`${selectCls} w-48`} defaultValue="">
                <option value="">— Home Team —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.team_name}</option>
                ))}
              </select>
              <select name="away_team_id" className={`${selectCls} w-48`} defaultValue="">
                <option value="">— Away Team —</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>{t.team_name}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={pending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 shrink-0"
              >
                {pending ? "Adding…" : "Add Match"}
              </button>
            </form>
            {state?.error && (
              <p className="text-red-400 text-xs mt-2">{state.error}</p>
            )}
          </div>

          {/* Generate round robin schedule */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Generate Round Robin Schedule
            </h2>
            <p className="text-xs text-gray-500 mb-3 max-w-xl">
              Schedules every team in a group to play every other team once, one match per team
              per week. Only works if that group has no matches scheduled yet this season —
              delete existing matches first to regenerate.
            </p>
            <form action={rrFormAction} className="flex items-start gap-3 flex-wrap">
              <input type="hidden" name="season_id" value={seasonId} />
              <select
                name="conference_id_ui"
                value={rrConferenceId}
                onChange={(e) => { setRrConferenceId(e.target.value); setRrGroupId(""); }}
                className={`${selectCls} w-44`}
              >
                <option value="">— Conference —</option>
                {conferences.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select
                name="group_id"
                value={rrGroupId}
                onChange={(e) => setRrGroupId(e.target.value)}
                className={`${selectCls} w-44`}
              >
                <option value="">— Group —</option>
                {rrGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <input
                name="start_week"
                type="number"
                min={1}
                defaultValue={1}
                placeholder="Start Week"
                className={`${inputCls} w-28`}
              />
              <button
                type="submit"
                disabled={rrPending || !rrGroupId}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 shrink-0"
              >
                {rrPending ? "Generating…" : "Generate Schedule"}
              </button>
            </form>
            {rrGroupId && (
              <p className="text-xs text-gray-600 mt-2">
                {rrGroupTeamCount} team{rrGroupTeamCount !== 1 ? "s" : ""} in this group
                {rrGroupTeamCount % 2 === 1 ? " — odd count, one team byes each week" : ""}.
              </p>
            )}
            {rrState?.error && (
              <p className="text-red-400 text-xs mt-2">{rrState.error}</p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
