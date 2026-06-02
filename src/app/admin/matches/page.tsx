import { createClient } from "@/lib/supabase/server";
import MatchesManager from "./MatchesManager";

export default async function AdminMatchesPage() {
  const supabase = await createClient();

  const [{ data: seasons }, { data: teams }, { data: matches }] = await Promise.all([
    supabase.from("seasons").select("id, name, is_active").order("created_at", { ascending: false }),
    supabase.from("teams").select("id, team_name").order("team_name"),
    supabase.from("matches").select("id, season_id, week_number, home_team_id, away_team_id").order("week_number"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Matches</h1>
      <MatchesManager
        seasons={seasons ?? []}
        teams={teams ?? []}
        matches={matches ?? []}
      />
    </div>
  );
}
