import { createClient } from "@/lib/supabase/server";
import DraftPlanner, { type PreloadedTeam } from "./DraftPlanner";
import type { PokemonWithMoves } from "@/types/database";

export const metadata = { title: "Draft Planner | Titan PDL" };

export default async function DraftPlannerPage({
  searchParams,
}: {
  searchParams: Promise<{ teamId?: string }>;
}) {
  const { teamId: teamIdRaw } = await searchParams;
  const supabase = await createClient();

  const { data: rawPokemon } = await supabase
    .from("pokemon")
    .select("*, pokemon_moves(important_moves(id, name, slug))")
    .gt("point_value", 0) // banned pokemon (point_value = 0) never appear publicly
    .order("point_value", { ascending: false })
    .order("name");

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const pokemon: PokemonWithMoves[] = (rawPokemon ?? []).map((p: any) => ({
    ...p,
    moves: (p.pokemon_moves ?? [])
      .map((pm: any) => pm.important_moves)
      .filter(Boolean),
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Deep-link from the Standings page ("view this team in the planner") —
  // preload the team's current-season roster + point budget as a starting
  // point. Purely a starting point for the local sandbox: nothing here
  // ever writes back to the real team.
  let preloadedTeam: PreloadedTeam | null = null;
  const teamId = teamIdRaw ? Number(teamIdRaw) : null;
  if (teamId) {
    const [{ data: team }, { data: activeSeason }] = await Promise.all([
      supabase.from("teams").select("team_name").eq("id", teamId).maybeSingle(),
      supabase.from("seasons").select("id, point_budget").eq("is_active", true).limit(1).maybeSingle(),
    ]);

    if (team && activeSeason) {
      const { data: roster } = await supabase
        .from("rosters")
        .select("pokemon_id")
        .eq("team_id", teamId)
        .eq("season_id", activeSeason.id);

      preloadedTeam = {
        name: team.team_name,
        budget: activeSeason.point_budget,
        pokemonIds: (roster ?? []).map((r) => r.pokemon_id),
      };
    }
  }

  return <DraftPlanner pokemon={pokemon} preloadedTeam={preloadedTeam} />;
}
