import { createClient } from "@/lib/supabase/server";
import PlayoffsManager from "./PlayoffsManager";

export default async function AdminPlayoffsPage() {
  const supabase = await createClient();

  const [{ data: seasons }, { data: teams }, { data: slots }] = await Promise.all([
    supabase.from("seasons").select("id, name, is_active").order("created_at", { ascending: false }),
    supabase.from("teams").select("id, team_name").order("team_name"),
    supabase
      .from("playoff_bracket_slots")
      .select("id, season_id, round, position, team_id")
      .order("round")
      .order("position"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Playoff Bracket</h1>
      <PlayoffsManager
        seasons={seasons ?? []}
        teams={teams ?? []}
        slots={slots ?? []}
      />
    </div>
  );
}
