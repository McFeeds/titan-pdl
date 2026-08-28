"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createDraftPool,
  renameDraftPool,
  deleteDraftPool,
  assignTeamsToPool,
  assignGroupToPool,
  assignConferenceToPool,
  removeTeamFromPool,
  updateTeamDraftPosition,
  setDraftPoolActive,
  forceEndTeamDraft,
  reactivateTeamDraft,
  revertDraftToPick,
} from "./actions";

const selectCls =
  "px-3 py-2 bg-[#0d0d1f] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm [&>option]:bg-[#0d0d1f]";
const inputCls =
  "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm";

type Season = { id: number; name: string; is_active: boolean };
type Conference = { id: number; name: string };
type Group = { id: number; name: string; conference_id: number };
type Team = { id: number; team_name: string };
type TeamSeason = {
  team_id: number;
  season_id: number;
  conference_id: number | null;
  group_id: number | null;
  draft_pool_id: number | null;
  draft_position: number | null;
  draft_ended_at: string | null;
};
type DraftPool = {
  id: number;
  season_id: number;
  name: string;
  is_active: boolean;
  started_at: string | null;
  completed_at: string | null;
};
type DraftLogEntry = {
  id: number;
  season_id: number;
  draft_pool_id: number;
  pick_number: number;
  team_id: number;
  pokemon_id: number;
  created_at: string;
  pokemon: { name: string } | null;
};

type Props = {
  seasons: Season[];
  conferences: Conference[];
  groups: Group[];
  teams: Team[];
  teamSeasons: TeamSeason[];
  draftPools: DraftPool[];
  draftLog: DraftLogEntry[];
};

// ---------- Pick history panel ----------

