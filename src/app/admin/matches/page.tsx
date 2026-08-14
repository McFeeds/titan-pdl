import { createClient } from "@/lib/supabase/server";
import MatchesManager from "./MatchesManager";

export default async function AdminMatchesPage() {
  const supabase = await createClient();

  const [
    { data: seasons },
    { data: teams },
    { data: matches },
    { data: conferences },
    { data: groups },
    { data: teamSeasons },
  ] = await Promise.all([
    supabase.from("seasons").select("id, name, is_active").order("created_at", { ascending: false }),
    supabase.from("teams").select("id, team_name").order("team_name"),
    supabase.from("matches").select("id, season_id, week_number, home_team_id, away_team_id").order("week_number"),
    supabase.from("conferences").select("id, name").order("name"),
    supabase.from("groups").select("id, name, conference_id").order("name"),
    supabase.from("team_seasons").select("team_id, season_id, group_id, conference_id"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Matches</h1>
      <MatchesManager
        seasons={seasons ?? []}
        teams={teams ?? []}
        matches={matches ?? []}
        conferences={conferences ?? []}
        groups={groups ?? []}
        teamSeasons={teamSeasons ?? []}
      />
    </div>
  );
}
