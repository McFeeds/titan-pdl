"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { createMatch } from "./actions";

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

type Props = {
  seasons: Season[];
  teams: Team[];
  matches: Match[];
};

export default function MatchesManager({ seasons, teams, matches }: Props) {
  const activeSeason = seasons.find((s) => s.is_active);
  const [seasonId, setSeasonId] = useState(activeSeason?.id.toString() ?? "");
  const [weekFilter, setWeekFilter] = useState("");
  const [state, formAction, pending] = useActionState(createMatch, null);

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
        </>
      )}
    </div>
  );
}
