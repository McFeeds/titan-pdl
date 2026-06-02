"use client";

import { useActionState } from "react";

const inputCls =
  "w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500";
const labelCls = "block text-sm font-medium text-gray-300 mb-1";

type Team = {
  id: number;
  team_name: string;
  logo_url: string | null;
};

type Props = {
  action: (_prevState: { error?: string } | null, formData: FormData) => Promise<{ error?: string } | null>;
  team?: Team;
};

export default function TeamForm({ action, team }: Props) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="max-w-lg flex flex-col gap-5">
      {team && <input type="hidden" name="id" value={team.id} />}

      {state?.error && (
        <p className="px-4 py-3 bg-red-900/40 border border-red-500/30 text-red-300 text-sm rounded-lg">
          {state.error}
        </p>
      )}

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
        <label className={labelCls}>Logo URL</label>
        <input
          name="logo_url"
          defaultValue={team?.logo_url ?? ""}
          placeholder="https://i.imgur.com/..."
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
