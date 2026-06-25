import { createClient } from "@/lib/supabase/server";
import MyTeamView from "./MyTeamView";

export const metadata = { title: "My Team | Titan PDL" };

function NotLoggedIn() {
  return (
    <main className="min-h-screen bg-[#0a0a1a] pt-24 flex items-start justify-center px-6">
      <p className="text-gray-500 mt-8">Please log in with Discord to view your team.</p>
    </main>
  );
}

function NoTeam({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-[#0a0a1a] pt-24 flex items-start justify-center px-6">
      <p className="text-gray-500 mt-8">{message}</p>
    </main>
  );
}

export default async function MyTeamPage() {
  const supabase = await createClient();

  const { data: authData } = await supabase.auth.getUser();
  const user = authData?.user;

  if (!user) return <NotLoggedIn />;

  const discordUsername =
    (user.user_metadata?.user_name as string | undefined) ||
    (user.user_metadata?.full_name as string | undefined);

  if (!discordUsername) return <NotLoggedIn />;

  // Active season
  const { data: activeSeason } = await supabase
    .from("seasons")
    .select("id, name")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!activeSeason) return <NoTeam message="No active season found." />;

  // User's team membership for this season
  const { data: membership } = await supabase
    .from("team_members")
    .select("team_id")
    .ilike("discord_id", discordUsername)
    .eq("season_id", activeSeason.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return <NoTeam message="You are not on a team this season." />;

  const teamId = membership.team_id;

  // Parallel fetch: team info, roster, matches+games, pokemon stats, team record
  const [
    { data: teamData },
    { data: rawRoster },
    { data: rawMatches },
    { data: pokemonStats },
    { data: teamRecord },
  ] = await Promise.all([
    supabase
      .from("teams")
      .select("id, team_name, logo_url")
      .eq("id", teamId)
      .single(),

    supabase
      .from("rosters")
      .select("pokemon_id, pokemon(id, dex_number, name, type_1, type_2, ability_1, ability_2, hidden_ability, hp, atk, def, spa, spd, spe, point_value)")
      .eq("team_id", teamId)
      .eq("season_id", activeSeason.id)
      .order("pokemon_id"),

    supabase
      .from("matches")
      .select("id, week_number, home_team_id, away_team_id, played_at, match_games(id, game_number, winner_team_id)")
      .eq("season_id", activeSeason.id)
      .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`)
      .order("week_number"),

    supabase
      .from("pokemon_season_stats")
      .select("pokemon_id, brought, kills, deaths")
      .eq("team_id", teamId)
      .eq("season_id", activeSeason.id),

    supabase
      .from("team_records")
      .select("wins, losses")
      .eq("team_id", teamId)
      .eq("season_id", activeSeason.id)
      .maybeSingle(),
  ]);

  // Collect opponent team IDs and fetch them in one query
  const opponentIds = new Set<number>();
  for (const m of rawMatches ?? []) {
    const match = m as { home_team_id: number; away_team_id: number };
    if (match.home_team_id !== teamId) opponentIds.add(match.home_team_id);
    if (match.away_team_id !== teamId) opponentIds.add(match.away_team_id);
  }

  const teamsMap: Record<number, { id: number; team_name: string; logo_url: string | null }> = {};
  if (opponentIds.size > 0) {
    const { data: opponentTeams } = await supabase
      .from("teams")
      .select("id, team_name, logo_url")
      .in("id", [...opponentIds]);
    for (const t of opponentTeams ?? []) {
      teamsMap[t.id] = t;
    }
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */

  // Build roster array
  const roster = (rawRoster ?? [])
    .map((r: any) => r.pokemon)
    .filter(Boolean);

  // Compute total individual games played by the team from the schedule data
  const totalGamesPlayed = (rawMatches ?? []).reduce(
    (sum: number, m: any) => sum + ((m.match_games as any[])?.length ?? 0),
    0
  );

  // Build schedule entries
  const schedule = (rawMatches ?? []).map((m: any) => {
    const isHome = m.home_team_id === teamId;
    const opponentId: number = isHome ? m.away_team_id : m.home_team_id;
    const games: any[] = m.match_games ?? [];
    const myGamesWon = games.filter((g) => g.winner_team_id === teamId).length;
    const oppGamesWon = games.filter(
      (g) => g.winner_team_id !== null && g.winner_team_id !== teamId
    ).length;
    return {
      id: m.id as number,
      week_number: m.week_number as number,
      played_at: m.played_at as string | null,
      is_home: isHome,
      opponent: teamsMap[opponentId] ?? {
        id: opponentId,
        team_name: "TBD",
        logo_url: null,
      },
      my_games_won: myGamesWon,
      opp_games_won: oppGamesWon,
      total_games: games.length,
    };
  });

  /* eslint-enable @typescript-eslint/no-explicit-any */

  return (
    <MyTeamView
      team={teamData!}
      teamId={teamId}
      roster={roster}
      schedule={schedule}
      pokemonStats={pokemonStats ?? []}
      totalGamesPlayed={totalGamesPlayed}
      record={{ wins: teamRecord?.wins ?? 0, losses: teamRecord?.losses ?? 0 }}
    />
  );
}
