"use client";

import { useActionState, useState } from "react";
import { upsertTeamSeason } from "./actions";

const inputCls =
  "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500";
const selectCls =
  "w-full px-3 py-2 bg-[#0d0d1f] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 [&>option]:bg-[#0d0d1f]";
const labelCls = "block text-sm font-medium text-gray-300 mb-1";

type Conference = { id: number; name: string };
type Group = { id: number; name: string; conference_id: number };
type DraftPool = { id: number; name: string };
type TeamSeason = {
  team_id: number;
  season_id: number;
  conference_id: number;
  group_id: number | null;
  draft_pool_id: number | null;
  draft_position: number | null;
};
type Season = { id: number; name: string; is_active: boolean };

type Props = {
  teamId: number;
  activeSeason: Season | null;
  conferences: Conference[];
  groups: Group[];
  draftPools: DraftPool[];
  teamSeasons: TeamSeason[];
};

export default function TeamSeasonForm({
  teamId,
  activeSeason,
  conferences,
  groups,
  draftPools,
  teamSeasons,
}: Props) {
  const activePlacement = activeSeason
    ? teamSeasons.find((ts) => ts.season_id === activeSeason.id)
    : null;

  const [state, formAction, pending] = useActionState(upsertTeamSeason, null);
  const [selectedConference, setSelectedConference] = useState(
    activePlacement?.conference_id?.toString() ?? ""
  );

  const filteredGroups = selectedConference
    ? groups.filter((g) => g.conference_id === Number(selectedConference))
    : groups;

  const pastPlacements = teamSeasons.filter(
    (ts) => ts.season_id !== activeSeason?.id
  );

  if (!activeSeason) {
    return (
      <div className="max-w-lg mt-10">
        <h2 className="text-lg font-semibold text-white mb-2">Season Placement</h2>
        <p className="text-gray-500 text-sm">No active season. Set a season active first.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mt-10">
      <h2 className="text-lg font-semibold text-white mb-1">Season Placement</h2>
      <p className="text-xs text-gray-500 mb-4">{activeSeason.name} (active)</p>

      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="team_id" value={teamId} />
        <input type="hidden" name="season_id" value={activeSeason.id} />

        {state?.error && (
          <p className="px-4 py-3 bg-red-900/40 border border-red-500/30 text-red-300 text-sm rounded-lg">
            {state.error}
          </p>
        )}

        <div>
          <label className={labelCls}>Conference</label>
          <select
            name="conference_id"
            value={selectedConference}
            onChange={(e) => setSelectedConference(e.target.value)}
            className={selectCls}
          >
            <option value="">— None —</option>
            {conferences.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Group</label>
          <select
            name="group_id"
            defaultValue={activePlacement?.group_id?.toString() ?? ""}
            className={selectCls}
          >
            <option value="">— None —</option>
            {filteredGroups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelCls}>Draft Pool</label>
          <select
            name="draft_pool_id"
            defaultValue={activePlacement?.draft_pool_id?.toString() ?? ""}
            className={selectCls}
          >
            <option value="">— None —</option>
            {draftPools.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="text-xs text-gray-600 mt-1">
            Which teams draft together, in what order — independent of
            conference/group. Manage pools and bulk-assign teams on the{" "}
            <a href="/admin/draft-pools" className="text-indigo-400 hover:text-indigo-300">
              Draft Pools
            </a>{" "}
            page.
          </p>
        </div>

        <div>
          <label className={labelCls}>Draft Position</label>
          <input
            name="draft_position"
            type="number"
            defaultValue={activePlacement?.draft_position?.toString() ?? ""}
            placeholder="1"
            className={inputCls}
          />
        </div>

        <div>
          <button
            type="submit"
            disabled={pending}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save Placement"}
          </button>
        </div>
      </form>

      {pastPlacements.length > 0 && (
        <div className="mt-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-2">
            Past Seasons
          </p>
          <ul className="flex flex-col gap-1">
            {pastPlacements.map((ts) => {
              const conf = conferences.find((c) => c.id === ts.conference_id);
              const grp = groups.find((g) => g.id === ts.group_id);
              return (
                <li key={ts.season_id} className="flex items-center gap-2 text-sm text-gray-400 px-3 py-2 bg-white/5 rounded-lg">
                  <span className="font-medium text-gray-300">Season {ts.season_id}</span>
                  <span>·</span>
                  <span>{conf?.name ?? "—"}{grp ? ` / ${grp.name}` : ""}</span>
                  {ts.draft_position && <span>· Pick {ts.draft_position}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
