"use client";

import { useState } from "react";
import Link from "next/link";
import { deleteTeam } from "./actions";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";

const selectCls =
  "px-3 py-2 bg-[#0d0d1f] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm [&>option]:bg-[#0d0d1f]";

type Season = { id: number; name: string; is_active: boolean };
type Team = { id: number; team_name: string };
type Placement = {
  team_id: number;
  season_id: number;
  conference_name: string | null;
  group_name: string | null;
};
type Member = { team_id: number; season_id: number; discord_id: string; showdown_name: string | null };

type Props = {
  seasons: Season[];
  teams: Team[];
  placements: Placement[];
  members: Member[];
};

export default function TeamsManager({ seasons, teams, placements, members }: Props) {
  const activeSeason = seasons.find((s) => s.is_active);
  const [seasonId, setSeasonId] = useState("");

  // "All Teams" (seasonId === "") shows every team, using the active
  // season for the placement/member columns — matches the page's original
  // unfiltered behavior. Picking a specific season narrows the list down
  // to only the teams actually placed in that season.
  const effectiveSeasonId = seasonId ? Number(seasonId) : activeSeason?.id ?? null;

  const placementsForSeason = placements.filter((p) => p.season_id === effectiveSeasonId);
  const placementByTeam = new Map(placementsForSeason.map((p) => [p.team_id, p]));

  const membersByTeam = new Map<number, Member[]>();
  for (const m of members) {
    if (m.season_id !== effectiveSeasonId) continue;
    const list = membersByTeam.get(m.team_id) ?? [];
    list.push(m);
    membersByTeam.set(m.team_id, list);
  }

  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const rows = seasonId
    ? placementsForSeason
        .map((p) => teamMap.get(p.team_id))
        .filter((t): t is Team => !!t)
        .sort((a, b) => a.team_name.localeCompare(b.team_name))
    : teams;

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <h1 className="text-2xl font-bold text-white">Teams</h1>
        <Link
          href="/admin/teams/new"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          + Add Team
        </Link>
      </div>

      <div className="mb-6">
        <label className="block text-xs text-gray-400 mb-1">Season</label>
        <select className={selectCls} value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
          <option value="">All Teams</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.is_active ? " (active)" : ""}
            </option>
          ))}
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="text-gray-400">
          {seasonId ? "No teams placed in this season yet." : "No teams yet."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 text-xs uppercase tracking-wide">
                <th className="pb-3 pr-6">Team</th>
                <th className="pb-3 pr-6">Members</th>
                <th className="pb-3 pr-6">Conference / Group</th>
                <th className="pb-3" />
              </tr>
            </thead>
            <tbody>
              {rows.map((team) => {
                const placement = placementByTeam.get(team.id);
                const teamMembers = membersByTeam.get(team.id) ?? [];
                return (
                  <tr key={team.id} className="border-t border-white/5">
                    <td className="py-3 pr-6 text-white font-medium">{team.team_name}</td>
                    <td className="py-3 pr-6 text-gray-300 text-xs">
                      {teamMembers.length
                        ? teamMembers
                            .map((m) => (m.showdown_name ? `${m.discord_id} (${m.showdown_name})` : m.discord_id))
                            .join(", ")
                        : "—"}
                    </td>
                    <td className="py-3 pr-6 text-gray-300">
                      {placement?.conference_name ?? "—"}
                      {placement?.group_name ? ` / ${placement.group_name}` : ""}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/admin/teams/${team.id}`}
                          className="text-indigo-400 hover:text-indigo-300 text-xs font-medium"
                        >
                          Edit
                        </Link>
                        <ConfirmDeleteButton
                          action={deleteTeam}
                          id={team.id}
                          message={`Delete ${team.team_name}?`}
                          className="text-red-400 hover:text-red-300 text-xs font-medium"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
