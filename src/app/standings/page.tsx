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

  const [{ data: rawMatches }, { data: teamSeasons }, { data: teams }, { data: teamMembers }] = await Promise.all([
    supabase
      .from("matches")
      .select("id, home_team_id, away_team_id, match_games(game_number, game_type, winner_team_id)")
      .eq("season_id", activeSeason.id),
    supabase
      .from("team_seasons")
      .select("team_id, conference_id, group_id")
      .eq("season_id", activeSeason.id),
    supabase.from("teams").select("id, team_name, logo_url"),
    supabase
      .from("team_members")
      .select("team_id, discord_id")
      .eq("season_id", activeSeason.id)
      .order("discord_id"),
  ]);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const teamMap = new Map((teams ?? []).map((t: any) => [t.id, t]));
  const matchFormat = activeSeason.match_format;

  // Coaches/owners shown under the team name — one entry per team_members
  // row for that season.
  const coachesByTeam = new Map<number, string[]>();
  for (const m of teamMembers ?? []) {
    const list = coachesByTeam.get(m.team_id) ?? [];
    list.push(m.discord_id);
    coachesByTeam.set(m.team_id, list);
  }

  // Season W/L per team (format-aware — see src/lib/matchRecord.ts), same
  // computation used on the Schedules page. Alongside it, +/- tallies every
  // individual game played (not match-level wins) regardless of format —
  // e.g. 1-0 singles + 1-2 doubles is a 1-1 match record but a 2-2 (0) game
  // differential — so it's accumulated directly from match_games rather
  // than from the win/loss components above.
  const teamRecords: Record<number, { wins: number; losses: number }> = {};
  const teamGameDiff: Record<number, number> = {};
  // a's record specifically against b, summed over every match between
  // exactly that pair — the basis for the head-to-head tiebreaker below.
  const headToHead: Record<number, Record<number, { wins: number; losses: number }>> = {};
  function ensureRecord(id: number) {
    if (!teamRecords[id]) teamRecords[id] = { wins: 0, losses: 0 };
  }
  function addH2H(a: number, b: number, wins: number, losses: number) {
    if (!wins && !losses) return;
    if (!headToHead[a]) headToHead[a] = {};
    if (!headToHead[a][b]) headToHead[a][b] = { wins: 0, losses: 0 };
    headToHead[a][b].wins += wins;
    headToHead[a][b].losses += losses;
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
      addH2H(m.home_team_id, m.away_team_id, homeWins, homeLosses);
      addH2H(m.away_team_id, m.home_team_id, awayWins, awayLosses);
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

  function getH2H(a: number, b: number): { wins: number; losses: number } {
    return headToHead[a]?.[b] ?? { wins: 0, losses: 0 };
  }

  // Final fallback once neither overall record nor head-to-head separates a
  // group: game +/- (see plusMinus above), then team name for a fully
  // deterministic order.
  function rankByPlusMinus(rows: TeamStanding[]): TeamStanding[] {
    return [...rows].sort((a, b) => {
      if (b.plusMinus !== a.plusMinus) return b.plusMinus - a.plusMinus;
      return a.team_name.localeCompare(b.team_name);
    });
  }

  // Ranks a set of teams already tied on overall record, by head-to-head
  // record computed only among these teams. Any teams that remain tied on
  // that head-to-head record — including the "circle of suck" case (A beat
  // B, B beat C, C beat A, so all three end up an identical 1-1 against
  // each other) where it doesn't separate anyone at all — fall through to
  // the +/- tiebreaker instead.
  function rankTiedGroup(rows: TeamStanding[]): TeamStanding[] {
    if (rows.length <= 1) return rows;

    const ids = rows.map((r) => r.id);
    const withH2H = rows.map((r) => {
      let wins = 0;
      let losses = 0;
      for (const otherId of ids) {
        if (otherId === r.id) continue;
        const h2h = getH2H(r.id, otherId);
        wins += h2h.wins;
        losses += h2h.losses;
      }
      return { row: r, h2hWins: wins, h2hLosses: losses };
    });

    withH2H.sort((a, b) => {
      if (b.h2hWins !== a.h2hWins) return b.h2hWins - a.h2hWins;
      return a.h2hLosses - b.h2hLosses;
    });

    // Cluster consecutive entries with an identical head-to-head record —
    // still tied by this measure, so that cluster needs the next tiebreaker.
    const result: TeamStanding[] = [];
    let i = 0;
    while (i < withH2H.length) {
      let j = i + 1;
      while (
        j < withH2H.length &&
        withH2H[j].h2hWins === withH2H[i].h2hWins &&
        withH2H[j].h2hLosses === withH2H[i].h2hLosses
      ) {
        j++;
      }
      const cluster = withH2H.slice(i, j).map((x) => x.row);
      result.push(...(cluster.length === 1 ? cluster : rankByPlusMinus(cluster)));
      i = j;
    }
    return result;
  }

  function buildRow(teamId: number): TeamStanding {
    const team = teamMap.get(teamId);
    const record = teamRecords[teamId] ?? { wins: 0, losses: 0 };
    return {
      id: teamId,
      team_name: team?.team_name ?? `Team #${teamId}`,
      logo_url: team?.logo_url ?? null,
      coaches: coachesByTeam.get(teamId) ?? [],
      wins: record.wins,
      losses: record.losses,
      plusMinus: teamGameDiff[teamId] ?? 0,
    };
  }

  // Tiebreak order: 1) overall record, 2) head-to-head among whoever's
  // still tied, 3) game +/- (also the fallback when head-to-head can't
  // separate a tied group at all), 4) team name.
  function sortTeams(rows: TeamStanding[]): TeamStanding[] {
    const sorted = [...rows].sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      return a.losses - b.losses;
    });

    const result: TeamStanding[] = [];
    let i = 0;
    while (i < sorted.length) {
      let j = i + 1;
      while (j < sorted.length && sorted[j].wins === sorted[i].wins && sorted[j].losses === sorted[i].losses) {
        j++;
      }
      const group = sorted.slice(i, j);
      result.push(...(group.length === 1 ? group : rankTiedGroup(group)));
      i = j;
    }
    return result;
  }

  const standings: ConferenceStandings[] = (conferences ?? []).map((conf) => {
    const confGroups = (groups ?? []).filter((g) => g.conference_id === conf.id);

    const groupStandings = confGroups
      .map((g) => ({
        id: g.id,
        name: g.name,
        teams: sortTeams(
          (teamSeasons ?? [])
            .filter((ts) => ts.conference_id === conf.id && ts.group_id === g.id)
            .map((ts) => buildRow(ts.team_id))
        ),
      }))
      .filter((g) => g.teams.length > 0);

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
