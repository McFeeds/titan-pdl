import { createClient } from "@/lib/supabase/server";
import DraftBoard from "./DraftBoard";
import type { PokemonWithMoves } from "@/types/database";

export const metadata = { title: "Draft Pools | Titan PDL" };

export default async function DraftPoolsPage() {
  const supabase = await createClient();

  const [
    { data: conferences },
    { data: activeSeason },
    { data: rawPokemon },
    { data: rosters },
    { data: authData },
  ] = await Promise.all([
    supabase.from("conferences").select("id, name").order("name"),
    supabase
      .from("seasons")
      .select("id")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pokemon")
      .select("*, pokemon_moves(important_moves(id, name, slug))")
      .order("point_value", { ascending: false })
      .order("name"),
    supabase.from("rosters").select("pokemon_id, conference_id, season_id"),
    supabase.auth.getUser(),
  ]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const pokemon: PokemonWithMoves[] = (rawPokemon ?? []).map((p: any) => ({
    ...p,
    moves: (p.pokemon_moves ?? [])
      .map((pm: any) => pm.important_moves)
      .filter(Boolean),
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Determine user's conference if logged in
  let userConferenceId: number | null = null;
  const user = authData?.user;
  if (user) {
    const discordUsername =
      (user.user_metadata?.user_name as string | undefined) ||
      (user.user_metadata?.full_name as string | undefined);
    if (discordUsername) {
      const { data: membership } = await supabase
        .from("team_members")
        .select("teams(conference_id)")
        .ilike("discord_id", discordUsername)
        .limit(1)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userConferenceId = (membership?.teams as any)?.conference_id ?? null;
    }
  }

  // Build initial drafted pokemon per conference for the active season
  const activeSeasonId = activeSeason?.id ?? null;
  const draftedByConference = (conferences ?? []).map((conf) => ({
    conferenceId: conf.id,
    pokemonIds: (rosters ?? [])
      .filter(
        (r) => r.conference_id === conf.id && r.season_id === activeSeasonId
      )
      .map((r) => r.pokemon_id),
  }));

  return (
    <DraftBoard
      conferences={conferences ?? []}
      pokemon={pokemon}
      activeSeasonId={activeSeasonId}
      draftedByConference={draftedByConference}
      userConferenceId={userConferenceId}
    />
  );
}
