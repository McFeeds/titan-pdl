"use client";

import { useActionState, useState, useTransition } from "react";
import {
  addRosterEntry,
  removeRosterEntry,
  setDraftActive,
  forceEndTeamDraft,
  reactivateTeamDraft,
  revertDraftToPick,
} from "./actions";

const selectCls =
  "px-3 py-2 bg-[#0d0d1f] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm [&>option]:bg-[#0d0d1f]";

type Season = { id: number; name: string };
type Team = { id: number; team_name: string };
type TeamSeason = { team_id: number; season_id: number; conference_id: number; draft_ended_at: string | null };
type Pokemon = { id: number; name: string };
type Conference = { id: number; name: string };
type DraftState = { season_id: number; conference_id: number; is_active: boolean };
type RosterEntry = {
  pokemon_id: number;
  season_id: number;
  conference_id: number;
  team_id: number;
  pokemon: { name: string } | null;
};
type DraftLogEntry = {
  id: number;
  season_id: number;
  conference_id: number;
  pick_number: number;
  team_id: number;
  pokemon_id: number;
  created_at: string;
  pokemon: { name: string } | null;
};

type Props = {
  seasons: Season[];
  teams: Team[];
  teamSeasons: TeamSeason[];
  pokemon: Pokemon[];
  roster: RosterEntry[];
  conferences: Conference[];
  draftStates: DraftState[];
  draftLog: DraftLogEntry[];
};

