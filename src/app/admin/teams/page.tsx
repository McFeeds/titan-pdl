import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { deleteTeam } from "./actions";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";

export default async function AdminTeamsPage() {
  const supabase = await createClient();

  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("id")
    .eq("is_active", true)
    .maybeSingle();

  const [{ data: teams }, { data: placements }, { data: members }] = await Promise.all([
    supabase.from("teams").select("id, team_name").order("team_name"),
    activeSeason
      ? supabase
          .from("team_seasons")
          .select("team_id, conferences(name), groups(name)")
          .eq("season_id", activeSeason.id)
      : Promise.resolve({ data: [] }),
    activeSeason
      ? supabase
          .from("team_members")
          .select("team_id, discord_id, showdown_name")
          .eq("season_id", activeSeason.id)
      : Promise.resolve({ data: [] }),
  ]);

  // Build lookup maps so we can join in JS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const placementMap = new Map((placements ?? []).map((p: any) => [p.team_id, p]));
  const membersByTeam = new Map<number, { discord_id: string; showdown_name: string | null }[]>();
  for (const m of members ?? []) {
    const list = membersByTeam.get(m.team_id) ?? [];
    list.push(m);
    membersByTeam.set(m.team_id, list);
  }

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
              {teams.map((team) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const placement = placementMap.get(team.id) as any;
                const teamMembers = membersByTeam.get(team.id) ?? [];
                return (
                  <tr key={team.id} className="border-t border-white/5">
                    <td className="py-3 pr-6 text-white font-medium">{team.team_name}</td>
                    <td className="py-3 pr-6 text-gray-300 text-xs">
                      {teamMembers.length
                        ? teamMembers.map((m) =>
                            m.showdown_name ? `${m.discord_id} (${m.showdown_name})` : m.discord_id
                          ).join(", ")
                        : "—"}
                    </td>
                    <td className="py-3 pr-6 text-gray-300">
                      {placement?.conferences?.name ?? "—"}
                      {placement?.groups?.name ? ` / ${placement.groups.name}` : ""}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
