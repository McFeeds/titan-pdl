"use client";

import { useActionState, useState, useTransition } from "react";
import { addRosterEntry, removeRosterEntry } from "./actions";

const selectCls =
  "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm";

type Season = { id: number; name: string };
type Conference = { id: number; name: string };
type Team = { id: number; team_name: string; conference_id: number | null };
type Pokemon = { id: number; name: string };
type RosterEntry = {
  pokemon_id: number;
  season_id: number;
  conference_id: number;
  team_id: number;
  pokemon: { name: string } | null;
};

type Props = {
  seasons: Season[];
  conferences: Conference[];
  teams: Team[];
  pokemon: Pokemon[];
  roster: RosterEntry[];
};

export default function RosterManager({ seasons, conferences, teams, pokemon, roster }: Props) {
  const [seasonId, setSeasonId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [state, formAction, pending] = useActionState(addRosterEntry, null);
  const [removePending, startRemove] = useTransition();

  const selectedTeam = teams.find((t) => t.id === Number(teamId));
  const conferenceId = selectedTeam?.conference_id ?? null;

  const currentRoster = roster.filter(
    (r) =>
      r.season_id === Number(seasonId) &&
      r.team_id === Number(teamId)
  );

  const rosterPokemonIds = new Set(currentRoster.map((r) => r.pokemon_id));
  const availablePokemon = pokemon.filter((p) => !rosterPokemonIds.has(p.id));

  function handleRemove(entry: RosterEntry) {
    const fd = new FormData();
    fd.append("season_id", entry.season_id.toString());
    fd.append("conference_id", entry.conference_id.toString());
    fd.append("pokemon_id", entry.pokemon_id.toString());
    startRemove(async () => {
      await removeRosterEntry(fd);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Season</label>
          <select className={selectCls} value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
            <option value="">— Select —</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Team</label>
          <select className={selectCls} value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">— Select —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.team_name}</option>
            ))}
          </select>
        </div>
      </div>

      {seasonId && teamId && (
        <>
          {/* Current roster */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Current Roster ({currentRoster.length})
            </h2>
            {currentRoster.length === 0 ? (
              <p className="text-gray-500 text-sm">No Pokémon on this roster yet.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {currentRoster.map((entry) => (
                  <li
                    key={entry.pokemon_id}
                    className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg"
                  >
                    <span className="text-white text-sm">{entry.pokemon?.name ?? `#${entry.pokemon_id}`}</span>
                    <button
                      onClick={() => handleRemove(entry)}
                      disabled={removePending}
                      className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Add pokemon */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Add Pokémon
            </h2>
            <form action={formAction} className="flex items-start gap-3">
              <input type="hidden" name="season_id" value={seasonId} />
              <input type="hidden" name="team_id" value={teamId} />
              <input type="hidden" name="conference_id" value={conferenceId ?? ""} />
              <div className="flex flex-col gap-1">
                <select name="pokemon_id" className={selectCls} defaultValue="">
                  <option value="">— Select Pokémon —</option>
                  {availablePokemon.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {state?.error && (
                  <p className="text-red-400 text-xs">{state.error}</p>
                )}
              </div>
              <button
                type="submit"
                disabled={pending || !conferenceId}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {pending ? "Adding…" : "Add"}
              </button>
              {!conferenceId && (
                <p className="text-yellow-500 text-xs self-center">
                  Team has no conference assigned.
                </p>
              )}
            </form>
          </div>
        </>
      )}
    </div>
  );
}