function PickHistoryPanel({
  seasonId,
  poolId,
  draftLog,
  teamNameById,
}: {
  seasonId: number;
  poolId: number;
  draftLog: DraftLogEntry[];
  teamNameById: Map<number, string>;
}) {
  const [open, setOpen] = useState(false);
  const [confirmingPick, setConfirmingPick] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();

  const picks = draftLog
    .filter((d) => d.draft_pool_id === poolId)
    .sort((a, b) => b.pick_number - a.pick_number);

  function handleRevert(pickNumber: number) {
    startTransition(async () => {
      await revertDraftToPick(seasonId, poolId, pickNumber - 1);
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

// ---------- One team row within a pool ----------

function TeamRow({
  ts,
  seasonId,
  team,
  conferenceName,
  groupName,
}: {
  ts: TeamSeason;
  seasonId: number;
  team: Team | undefined;
  conferenceName: string;
  groupName: string | null;
}) {
  const [position, setPosition] = useState(ts.draft_position?.toString() ?? "");
  const [posPending, startPos] = useTransition();
  const [endPending, startEnd] = useTransition();
  const [removePending, startRemove] = useTransition();

  function savePosition() {
    startPos(async () => {
      await updateTeamDraftPosition(seasonId, ts.team_id, position ? Number(position) : null);
    });
  }

  function toggleEnded() {
    startEnd(async () => {
      if (ts.draft_ended_at) await reactivateTeamDraft(seasonId, ts.team_id);
      else await forceEndTeamDraft(seasonId, ts.team_id);
    });
  }

  function handleRemove() {
    startRemove(async () => {
      await removeTeamFromPool(seasonId, ts.team_id);
    });
  }

  return (
    <li className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg flex-wrap">
      <input
        type="number"
        value={position}
        onChange={(e) => setPosition(e.target.value)}
        onBlur={savePosition}
        disabled={posPending}
        placeholder="#"
        className="w-14 px-1.5 py-1 bg-[#0d0d1f] border border-white/10 rounded text-white text-xs text-center focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <span className="text-white text-sm font-medium flex-1 min-w-0 truncate">
        {team?.team_name ?? `Team #${ts.team_id}`}
      </span>
      <span className="text-[10px] font-semibold text-gray-500 bg-white/5 border border-white/10 rounded-full px-2 py-0.5 shrink-0">
        {conferenceName}{groupName ? ` / ${groupName}` : ""}
      </span>
      <button
        onClick={toggleEnded}
        disabled={endPending}
        className={`text-[10px] font-semibold px-2 py-1 rounded-md transition-colors disabled:opacity-50 shrink-0 ${
          ts.draft_ended_at
            ? "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40"
            : "bg-red-500/20 text-red-400 hover:bg-red-500/40"
        }`}
      >
        {ts.draft_ended_at ? "Reactivate" : "Force End"}
      </button>
      <button
        onClick={handleRemove}
        disabled={removePending}
        className="text-xs text-red-400/70 hover:text-red-400 font-medium disabled:opacity-50 shrink-0"
      >
        Remove
      </button>
    </li>
  );
}

// ---------- One draft pool ----------

function PoolCard({
  pool,
  seasonId,
  teamSeasonsForSeason,
  teams,
  conferences,
  groups,
  draftLog,
  teamNameById,
  conferenceNameById,
  groupNameById,
}: {
  pool: DraftPool;
  seasonId: number;
  teamSeasonsForSeason: TeamSeason[];
  teams: Team[];
  conferences: Conference[];
  groups: Group[];
  draftLog: DraftLogEntry[];
  teamNameById: Map<number, string>;
  conferenceNameById: Map<number, string>;
  groupNameById: Map<number, string>;
}) {
  const teamById = new Map(teams.map((t) => [t.id, t]));
  const [name, setName] = useState(pool.name);
  const [namePending, startName] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deletePending, startDelete] = useTransition();
  const [togglePending, startToggle] = useTransition();
  const [conferenceToAdd, setConferenceToAdd] = useState("");
  const [groupToAdd, setGroupToAdd] = useState("");
  const [bulkPending, startBulk] = useTransition();
  const [showIndividualAdd, setShowIndividualAdd] = useState(false);
  const [checkedTeamIds, setCheckedTeamIds] = useState<Set<number>>(new Set());
  const [addPending, startAdd] = useTransition();

  const poolTeams = teamSeasonsForSeason
    .filter((ts) => ts.draft_pool_id === pool.id)
    .sort((a, b) => (a.draft_position ?? 999) - (b.draft_position ?? 999));

  const otherTeams = teamSeasonsForSeason.filter((ts) => ts.draft_pool_id !== pool.id);

  function saveName() {
    if (name.trim() && name.trim() !== pool.name) {
      startName(async () => {
        await renameDraftPool(pool.id, name.trim());
      });
    }
  }

  function handleDelete() {
    startDelete(async () => {
      const fd = new FormData();
      fd.append("id", pool.id.toString());
      await deleteDraftPool(fd);
    });
  }

  function handleToggleActive() {
    startToggle(async () => {
      await setDraftPoolActive(pool.id, !pool.is_active);
    });
  }

  function handleAddConference() {
    if (!conferenceToAdd) return;
    startBulk(async () => {
      await assignConferenceToPool(pool.id, seasonId, Number(conferenceToAdd));
      setConferenceToAdd("");
    });
  }

  function handleAddGroup() {
    if (!groupToAdd) return;
    startBulk(async () => {
      await assignGroupToPool(pool.id, seasonId, Number(groupToAdd));
      setGroupToAdd("");
    });
  }

  function toggleChecked(teamId: number) {
    setCheckedTeamIds((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  function handleAddSelected() {
    const ids = [...checkedTeamIds];
    if (ids.length === 0) return;
    startAdd(async () => {
      await assignTeamsToPool(pool.id, seasonId, ids);
      setCheckedTeamIds(new Set());
    });
  }

  // completed_at (not started_at + !is_active) is the real "done" signal —
  // a paused pool looks identical to an ended one by started_at/is_active
  // alone, but only completion actually opens free agency.
  const status = pool.is_active
    ? "Live"
    : pool.completed_at
      ? "Complete"
      : pool.started_at
        ? "Paused"
        : "Not started";

  return (
    <div className="border border-white/10 rounded-xl p-5 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3 flex-wrap">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          disabled={namePending}
          className="bg-transparent border-b border-transparent hover:border-white/20 focus:border-indigo-500 text-white text-lg font-semibold outline-none px-0.5 py-0.5 min-w-0"
        />
        <span
          className={`text-xs font-semibold ${
            pool.is_active
              ? "text-emerald-400"
              : pool.completed_at
                ? "text-indigo-400"
                : pool.started_at
                  ? "text-gray-500"
                  : "text-amber-400"
          }`}
        >
          ● {status}
        </span>
        <button
          onClick={handleToggleActive}
          disabled={togglePending}
          className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors disabled:opacity-50 ${
            pool.is_active
              ? "bg-red-500/20 text-red-400 hover:bg-red-500/40"
              : "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/40"
          }`}
        >
          {pool.is_active ? "Pause Draft" : pool.started_at ? "Resume Draft" : "Start Draft"}
        </button>

        <div className="ml-auto">
          {confirmingDelete ? (
            <span className="flex items-center gap-1.5 text-xs">
              <span className="text-gray-500">Delete pool?</span>
              <button
                onClick={handleDelete}
                disabled={deletePending}
                className="text-red-400 hover:text-red-300 font-bold disabled:opacity-50"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmingDelete(false)}
                className="text-gray-500 hover:text-gray-300 font-medium"
              >
                No
              </button>
            </span>
          ) : (
            <button
              onClick={() => setConfirmingDelete(true)}
              className="text-xs text-red-400/70 hover:text-red-400 font-medium"
            >
              Delete Pool
            </button>
          )}
        </div>
      </div>

      <PickHistoryPanel
        seasonId={seasonId}
        poolId={pool.id}
        draftLog={draftLog}
        teamNameById={teamNameById}
      />

      {/* Bulk assign */}
      <div className="flex items-center gap-2 flex-wrap">
        <select value={conferenceToAdd} onChange={(e) => setConferenceToAdd(e.target.value)} className={`${selectCls} w-40`}>
          <option value="">— Conference —</option>
          {conferences.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <button
          onClick={handleAddConference}
          disabled={!conferenceToAdd || bulkPending}
          className="px-3 py-2 bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          Add All Teams
        </button>

        <select value={groupToAdd} onChange={(e) => setGroupToAdd(e.target.value)} className={`${selectCls} w-40`}>
          <option value="">— Group —</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        <button
          onClick={handleAddGroup}
          disabled={!groupToAdd || bulkPending}
          className="px-3 py-2 bg-indigo-600/80 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          Add All Teams
        </button>

        <button
          onClick={() => setShowIndividualAdd((s) => !s)}
          className="text-xs text-indigo-400 hover:text-indigo-300 font-medium ml-auto"
        >
          {showIndividualAdd ? "Hide" : "Add teams individually"}
        </button>
      </div>

      {showIndividualAdd && (
        <div className="bg-white/[0.03] rounded-lg p-3 flex flex-col gap-2">
          {otherTeams.length === 0 ? (
            <p className="text-xs text-gray-600 italic">Every team this season is already in this pool.</p>
          ) : (
            <>
              <ul className="max-h-48 overflow-y-auto flex flex-col gap-1">
                {otherTeams.map((ts) => (
                  <li key={ts.team_id} className="flex items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      checked={checkedTeamIds.has(ts.team_id)}
                      onChange={() => toggleChecked(ts.team_id)}
                    />
                    <span className="text-gray-200">{teamById.get(ts.team_id)?.team_name ?? `Team #${ts.team_id}`}</span>
                    <span className="text-gray-600">
                      {(ts.conference_id !== null && conferenceNameById.get(ts.conference_id)) || "—"}
                      {ts.draft_pool_id ? " · currently in another pool" : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={handleAddSelected}
                disabled={checkedTeamIds.size === 0 || addPending}
                className="self-start px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                Add Selected ({checkedTeamIds.size})
              </button>
            </>
          )}
        </div>
      )}

      {/* Team list */}
      <div>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Teams ({poolTeams.length})
        </h3>
        {poolTeams.length === 0 ? (
          <p className="text-gray-600 text-sm italic">No teams assigned to this pool yet.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {poolTeams.map((ts) => (
              <TeamRow
                key={ts.team_id}
                ts={ts}
                seasonId={seasonId}
                team={teamById.get(ts.team_id)}
                conferenceName={(ts.conference_id !== null && conferenceNameById.get(ts.conference_id)) || "—"}
                groupName={ts.group_id ? groupNameById.get(ts.group_id) ?? null : null}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------- Main export ----------

export default function DraftPoolsManager({
  seasons,
  conferences,
  groups,
  teams,
  teamSeasons,
  draftPools,
  draftLog,
}: Props) {
  const activeSeason = seasons.find((s) => s.is_active);
  const [seasonId, setSeasonId] = useState(activeSeason?.id.toString() ?? "");
  const [state, formAction, pending] = useActionState(createDraftPool, null);

  const teamNameById = new Map(teams.map((t) => [t.id, t.team_name]));
  const conferenceNameById = new Map(conferences.map((c) => [c.id, c.name]));
  const groupNameById = new Map(groups.map((g) => [g.id, g.name]));

  const poolsForSeason = draftPools.filter((p) => p.season_id === Number(seasonId));
  const teamSeasonsForSeason = teamSeasons.filter((ts) => ts.season_id === Number(seasonId));

  return (
    <div className="flex flex-col gap-8">
      {/* Season selector */}
      <div>
        <label className="block text-xs text-gray-400 mb-1">Season</label>
        <select className={selectCls} value={seasonId} onChange={(e) => setSeasonId(e.target.value)}>
          <option value="">— Select —</option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>{s.name}{s.is_active ? " (active)" : ""}</option>
          ))}
        </select>
      </div>

      {seasonId && (
        <>
          {/* Pools */}
          <div className="flex flex-col gap-6">
            {poolsForSeason.length === 0 && (
              <p className="text-gray-500 text-sm">No draft pools yet for this season.</p>
            )}
            {poolsForSeason.map((pool) => (
              <PoolCard
                key={pool.id}
                pool={pool}
                seasonId={Number(seasonId)}
                teamSeasonsForSeason={teamSeasonsForSeason}
                teams={teams}
                conferences={conferences}
                groups={groups}
                draftLog={draftLog}
                teamNameById={teamNameById}
                conferenceNameById={conferenceNameById}
                groupNameById={groupNameById}
              />
            ))}
          </div>

          {/* New pool */}
          <div>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
              New Draft Pool
            </h2>
            <form action={formAction} className="flex items-start gap-3 flex-wrap">
              <input type="hidden" name="season_id" value={seasonId} />
              <input
                name="name"
                placeholder="e.g. Hoenn, or Draft Day 1"
                className={`${inputCls} w-64`}
              />
              <button
                type="submit"
                disabled={pending}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
              >
                {pending ? "Adding…" : "Add Pool"}
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
