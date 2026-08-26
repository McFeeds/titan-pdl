"use client";

import { useState } from "react";
import type { ConferenceStandings, TeamStanding } from "./types";

function TeamLogo({ team }: { team: Pick<TeamStanding, "team_name" | "logo_url"> }) {
  return team.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={team.logo_url} alt="" className="w-16 h-16 rounded-lg object-cover shrink-0" />
  ) : (
    <div className="w-16 h-16 rounded-lg bg-indigo-600/40 shrink-0 flex items-center justify-center text-2xl font-bold text-indigo-300">
      {team.team_name[0]?.toUpperCase()}
    </div>
  );
}

function formatPct(wins: number, losses: number) {
  const total = wins + losses;
  if (total === 0) return "—";
  return total > 0 ? (wins / total).toFixed(3).replace(/^0/, "") : "—";
}

function GroupTable({ name, teams }: { name: string; teams: TeamStanding[] }) {
  return (
    <div className="bg-[#0d0d20] border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10">
        <h3 className="text-sm font-bold text-white">{name}</h3>
      </div>
      {teams.length === 0 ? (
        <p className="px-4 py-6 text-sm text-gray-600 italic">No teams in this group.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] text-gray-500 font-bold uppercase tracking-wider">
                <th className="px-4 py-2 w-8">#</th>
                <th className="px-2 py-2">Team</th>
                <th className="px-2 py-2 text-center w-10">W</th>
                <th className="px-2 py-2 text-center w-10">L</th>
                <th className="px-2 py-2 text-center w-12">±</th>
                <th className="px-4 py-2 text-center w-14">PCT</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team, i) => (
                <tr
                  key={team.id}
                  className={`border-t border-white/5 ${i % 2 === 1 ? "bg-white/[0.02]" : ""}`}
                >
                  <td className="px-4 py-4 text-gray-500 font-mono text-xs">{i + 1}</td>
                  <td className="px-2 py-4">
                    <div className="flex items-center gap-2 min-w-0">
                      <TeamLogo team={team} />
                      <span className="text-gray-200 text-sm font-medium truncate">{team.team_name}</span>
                    </div>
                  </td>
                  <td className="px-2 py-4 text-center font-mono text-xs text-emerald-400 font-semibold">
                    {team.wins}
                  </td>
                  <td className="px-2 py-4 text-center font-mono text-xs text-red-400 font-semibold">
                    {team.losses}
                  </td>
                  <td
                    className={`px-2 py-4 text-center font-mono text-xs font-semibold ${
                      team.plusMinus > 0
                        ? "text-emerald-400"
                        : team.plusMinus < 0
                          ? "text-red-400"
                          : "text-gray-500"
                    }`}
                  >
                    {team.plusMinus > 0 ? `+${team.plusMinus}` : team.plusMinus}
                  </td>
                  <td className="px-4 py-4 text-center font-mono text-xs text-gray-400">
                    {formatPct(team.wins, team.losses)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function StandingsView({ standings }: { standings: ConferenceStandings[] }) {
  const [selectedConferenceId, setSelectedConferenceId] = useState<number | null>(
    standings[0]?.id ?? null
  );

  const selectedConference = standings.find((c) => c.id === selectedConferenceId) ?? null;

  return (
    <main className="min-h-screen bg-[#0a0a1a] pt-20 px-6 pb-12">
      <div className="max-w-[1800px] mx-auto">
        <div className="pt-6 mb-6">
          <h1 className="text-2xl font-bold text-white">Standings</h1>
          <p className="text-sm text-gray-500 mt-1">Current season records by group</p>
        </div>

        {standings.length === 0 ? (
          <p className="text-gray-600 text-sm italic mt-4">No conferences set up yet.</p>
        ) : (
          <>
            <div className="flex gap-2 mb-6 flex-wrap">
              {standings.map((conf) => (
                <button
                  key={conf.id}
                  onClick={() => setSelectedConferenceId(conf.id)}
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

            {selectedConference &&
              (selectedConference.groups.length === 0 ? (
                <p className="text-gray-600 text-sm italic">No teams placed in this conference yet.</p>
              ) : (
                <div className="grid gap-5 grid-cols-[repeat(auto-fit,minmax(340px,1fr))]">
                  {selectedConference.groups.map((g) => (
                    <GroupTable key={g.id} name={g.name} teams={g.teams} />
                  ))}
                </div>
              ))}
          </>
        )}
      </div>
    </main>
  );
}
