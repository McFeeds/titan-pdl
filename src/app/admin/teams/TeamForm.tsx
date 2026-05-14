"use client";

import { useActionState, useState } from "react";

const inputCls =
  "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500";
const selectCls =
  "w-full px-3 py-2 bg-[#0d0d1f] border border-white/10 rounded-lg text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 [&>option]:bg-[#0d0d1f]";
const labelCls = "block text-sm font-medium text-gray-300 mb-1";

type Conference = { id: number; name: string };
type Group = { id: number; name: string; conference_id: number };
type Team = {
  id: number;
  discord_id: string;
  team_name: string;
  showdown_name: string;
  logo_url: string | null;
  conference_id: number | null;
  group_id: number | null;
  draft_position: number | null;
};

type Props = {
  action: (prevState: { error?: string } | null, formData: FormData) => Promise<{ error?: string } | null>;
  conferences: Conference[];
  groups: Group[];
  team?: Team;
};

export default function TeamForm({ action, conferences, groups, team }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const [selectedConference, setSelectedConference] = useState(
    team?.conference_id?.toString() ?? ""
  );

  const filteredGroups = selectedConference
    ? groups.filter((g) => g.conference_id === Number(selectedConference))
    : groups;

  return (
    <form action={formAction} className="max-w-lg flex flex-col gap-5">
      {team && <input type="hidden" name="id" value={team.id} />}

      {state?.error && (
        <p className="px-4 py-3 bg-red-900/40 border border-red-500/30 text-red-300 text-sm rounded-lg">
          {state.error}
        </p>
      )}

      <div>
        <label className={labelCls}>Discord Username</label>
        <input
          name="discord_id"
          defaultValue={team?.discord_id ?? ""}
          placeholder="mcfeeds"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Team Name</label>
        <input
          name="team_name"
          defaultValue={team?.team_name ?? ""}
          placeholder="The Wild Krookodiles"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Showdown Name</label>
        <input
          name="showdown_name"
          defaultValue={team?.showdown_name ?? ""}
          placeholder="McFeeds"
          className={inputCls}
        />
      </div>

      <div>
        <label className={labelCls}>Logo URL</label>
        <input
          name="logo_url"
          defaultValue={team?.logo_url ?? ""}
          placeholder="https://i.imgur.com/..."
          className={inputCls}
        />
      </div>

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
          defaultValue={team?.group_id?.toString() ?? ""}
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
        <label className={labelCls}>Draft Position</label>
        <input
          name="draft_position"
          type="number"
          defaultValue={team?.draft_position?.toString() ?? ""}
          placeholder="1"
          className={inputCls}
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {pending ? "Saving…" : team ? "Save Changes" : "Create Team"}
        </button>
        <a
          href="/admin/teams"
          className="px-5 py-2 bg-white/10 hover:bg-white/15 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  );
}
