import { createClient } from "@/lib/supabase/server";
import SchedulesView from "./SchedulesView";

export const metadata = { title: "Schedules | Titan PDL" };

export default async function SchedulesPage() {
  const supabase = await createClient();

  const [
    { data: conferences },
    { data: activeSeason },
    { data: authData },
  ] = await Promise.all([
    supabase.from("conferences").select("id, name").order("name"),
    supabase.from("seasons").select("id, name").eq("is_active", true).limit(1).maybeSingle(),
    supabase.auth.getUser(),
  ]);

  // Determine the logged-in user's conference (same pattern as draft-pools)
  let userConferenceId: number | null = null;
  const user = authData?.user;
  if (user && activeSeason) {
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
      <SchedulesView
        conferences={conferences ?? []}
        userConferenceId={null}
        matchups={[]}
      />
    );
  }

  const [
    { data: rawMatches },
    { data: teamSeasons },
    { data: teams },
  ] = await Promise.all([
    supabase
      .from("matches")
      .select("id, week_number, home_team_id, away_team_id, played_at, match_games(game_number, winner_team_id)")
      .eq("season_id", activeSeason.id)
      .order("week_number"),
    supabase
      .from("team_seasons")
      .select("team_id, conference_id")
      .eq("season_id", activeSeason.id),
    supabase
      .from("teams")
      .select("id, team_name, logo_url"),
  ]);

  /* eslint-disable @typescript-eslint/no-explicit-any */

  const teamMap = new Map((teams ?? []).map((t) => [t.id, t]));
  const teamConfMap = new Map((teamSeasons ?? []).map((ts) => [ts.team_id, ts.conference_id]));

  const matchups = (rawMatches ?? []).map((m: any) => {
    const games: any[] = m.match_games ?? [];
    const homeGamesWon = games.filter((g) => g.winner_team_id === m.home_team_id).length;
    const awayGamesWon = games.filter(
      (g) => g.winner_team_id !== null && g.winner_team_id !== m.home_team_id
    ).length;
    return {
      id: m.id as number,
      week_number: m.week_number as number,
      conference_id: (teamConfMap.get(m.home_team_id) ?? null) as number | null,
      home_team: teamMap.get(m.home_team_id) ?? { id: m.home_team_id, team_name: "TBD", logo_url: null },
      away_team: teamMap.get(m.away_team_id) ?? { id: m.away_team_id, team_name: "TBD", logo_url: null },
      home_games_won: homeGamesWon,
      away_games_won: awayGamesWon,
      total_games: games.length,
      played_at: m.played_at as string | null,
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
