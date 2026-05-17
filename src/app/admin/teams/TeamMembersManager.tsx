"use client";

import { useActionState, useState, useTransition } from "react";
import { addTeamMember, updateTeamMember, removeTeamMember } from "./actions";

type Member = { discord_id: string; showdown_name: string | null };

const inputCls =
  "px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-sm";

function MemberRow({ member, teamId }: { member: Member; teamId: number }) {
  const [editing, setEditing] = useState(false);
  const [showdownValue, setShowdownValue] = useState(member.showdown_name ?? "");
  const [savePending, startSave] = useTransition();
  const [removePending, startRemove] = useTransition();

  function handleSave() {
    const fd = new FormData();
    fd.append("team_id", teamId.toString());
    fd.append("discord_id", member.discord_id);
    fd.append("showdown_name", showdownValue);
    startSave(async () => {
      await updateTeamMember(fd);
      setEditing(false);
    });
  }

  function handleRemove() {
    const fd = new FormData();
    fd.append("team_id", teamId.toString());
    fd.append("discord_id", member.discord_id);
    startRemove(async () => {
      await removeTeamMember(fd);
    });
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2 bg-white/5 rounded-lg">
      <span className="text-white text-sm w-36 shrink-0">{member.discord_id}</span>

      {editing ? (
        <div className="flex items-center gap-2 flex-1">
          <input
            value={showdownValue}
            onChange={(e) => setShowdownValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
              if (e.key === "Escape") setEditing(false);
            }}
            placeholder="Showdown name"
            autoFocus
            className={`${inputCls} flex-1`}
          />
          <button
            onClick={handleSave}
            disabled={savePending}
            className="text-xs text-indigo-400 hover:text-indigo-300 font-medium disabled:opacity-50 shrink-0"
          >
            {savePending ? "…" : "Save"}
          </button>
          <button
            onClick={() => setEditing(false)}
            className="text-xs text-gray-500 hover:text-gray-300 shrink-0"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex-1 text-left text-sm text-gray-400 hover:text-white transition-colors"
        >
          {member.showdown_name ?? <span className="italic text-gray-600">No showdown name</span>}
        </button>
      )}

      <button
        onClick={handleRemove}
        disabled={removePending}
        className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-50 shrink-0"
      >
        Remove
      </button>
    </li>
  );
}

export default function TeamMembersManager({
  teamId,
  members,
}: {
  teamId: number;
  members: Member[];
}) {
  const [state, formAction, pending] = useActionState(addTeamMember, null);

  return (
    <div className="max-w-lg mt-10">
      <h2 className="text-lg font-semibold text-white mb-4">Members</h2>

      {members.length === 0 ? (
        <p className="text-gray-500 text-sm mb-4">No members yet.</p>
      ) : (
        <ul className="flex flex-col gap-1 mb-6">
          {members.map((m) => (
            <MemberRow key={m.discord_id} member={m} teamId={teamId} />
          ))}
        </ul>
      )}

      <form action={formAction} className="flex flex-col gap-2">
        <input type="hidden" name="team_id" value={teamId} />
        <div className="flex items-start gap-2">
          <input
            name="discord_id"
            placeholder="Discord username"
            className={`${inputCls} w-44`}
          />
          <input
            name="showdown_name"
            placeholder="Showdown name"
            className={`${inputCls} w-44`}
          />
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors disabled:opacity-50 shrink-0"
          >
            {pending ? "Adding…" : "Add"}
          </button>
        </div>
        {state?.error && (
          <p className="text-red-400 text-xs">{state.error}</p>
        )}
      </form>
    </div>
  );
}
