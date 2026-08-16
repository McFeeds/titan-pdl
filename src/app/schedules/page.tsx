import { createClient } from "@/lib/supabase/server";
import { getMatchComponents, recordFromComponents } from "@/lib/matchRecord";
import SchedulesView from "./SchedulesView";
import type { MatchupEntry, PokemonBasic, ReplayLink } from "./types";

export const metadata = { title: "Schedules | Titan PDL" };

export default async function SchedulesPage() {
  const supabase = await createClient();

  const [
    { data: conferences },
    { data: activeSeason },
    { data: authData },
  ] = await Promise.all([
    supabase.from("conferences").select("id, name").order("name"),
    supabase.from("seasons").select("id, name, match_format").eq("is_active", true).limit(1).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  // Determine logged-in user's conference (same pattern as draft-pools)
  let userConferenceId: number | null = null;
  const user = authData?.user;
  if (user && activeSeason) {
    const discordUsername =
      (user.user_metadata?.user_name as string | undefined) ||
      (user.user_metadata?.full_name as string | undefined);
    if (discordUsername) {
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
          .select("conference_id")
          .eq("team_id", membership.team_id)
          .eq("season_id", activeSeason.id)
          .maybeSingle();
        userConferenceId = placement?.conference_id ?? null;
      }
    }
  }

  if (!activeSeason) {
    return (
      <SchedulesView conferences={conferences ?? []} userConferenceId={null} matchups={[]} />
    );
  }

  const [
    { data: rawMatches },
    { data: rawRosters },
    { data: teamSeasons },
    { data: teams },
  ] = await Promise.all([
    // Deep fetch: matches → match_games → match_game_pokemon → pokemon
    supabase
      .from("matches")
      .select(`
        id, week_number, home_team_id, away_team_id, played_at,
        match_games(
          id, game_number, game_type, winner_team_id, replay_url,
          match_game_pokemon(team_id, pokemon_id, pokemon(id, dex_number, name))
        )
      `)
      .eq("season_id", activeSeason.id)
      .order("week_number"),

    // Rosters with pokemon for unplayed match previews
    supabase
      .from("rosters")
      .select("team_id, conference_id, pokemon(id, dex_number, name)")
      .eq("season_id", activeSeason.id),

    supabase
      .from("team_seasons")
      .select("team_id, conference_id")
      .eq("season_id", activeSeason.id),

    supabase.from("teams").select("id, team_name, logo_url"),
  ]);

  /* eslint-disable @typescript-eslint/no-explicit-any */

  const teamMap = new Map((teams ?? []).map((t: any) => [t.id, t]));
  const teamConfMap = new Map((teamSeasons ?? []).map((ts: any) => [ts.team_id, ts.conference_id]));

  // Build roster map: team_id → PokemonBasic[]
  const rosterMap = new Map<number, PokemonBasic[]>();
  for (const r of (rawRosters ?? []) as any[]) {
    if (!r.pokemon) continue;
    if (!rosterMap.has(r.team_id)) rosterMap.set(r.team_id, []);
    rosterMap.get(r.team_id)!.push(r.pokemon as PokemonBasic);
  }

  const matchFormat = activeSeason.match_format;

  // Compute season W/L records from all completed matches (format-aware —
  // see src/lib/matchRecord.ts).
  const teamRecords: Record<number, { wins: number; losses: number }> = {};
  function ensureRecord(id: number) {
    if (!teamRecords[id]) teamRecords[id] = { wins: 0, losses: 0 };
  }
  for (const m of (rawMatches ?? []) as any[]) {
    const games: any[] = m.match_games ?? [];
    const components = getMatchComponents(games, matchFormat, m.home_team_id);
    const { homeWins, homeLosses, awayWins, awayLosses } = recordFromComponents(components);
    if (homeWins || homeLosses || awayWins || awayLosses) {
      ensureRecord(m.home_team_id);
      ensureRecord(m.away_team_id);
      teamRecords[m.home_team_id].wins += homeWins;
      teamRecords[m.home_team_id].losses += homeLosses;
      teamRecords[m.away_team_id].wins += awayWins;
      teamRecords[m.away_team_id].losses += awayLosses;
    }
  }

  // Aggregate unique pokemon brought by a team across all games in a match
  function getBroughtPokemon(games: any[], teamId: number): PokemonBasic[] {
    const seen = new Set<number>();
    const result: PokemonBasic[] = [];
    for (const game of games) {
      for (const mgp of (game.match_game_pokemon ?? []) as any[]) {
        if (mgp.team_id === teamId && mgp.pokemon && !seen.has(mgp.pokemon_id)) {
          seen.add(mgp.pokemon_id);
          result.push(mgp.pokemon as PokemonBasic);
        }
      }
    }
    return result;
  }

  const matchups: MatchupEntry[] = ((rawMatches ?? []) as any[]).map((m) => {
    const games: any[] = m.match_games ?? [];
    const components = getMatchComponents(games, matchFormat, m.home_team_id);
    const decided = components.every((c) => c.decided);
    const hasGames = games.length > 0;

    // bo3: the score shown is the raw doubles-series game tally (e.g. 2-1).
    // singles_doubles: the score shown is the combined win-unit count (0-2) —
    // singles win + doubles win are each worth one point, per the chosen
    // "combined score" display.
    let homeScore: number;
    let awayScore: number;
    if (matchFormat === "bo3") {
      homeScore = components[0].gamesWon.home;
      awayScore = components[0].gamesWon.away;
    } else {
      const rec = recordFromComponents(components);
      homeScore = rec.homeWins;
      awayScore = rec.awayWins;
    }

    const baseHome = teamMap.get(m.home_team_id) ?? { id: m.home_team_id, team_name: "TBD", logo_url: null };
    const baseAway = teamMap.get(m.away_team_id) ?? { id: m.away_team_id, team_name: "TBD", logo_url: null };
    const homeRecord = teamRecords[m.home_team_id] ?? { wins: 0, losses: 0 };
    const awayRecord = teamRecords[m.away_team_id] ?? { wins: 0, losses: 0 };

    const replayLinks: ReplayLink[] = games
      .filter((g) => g.replay_url)
      .sort((a, b) => a.game_number - b.game_number)
      .map((g) => ({ game_type: g.game_type as "singles" | "doubles", game_number: g.game_number as number, url: g.replay_url as string }));

    // Singles/doubles breakdown for the "View Match" panel.
    const componentBreakdown = matchFormat === "singles_doubles"
      ? components.map((c) => ({
          label: c.type === "singles" ? "Singles" : "Doubles",
          winnerTeamName: c.decided
            ? (c.winner === "home" ? baseHome.team_name : baseAway.team_name)
            : null,
        }))
      : [];

    // Show brought pokemon for played matches, drafted roster for upcoming
    const homePokemon = hasGames
      ? getBroughtPokemon(games, m.home_team_id)
      : (rosterMap.get(m.home_team_id) ?? []).slice(0, 6);
    const awayPokemon = hasGames
      ? getBroughtPokemon(games, m.away_team_id)
      : (rosterMap.get(m.away_team_id) ?? []).slice(0, 6);

    return {
      id: m.id as number,
      week_number: m.week_number as number,
      conference_id: (teamConfMap.get(m.home_team_id) ?? null) as number | null,
      match_format: matchFormat,
      home_team: { ...baseHome, wins: homeRecord.wins, losses: homeRecord.losses },
      away_team: { ...baseAway, wins: awayRecord.wins, losses: awayRecord.losses },
      home_games_won: homeScore,
      away_games_won: awayScore,
      decided,
      total_games: games.length,
      played_at: m.played_at as string | null,
      replay_links: replayLinks,
      component_breakdown: componentBreakdown,
      home_pokemon: homePokemon,
      away_pokemon: awayPokemon,
    };
  });

  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <SchedulesView
      conferences={conferences ?? []}
      userConferenceId={userConferenceId}
      matchups={matchups}
    />
  );
}
