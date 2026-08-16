import { createClient } from "@/lib/supabase/server";
import DraftPoolsManager from "./DraftPoolsManager";

export default async function AdminDraftPoolsPage() {
  const supabase = await createClient();

  const [
    { data: seasons },
    { data: conferences },
    { data: groups },
    { data: teams },
    { data: teamSeasons },
    { data: draftPools },
    { data: draftLog },
  ] = await Promise.all([
    supabase.from("seasons").select("id, name, is_active").order("created_at", { ascending: false }),
    supabase.from("conferences").select("id, name").order("name"),
    supabase.from("groups").select("id, name, conference_id").order("name"),
    supabase.from("teams").select("id, team_name").order("team_name"),
    supabase
      .from("team_seasons")
      .select("team_id, season_id, conference_id, group_id, draft_pool_id, draft_position, draft_ended_at")
      .order("draft_position"),
    supabase.from("draft_pools").select("id, season_id, name, is_active, started_at").order("name"),
    supabase
      .from("draft_log")
      .select("id, season_id, draft_pool_id, pick_number, team_id, pokemon_id, created_at, pokemon(name)")
      .order("pick_number"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Draft Pools</h1>
      <DraftPoolsManager
        seasons={seasons ?? []}
        conferences={conferences ?? []}
        groups={groups ?? []}
        teams={teams ?? []}
        teamSeasons={teamSeasons ?? []}
        draftPools={draftPools ?? []}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draftLog={(draftLog ?? []) as any}
      />
    </div>
  );
}
