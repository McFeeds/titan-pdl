import { createClient } from "@/lib/supabase/server";
import PokemonTable from "./PokemonTable";

export default async function AdminPokemonPage() {
  const supabase = await createClient();
  const { data: pokemon } = await supabase
    .from("pokemon")
    .select("id, name, type_1, type_2, point_value")
    .order("name");

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Pokémon</h1>
      <PokemonTable pokemon={pokemon ?? []} />
    </div>
  );
}
