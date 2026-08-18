import { createClient } from "@/lib/supabase/server";
import TeamsManager from "./TeamsManager";

export default async function AdminTeamsPage() {
  const supabase = await createClient();

  const [{ data: seasons }, { data: teams }, { data: placements }, { data: members }] = await Promise.all([
    supabase.from("seasons").select("id, name, is_active").order("created_at", { ascending: false }),
    supabase.from("teams").select("id, team_name").order("team_name"),
    supabase.from("team_seasons").select("team_id, season_id, conferences(name), groups(name)"),
    supabase.from("team_members").select("team_id, season_id, discord_id, showdown_name"),
  ]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const placementRows = (placements ?? []).map((p: any) => ({
    team_id: p.team_id as number,
    season_id: p.season_id as number,
    conference_name: (p.conferences?.name as string | undefined) ?? null,
    group_name: (p.groups?.name as string | undefined) ?? null,
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <TeamsManager
      seasons={seasons ?? []}
      teams={teams ?? []}
      placements={placementRows}
      members={members ?? []}
    />
  );
}
