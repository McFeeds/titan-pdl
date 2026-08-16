import { createClient } from "@/lib/supabase/server";
import { getMatchComponents, recordFromComponents } from "@/lib/matchRecord";
import UnderConstruction from "@/components/UnderConstruction";
import StandingsView from "./StandingsView";
import type { ConferenceStandings, TeamStanding } from "./types";

export const metadata = { title: "Standings | Titan PDL" };

export default async function StandingsPage() {
  const supabase = await createClient();

  const [{ data: activeSeason }, { data: conferences }, { data: groups }] = await Promise.all([
    supabase.from("seasons").select("id, name, match_format").eq("is_active", true).limit(1).maybeSingle(),
    supabase.from("conferences").select("id, name").order("name"),
    supabase.from("groups").select("id, name, conference_id").order("name"),
  ]);

  if (!activeSeason) {
    return <UnderConstruction title="Current League" />;
  }

  const [{ data: rawMatches }, { data: teamSeasons }, { data: teams }] = await Promise.all([
    supabase
      .from("matches")
      .select("id, home_team_id, away_team_id, match_games(game_number, game_type, winner_team_id)")
      .eq("season_id", activeSeason.id),
    supabase
      .from("team_seasons")
      .select("team_id, conference_id, group_id")
      .eq("season_id", activeSeason.id),
    supabase.from("teams").select("id, team_name, logo_url"),
  ]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const teamMap = new Map((teams ?? []).map((t: any) => [t.id, t]));
  const matchFormat = activeSeason.match_format;

  // Season W/L per team (format-aware — see src/lib/matchRecord.ts), same
  // computation used on the Schedules page. Alongside it, +/- tallies every
  // individual game played (not match-level wins) regardless of format —
  // e.g. 1-0 singles + 1-2 doubles is a 1-1 match record but a 2-2 (0) game
  // differential — so it's accumulated directly from match_games rather
  // than from the win/loss components above.
  const teamRecords: Record<number, { wins: number; losses: number }> = {};
  const teamGameDiff: Record<number, number> = {};
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

    for (const g of games) {
      if (g.winner_team_id === m.home_team_id) {
        teamGameDiff[m.home_team_id] = (teamGameDiff[m.home_team_id] ?? 0) + 1;
        teamGameDiff[m.away_team_id] = (teamGameDiff[m.away_team_id] ?? 0) - 1;
      } else if (g.winner_team_id === m.away_team_id) {
        teamGameDiff[m.away_team_id] = (teamGameDiff[m.away_team_id] ?? 0) + 1;
        teamGameDiff[m.home_team_id] = (teamGameDiff[m.home_team_id] ?? 0) - 1;
      }
    }
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  function buildRow(teamId: number): TeamStanding {
    const team = teamMap.get(teamId);
    const record = teamRecords[teamId] ?? { wins: 0, losses: 0 };
    return {
      id: teamId,
      team_name: team?.team_name ?? `Team #${teamId}`,
      logo_url: team?.logo_url ?? null,
      wins: record.wins,
      losses: record.losses,
      plusMinus: teamGameDiff[teamId] ?? 0,
    };
  }

  function sortTeams(rows: TeamStanding[]): TeamStanding[] {
    return [...rows].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (a.losses !== b.losses) return a.losses - b.losses;
      if (b.plusMinus !== a.plusMinus) return b.plusMinus - a.plusMinus;
      return a.team_name.localeCompare(b.team_name);
    });
  }

  const standings: ConferenceStandings[] = (conferences ?? []).map((conf) => {
    const confGroups = (groups ?? []).filter((g) => g.conference_id === conf.id);

    const groupStandings = confGroups.map((g) => ({
      id: g.id,
      name: g.name,
      teams: sortTeams(
        (teamSeasons ?? [])
          .filter((ts) => ts.conference_id === conf.id && ts.group_id === g.id)
          .map((ts) => buildRow(ts.team_id))
      ),
    }));

    // Teams placed in this conference with no group assigned
    const ungroupedTeams = sortTeams(
      (teamSeasons ?? [])
        .filter((ts) => ts.conference_id === conf.id && !ts.group_id)
        .map((ts) => buildRow(ts.team_id))
    );

    const allGroups = ungroupedTeams.length > 0
      ? [...groupStandings, { id: -1, name: "Ungrouped", teams: ungroupedTeams }]
      : groupStandings;

    return { id: conf.id, name: conf.name, groups: allGroups };
  });

  return <StandingsView standings={standings} />;
}