function PickHistoryPanel({
  seasonId,
  conferenceId,
  draftLog,
  teams,
}: {
  seasonId: number;
  conferenceId: number;
  draftLog: DraftLogEntry[];
  teams: Team[];
}) {
  const [open, setOpen] = useState(false);
  const [confirmingPick, setConfirmingPick] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const picks = draftLog
    .filter((d) => d.season_id === seasonId && d.conference_id === conferenceId)
    .sort((a, b) => b.pick_number - a.pick_number);

  const teamNameById = new Map(teams.map((t) => [t.id, t.team_name]));

  function handleRevert(pickNumber: number) {
    startTransition(async () => {
      await revertDraftToPick(seasonId, conferenceId, pickNumber - 1);
      setConfirmingPick(null);
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
      >
        View pick history ({picks.length})
      </button>
    );
  }

  return (
    <div className="w-full">
      <button
        onClick={() => setOpen(false)}
        className="text-xs text-gray-500 hover:text-white font-medium mb-2"
      >
        Hide pick history
      </button>
      {picks.length === 0 ? (
        <p className="text-xs text-gray-600 italic">No picks logged yet.</p>
      ) : (
        <ul className="max-h-64 overflow-y-auto flex flex-col gap-1 bg-white/[0.03] rounded-lg p-2">
          {picks.map((pick) => (
            <li
              key={pick.id}
              className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-white/5 text-xs"
            >
              <span className="text-gray-500 font-mono w-8 shrink-0">#{pick.pick_number}</span>
              <span className="text-gray-300 flex-1 min-w-0 truncate">
                {teamNameById.get(pick.team_id) ?? `Team #${pick.team_id}`}
              </span>
              <span className="text-white flex-1 min-w-0 truncate">
                {pick.pokemon?.name ?? `#${pick.pokemon_id}`}
              </span>
              <span className="text-gray-600 shrink-0">
                {new Date(pick.created_at).toLocaleString()}
              </span>
              {confirmingPick === pick.pick_number ? (
                <span className="flex items-center gap-1 shrink-0">
                  <span className="text-gray-500">Undo this + all after?</span>
                  <button
                    onClick={() => handleRevert(pick.pick_number)}
                    disabled={pending}
                    className="text-red-400 hover:text-red-300 font-bold disabled:opacity-50"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmingPick(null)}
                    className="text-gray-500 hover:text-gray-300 font-medium"
                  >
                    No
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setConfirmingPick(pick.pick_number)}
                  className="text-red-400/70 hover:text-red-400 font-semibold shrink-0"
                >
                  Undo from here
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RosterManager({
  seasons, teams, teamSeasons, pokemon, roster, conferences, draftStates, draftLog,
}: Props) {
  const [seasonId, setSeasonId] = useState("");
  const [teamId, setTeamId] = useState("");
  const [state, formAction, pending] = useActionState(addRosterEntry, null);
  const [removePending, startRemove] = useTransition();
  const [togglePending, startToggle] = useTransition();
  const [teamDraftPending, startTeamDraftToggle] = useTransition();

  // Derive conference_id from team_seasons for the selected team+season
  const teamSeason = teamSeasons.find(
    (ts) => ts.team_id === Number(teamId) && ts.season_id === Number(seasonId)
  );
  const conferenceId = teamSeason?.conference_id ?? null;

  const isDraftActive = draftStates.some(
    (d) => d.season_id === Number(seasonId) && d.conference_id === conferenceId && d.is_active
  );

  function handleToggleDraft(confId: number, nextActive: boolean) {
    startToggle(async () => {
      await setDraftActive(Number(seasonId), confId, nextActive);
    });
  }

  const currentRoster = roster.filter(
    (r) => r.season_id === Number(seasonId) && r.team_id === Number(teamId)
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

  function handleToggleTeamDraft(ended: boolean) {
    startTeamDraftToggle(async () => {
      if (ended) await reactivateTeamDraft(Number(seasonId), Number(teamId));
      else await forceEndTeamDraft(Number(seasonId), Number(teamId));
    });
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <label className="block text-xs text-gray-400 mb-1">Season</label>
          <select className={selectCls} value={seasonId} onChange={(e) => { setSeasonId(e.target.value); setTeamId(""); }}>
            <option value="">— Select —</option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-400 mb-1">Team</label>
          <select className={selectCls} value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={!seasonId}>
            <option value="">— Select —</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.team_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Draft status — per-conference live toggle */}
      {seasonId && (
        <div>
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Draft Status
          </h2>
          <div className="flex items-start gap-3 flex-wrap">
            {conferences.map((conf) => {
              const active = draftStates.some(
                (d) => d.season_id === Number(seasonId) && d.conference_id === conf.id && d.is_active
              );
              return (
                <div
                  key={conf.id}
                  className="flex flex-col gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg w-72"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-white text-sm font-medium">{conf.name}</span>
                    <span className={`text-xs font-semibold ${active ? "text-emerald-400" : "text-gray-500"}`}>
                      {active ? "● Live" : "Inactive"}
                    </span>
                    <button
                      onClick={() => handleToggleDraft(conf.id, !active)}
                      disabled={togglePending}
                      className={`ml-auto text-xs font-semibold px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 ${
                        active
                          ? "bg-red-500/20 text-red-400 hover:bg-red-500/40"
                          : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40"
                      }`}
                    >
                      {active ? "End Draft" : "Start Draft"}
                    </button>
                  </div>
                  <PickHistoryPanel
                    seasonId={Number(seasonId)}
                    conferenceId={conf.id}
                    draftLog={draftLog}
                    teams={teams}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {seasonId && teamId && (
        <>
          {/* Team draft status */}
          <div className="flex items-center gap-3 px-3 py-2 bg-white/5 border border-white/10 rounded-lg w-fit">
            <span className="text-white text-sm font-medium">
              {teams.find((t) => t.id === Number(teamId))?.team_name ?? "Team"} draft:
            </span>
            <span className={`text-xs font-semibold ${teamSeason?.draft_ended_at ? "text-gray-500" : "text-emerald-400"}`}>
              {teamSeason?.draft_ended_at ? "Ended" : "Active"}
            </span>
            <button
              onClick={() => handleToggleTeamDraft(!!teamSeason?.draft_ended_at)}
              disabled={teamDraftPending}
              className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 ${
                teamSeason?.draft_ended_at
                  ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40"
                  : "bg-red-500/20 text-red-400 hover:bg-red-500/40"
              }`}
            >
              {teamSeason?.draft_ended_at ? "Reactivate" : "Force End Draft"}
            </button>
          </div>

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
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-2">
              Add Pokémon
              {isDraftActive && (
                <span className="text-emerald-400 text-[10px] font-bold tracking-wide normal-case">
                  ● will be logged as the next draft pick
                </span>
              )}
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
                  Team has no conference assigned for this season.
                </p>
              )}
            </form>
          </div>
        </>
      )}
    </div>
  );
}
