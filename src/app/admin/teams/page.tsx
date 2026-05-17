import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { deleteTeam } from "./actions";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";

export default async function AdminTeamsPage() {
  const supabase = await createClient();
  const { data: teams } = await supabase
    .from("teams")
    .select("id, team_name, conferences(name), groups(name), team_members(discord_id, showdown_name)")
    .order("team_name");

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Teams</h1>
        <Link
          href="/admin/teams/new"
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold rounded-lg transition-colors"
        >
          + Add Team
        </Link>
      </div>

      {!teams?.length ? (
        <p className="text-gray-400">No teams yet.</p>
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
              {teams.map((team) => (
                <tr key={team.id} className="border-t border-white/5">
                  <td className="py-3 pr-6 text-white font-medium">{team.team_name}</td>
                  <td className="py-3 pr-6 text-gray-300 text-xs">
                    {team.team_members?.map((m) =>
                      m.showdown_name ? `${m.discord_id} (${m.showdown_name})` : m.discord_id
                    ).join(", ") || "—"}
                  </td>
                  <td className="py-3 pr-6 text-gray-300">
                    {/* @ts-expect-error supabase join typing */}
                    {team.conferences?.name ?? "—"}
                    {/* @ts-expect-error supabase join typing */}
                    {team.groups?.name ? ` / ${team.groups.name}` : ""}
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
