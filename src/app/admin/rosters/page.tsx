import { createClient } from "@/lib/supabase/server";
import RosterManager from "./RosterManager";

export default async function AdminRostersPage() {
  const supabase = await createClient();

  const [
    { data: seasons },
    { data: teams },
    { data: teamSeasons },
    { data: pokemon },
    { data: roster },
    { data: conferences },
    { data: draftStates },
    { data: draftLog },
  ] = await Promise.all([
    supabase.from("seasons").select("id, name").order("created_at", { ascending: false }),
    supabase.from("teams").select("id, team_name").order("team_name"),
    supabase.from("team_seasons").select("team_id, season_id, conference_id, draft_ended_at"),
    supabase.from("pokemon").select("id, name").order("name"),
    supabase.from("rosters").select("pokemon_id, season_id, conference_id, team_id, pokemon(name)"),
    supabase.from("conferences").select("id, name").order("name"),
    supabase.from("conference_drafts").select("season_id, conference_id, is_active"),
    supabase
      .from("draft_log")
      .select("id, season_id, conference_id, pick_number, team_id, pokemon_id, created_at, pokemon(name)")
      .order("pick_number"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Rosters</h1>
      <RosterManager
        seasons={seasons ?? []}
        teams={teams ?? []}
        teamSeasons={teamSeasons ?? []}
        pokemon={pokemon ?? []}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        roster={(roster ?? []) as any}
        conferences={conferences ?? []}
        draftStates={draftStates ?? []}
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        draftLog={(draftLog ?? []) as any}
      />
    </div>
  );
}
