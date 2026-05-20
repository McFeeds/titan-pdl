import { createClient } from "@/lib/supabase/server";
import DraftPlanner from "./DraftPlanner";
import type { PokemonWithMoves } from "@/types/database";

export const metadata = { title: "Draft Planner | Titan PDL" };

export default async function DraftPlannerPage() {
  const supabase = await createClient();

  const { data: rawPokemon } = await supabase
    .from("pokemon")
    .select("*, pokemon_moves(important_moves(id, name, slug))")
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

  return <DraftPlanner pokemon={pokemon} />;
}
