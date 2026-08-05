import { createClient } from "@/lib/supabase/server";
import { computeOnClockTeamId } from "@/lib/draft";
import type { RosterPokemon } from "@/types/database";
import MyTeamView, { type DraftMode } from "./MyTeamView";

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
    .select("id, name, point_budget, fa_tokens")
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

  // Parallel fetch: team info, roster, matches+games, pokemon stats, this
  // team's conference placement, the full pokemon list, and FA token usage.
  const [
    { data: teamData },
    { data: rawRoster },
    { data: rawMatches },
    { data: pokemonStats },
    { data: teamSeason },
    { data: allPokemon },
    { data: transactions },
    { data: transactionItems },
  ] = await Promise.all([
    supabase
      .from("teams")
      .select("id, team_name, logo_url")
      .eq("id", teamId)
      .single(),

    supabase
      .from("rosters")
      .select("pokemon_id, nickname, pokemon(id, dex_number, name, type_1, type_2, ability_1, ability_2, hidden_ability, hp, atk, def, spa, spd, spe, point_value)")
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
      .from("team_seasons")
      .select("conference_id, draft_position, draft_ended_at, fa_tokens_adjustment")
      .eq("team_id", teamId)
      .eq("season_id", activeSeason.id)
      .maybeSingle(),

    supabase
      .from("pokemon")
      .select("id, name, dex_number, type_1, type_2, point_value")
      .order("name"),

    supabase.from("transactions").select("id, season_id, type"),
    supabase.from("transaction_items").select("transaction_id, team_id, action, pokemon_id"),
  ]);

  // Conference-scoped data (draft state, roster-wide pokemon, team count)
  // needs the conference_id resolved above, so it's a second phase.
  const conferenceId = teamSeason?.conference_id ?? null;
  const [
    { data: draftState },
    { data: conferenceRosters },
    { data: conferenceTeamSeasons },
    { data: draftLog },
  ] = conferenceId
    ? await Promise.all([
        supabase
          .from("conference_drafts")
          .select("is_active, started_at")
          .eq("season_id", activeSeason.id)
          .eq("conference_id", conferenceId)
          .maybeSingle(),
        supabase
          .from("rosters")
          .select("pokemon_id")
          .eq("season_id", activeSeason.id)
          .eq("conference_id", conferenceId),
        supabase
          .from("team_seasons")
          .select("team_id, draft_position, draft_ended_at")
          .eq("season_id", activeSeason.id)
          .eq("conference_id", conferenceId),
        supabase
          .from("draft_log")
          .select("team_id")
          .eq("season_id", activeSeason.id)
          .eq("conference_id", conferenceId),
      ])
    : [{ data: null }, { data: null }, { data: null }, { data: null }];

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

  // Build roster array, merging nickname from the roster row onto the pokemon
  const roster: RosterPokemon[] = (rawRoster ?? [])
    .map((r: any) => r.pokemon ? { ...r.pokemon, nickname: r.nickname ?? null } : null)
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

  // Draft mode: never started -> locked, active -> drafting, ended -> free agency
  let draftMode: DraftMode = "pre_draft";
  if (draftState?.is_active) draftMode = "drafting";
  else if (draftState?.started_at) draftMode = "free_agency";

  // Undrafted pokemon in this team's conference, for the add picker — also
  // excludes anything this team has already dropped this season, since
  // they're not allowed to pick it back up.
  const rosteredIds = new Set((conferenceRosters ?? []).map((r) => r.pokemon_id));
  const seasonFreeAgencyTxIds = new Set(
    (transactions ?? [])
      .filter((t) => t.season_id === activeSeason.id && t.type === "free_agency")
      .map((t) => t.id)
  );
  const droppedByMeIds = new Set(
    (transactionItems ?? [])
      .filter(
        (item) =>
          item.team_id === teamId && item.action === "drop" && seasonFreeAgencyTxIds.has(item.transaction_id)
      )
      .map((item) => item.pokemon_id)
  );
  const undraftedPokemon = (allPokemon ?? []).filter(
    (p) => !rosteredIds.has(p.id) && !droppedByMeIds.has(p.id)
  );

  // Whether this team is currently on the clock (drafting mode only) —
  // uses the same skip-aware turn math as the public draft board, so a
  // team that ended early is correctly never shown as on the clock.
  let isOnClock = false;
  if (draftMode === "drafting" && conferenceTeamSeasons) {
    const picksMadeByTeam = new Map<number, number>();
    for (const row of draftLog ?? []) {
      picksMadeByTeam.set(row.team_id, (picksMadeByTeam.get(row.team_id) ?? 0) + 1);
    }
    const teamStates = conferenceTeamSeasons.map((ts) => ({
      id: ts.team_id,
      draftPosition: ts.draft_position,
      draftEnded: ts.draft_ended_at !== null,
      picksMade: picksMadeByTeam.get(ts.team_id) ?? 0,
    }));
    isOnClock = computeOnClockTeamId(teamStates) === teamId;
  }

  const myDraftEnded = teamSeason?.draft_ended_at !== null && teamSeason?.draft_ended_at !== undefined;

  // FA tokens used so far this season, and the effective limit — season
  // default plus any admin correction (team_seasons.fa_tokens_adjustment).
  const faTokensUsed = (transactionItems ?? []).filter(
    (item) => item.team_id === teamId && item.action === "add" && seasonFreeAgencyTxIds.has(item.transaction_id)
  ).length;
  const faTokens = activeSeason.fa_tokens + (teamSeason?.fa_tokens_adjustment ?? 0);

  const pointsSpent = roster.reduce((sum, p) => sum + p.point_value, 0);

  return (
    <MyTeamView
      team={teamData!}
      teamId={teamId}
      seasonId={activeSeason.id}
      roster={roster}
      schedule={schedule}
      pokemonStats={pokemonStats ?? []}
      totalGamesPlayed={totalGamesPlayed}
      record={{
          wins: schedule.filter((e) => e.my_games_won >= 2).length,
          losses: schedule.filter((e) => e.opp_games_won >= 2).length,
        }}
      draftMode={draftMode}
      isOnClock={isOnClock}
      myDraftEnded={myDraftEnded}
      pointBudget={activeSeason.point_budget}
      pointsSpent={pointsSpent}
      faTokens={faTokens}
      faTokensUsed={faTokensUsed}
      undraftedPokemon={undraftedPokemon ?? []}
    />
  );
}
