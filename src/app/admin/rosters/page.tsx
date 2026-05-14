import { createClient } from "@/lib/supabase/server";
import RosterManager from "./RosterManager";

export default async function AdminRostersPage() {
  const supabase = await createClient();

  const [
    { data: seasons },
    { data: conferences },
    { data: teams },
    { data: pokemon },
    { data: roster },
  ] = await Promise.all([
    supabase.from("seasons").select("id, name").order("created_at", { ascending: false }),
    supabase.from("conferences").select("id, name").order("name"),
    supabase.from("teams").select("id, team_name, conference_id").order("team_name"),
    supabase.from("pokemon").select("id, name").order("name"),
    supabase.from("rosters").select("pokemon_id, season_id, conference_id, team_id, pokemon(name)"),
  ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Rosters</h1>
      <RosterManager
        seasons={seasons ?? []}
        conferences={conferences ?? []}
        teams={teams ?? []}
        pokemon={pokemon ?? []}
        roster={roster ?? []}
      />
    </div>
  );
}
