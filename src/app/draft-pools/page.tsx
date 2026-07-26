import { createClient } from "@/lib/supabase/server";
import DraftBoard from "./DraftBoard";
import type { PokemonWithMoves } from "@/types/database";

export const metadata = { title: "Draft Pools | Titan PDL" };

export default async function DraftPoolsPage() {
  const supabase = await createClient();

  // Fire every independent query in one batch — none of these depend on
  // each other, so running them as a waterfall was pure wasted latency.
  const [
    { data: conferences },
    { data: activeSeason },
    { data: rawPokemon },
    { data: rosters },
    { data: teamSeasons },
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
    supabase.from("rosters").select("pokemon_id, conference_id, season_id, team_id"),
    supabase
      .from("team_seasons")
      .select("team_id, conference_id, draft_position, season_id, teams(team_name)")
      .order("draft_position"),
    supabase.auth.getUser(),
  ]);

  const activeSeasonId = activeSeason?.id ?? null;

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
        .select("team_id")
        .ilike("discord_id", discordUsername)
        .limit(1)
        .maybeSingle();

      if (membership?.team_id && activeSeason?.id) {
        const { data: placement } = await supabase
          .from("team_seasons")
          .select("conference_id")
          .eq("team_id", membership.team_id)
          .eq("season_id", activeSeason.id)
          .maybeSingle();
        userConferenceId = placement?.conference_id ?? null;
      }
    }
  }

  // Build initial drafted pokemon per conference for the active season
  const draftedByConference = (conferences ?? []).map((conf) => ({
    conferenceId: conf.id,
    pokemonIds: (rosters ?? [])
      .filter(
        (r) => r.conference_id === conf.id && r.season_id === activeSeasonId
      )
      .map((r) => r.pokemon_id),
  }));

  // Build per-team draft order + current roster for the active season
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const teams = (teamSeasons ?? [])
    .filter((ts: any) => ts.season_id === activeSeasonId)
    .map((ts: any) => {
      const teamRow = Array.isArray(ts.teams) ? ts.teams[0] : ts.teams;
      return {
        id: ts.team_id as number,
        name: (teamRow?.team_name as string | undefined) ?? `Team #${ts.team_id}`,
        conferenceId: ts.conference_id as number,
        draftPosition: ts.draft_position as number | null,
        pokemonIds: (rosters ?? [])
          .filter((r) => r.team_id === ts.team_id && r.season_id === activeSeasonId)
          .map((r) => r.pokemon_id),
      };
    })
    .sort((a, b) => (a.draftPosition ?? 999) - (b.draftPosition ?? 999));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <DraftBoard
      conferences={conferences ?? []}
      pokemon={pokemon}
      activeSeasonId={activeSeasonId}
      draftedByConference={draftedByConference}
      userConferenceId={userConferenceId}
      teams={teams}
    />
  );
}
