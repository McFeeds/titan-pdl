"use client";

import { useActionState, useTransition } from "react";
import { addTeamMember, removeTeamMember } from "./actions";

type Member = { discord_id: string };
type State = { error?: string } | null;

export default function TeamMembersManager({
  teamId,
  members,
}: {
  teamId: number;
  members: Member[];
}) {
  const [state, formAction, pending] = useActionState(addTeamMember, null);
  const [removePending, startRemove] = useTransition();

  function handleRemove(discord_id: string) {
    const fd = new FormData();
    fd.append("team_id", teamId.toString());
    fd.append("discord_id", discord_id);
    startRemove(async () => {
      await removeTeamMember(fd);
    });
  }

  return (
    <div className="max-w-lg mt-10">
      <h2 className="text-lg font-semibold text-white mb-4">Members</h2>

      {members.length === 0 ? (
        <p className="text-gray-500 text-sm mb-4">No members yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 mb-6">
          {members.map((m) => (
            <li
              key={m.discord_id}
              className="flex items-center justify-between px-3 py-2 bg-white/5 rounded-lg"
            >
              <span className="text-white text-sm">{m.discord_id}</span>
              <button
                onClick={() => handleRemove(m.discord_id)}
                disabled={removePending}
                className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form action={formAction} className="flex items-start gap-3">
        <input type="hidden" name="team_id" value={teamId} />
        <div className="flex flex-col gap-1">
          <input
            name="discord_id"
            placeholder="Discord username"
            className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-56 text-sm"
          />
          {state?.error && (
            <p className="text-red-400 text-xs">{state.error}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={pending}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50"
        >
          {pending ? "Adding…" : "Add Member"}
        </button>
      </form>
    </div>
  );
}
