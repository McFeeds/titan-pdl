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
    { data: draftLog },
    { data: draftPools },
    { data: transactions },
    { data: transactionItems },
  ] = await Promise.all([
    supabase.from("conferences").select("id, name").order("name"),
    supabase
      .from("seasons")
      .select("id, point_budget, fa_tokens")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("pokemon")
      .select("*, pokemon_moves(important_moves(id, name, slug))")
      .gt("point_value", 0) // banned pokemon (point_value = 0) never appear publicly
      .order("point_value", { ascending: false })
      .order("name"),
    supabase.from("rosters").select("pokemon_id, conference_id, season_id, team_id"),
    supabase
      .from("team_seasons")
      .select(
        "team_id, conference_id, draft_pool_id, draft_position, season_id, draft_ended_at, fa_tokens_adjustment, teams(team_name)"
      )
      .order("draft_position"),
    supabase.auth.getUser(),
    supabase.from("draft_log").select("id, season_id, draft_pool_id, team_id"),
    supabase.from("draft_pools").select("id, season_id, name, is_active, started_at"),
    supabase.from("transactions").select("id, season_id, type"),
    supabase.from("transaction_items").select("transaction_id, team_id, action, pokemon_id"),
  ]);

  const activeSeasonId = activeSeason?.id ?? null;
  const pointBudget = activeSeason?.point_budget ?? 115;
  const baseFaTokens = activeSeason?.fa_tokens ?? 3;

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const pokemon: PokemonWithMoves[] = (rawPokemon ?? []).map((p: any) => ({
    ...p,
    moves: (p.pokemon_moves ?? [])
      .map((pm: any) => pm.important_moves)
      .filter(Boolean),
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Determine user's team + conference + draft pool if logged in
  let userConferenceId: number | null = null;
  let userDraftPoolId: number | null = null;
  let userTeamId: number | null = null;
  const user = authData?.user;
  if (user) {
    const discordUsername =
      (user.user_metadata?.user_name as string | undefined) ||
      (user.user_metadata?.full_name as string | undefined);
    if (discordUsername && activeSeason?.id) {
      // Scoped to the active season — a player who changed teams between
      // seasons has one team_members row per season, and an unscoped
      // lookup could resolve to a stale team from a past season.
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id")
        .ilike("discord_id", discordUsername)
        .eq("season_id", activeSeason.id)
        .limit(1)
        .maybeSingle();

      if (membership?.team_id) {
        const { data: placement } = await supabase
          .from("team_seasons")
          .select("conference_id, draft_pool_id")
          .eq("team_id", membership.team_id)
          .eq("season_id", activeSeason.id)
          .maybeSingle();
        if (placement) {
          userConferenceId = placement.conference_id;
          userDraftPoolId = placement.draft_pool_id;
          userTeamId = membership.team_id;
        }
      }
    }
  }

  // Effective FA token limit for the viewer's own team — season default plus
  // any admin correction (team_seasons.fa_tokens_adjustment).
  const userFaTokensAdjustment =
    (teamSeasons ?? []).find(
      (ts) => ts.team_id === userTeamId && ts.season_id === activeSeasonId
    )?.fa_tokens_adjustment ?? 0;
  const faTokens = baseFaTokens + userFaTokensAdjustment;

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
        draftPoolId: ts.draft_pool_id as number | null,
        draftPosition: ts.draft_position as number | null,
        pokemonIds: (rosters ?? [])
          .filter((r) => r.team_id === ts.team_id && r.season_id === activeSeasonId)
          .map((r) => r.pokemon_id),
        draftEnded: ts.draft_ended_at !== null,
      };
    })
    .sort((a, b) => (a.draftPosition ?? 999) - (b.draftPosition ?? 999));
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // Picks logged so far this season, for turn-order tracking on the board
  const draftLogEntries = (draftLog ?? [])
    .filter((d) => d.season_id === activeSeasonId)
    .map((d) => ({ id: d.id, draftPoolId: d.draft_pool_id, teamId: d.team_id }));

  const seasonDraftPools = (draftPools ?? []).filter((p) => p.season_id === activeSeasonId);
  const pools = seasonDraftPools.map((p) => ({ id: p.id, name: p.name }));
  const draftActiveByPool = seasonDraftPools.map((p) => ({
    poolId: p.id,
    isActive: p.is_active,
    startedAt: p.started_at,
  }));

  // Free agency tokens used so far this season, per team
  const seasonTransactionIds = new Set(
    (transactions ?? [])
      .filter((t) => t.season_id === activeSeasonId && t.type === "free_agency")
      .map((t) => t.id)
  );
  const faTokensUsedByTeam: Record<number, number> = {};
  for (const item of transactionItems ?? []) {
    if (item.action !== "add" || !seasonTransactionIds.has(item.transaction_id)) continue;
    faTokensUsedByTeam[item.team_id] = (faTokensUsedByTeam[item.team_id] ?? 0) + 1;
  }

  // Pokemon the viewer's own team has dropped this season — they can't pick
  // these back up, so the pool tab can pre-emptively disable them.
  const droppedByUserTeam = (transactionItems ?? [])
    .filter(
      (item) =>
        item.team_id === userTeamId && item.action === "drop" && seasonTransactionIds.has(item.transaction_id)
    )
    .map((item) => item.pokemon_id);

  return (
    <DraftBoard
      conferences={conferences ?? []}
      pools={pools}
      pokemon={pokemon}
      activeSeasonId={activeSeasonId}
      draftedByConference={draftedByConference}
      userConferenceId={userConferenceId}
      userDraftPoolId={userDraftPoolId}
      userTeamId={userTeamId}
      teams={teams}
      draftLog={draftLogEntries}
      draftActiveByPool={draftActiveByPool}
      pointBudget={pointBudget}
      faTokens={faTokens}
      faTokensUsedByTeam={faTokensUsedByTeam}
      droppedByUserTeam={droppedByUserTeam}
    />
  );
}
