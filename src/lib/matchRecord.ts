// Shared win/loss rules for a weekly matchup — kept in one place so My Team,
// the Schedules page, and admin match entry can't drift out of sync on what
// "a win" means.
//
// 'bo3' (the default for every season unless opted out): the whole matchup
// is a single best-of-3 doubles series, decided once a team wins 2 games.
// 'singles_doubles' (used for one specific season): a matchup is two
// independent components — a Bo1 singles game and a Bo3 doubles series —
// each contributing its own win/loss.
import type { MatchFormat, GameType } from "@/types/database";

export interface RecordGame {
  game_type: GameType;
  winner_team_id: number | null;
}

export interface MatchComponent {
  type: GameType | "series";
  gamesWon: { home: number; away: number };
  decided: boolean;
  winner: "home" | "away" | null;
}

function seriesComponent(
  type: MatchComponent["type"],
  games: RecordGame[],
  homeTeamId: number,
  winThreshold: number
): MatchComponent {
  const homeWon = games.filter((g) => g.winner_team_id === homeTeamId).length;
  const awayWon = games.filter(
    (g) => g.winner_team_id !== null && g.winner_team_id !== homeTeamId
  ).length;
  const decided = homeWon >= winThreshold || awayWon >= winThreshold;
  return {
    type,
    gamesWon: { home: homeWon, away: awayWon },
    decided,
    winner: !decided ? null : homeWon >= winThreshold ? "home" : "away",
  };
}

export function getMatchComponents(
  games: RecordGame[],
  format: MatchFormat,
  homeTeamId: number
): MatchComponent[] {
  if (format === "bo3") {
    return [seriesComponent("series", games, homeTeamId, 2)];
  }

  const singles = games.filter((g) => g.game_type === "singles");
  const doubles = games.filter((g) => g.game_type === "doubles");
  return [
    seriesComponent("singles", singles, homeTeamId, 1),
    seriesComponent("doubles", doubles, homeTeamId, 2),
  ];
}

export function recordFromComponents(components: MatchComponent[]): {
  homeWins: number;
  homeLosses: number;
  awayWins: number;
  awayLosses: number;
} {
  let homeWins = 0, homeLosses = 0, awayWins = 0, awayLosses = 0;
  for (const c of components) {
    if (!c.decided) continue;
    if (c.winner === "home") { homeWins++; awayLosses++; }
    else { awayWins++; homeLosses++; }
  }
  return { homeWins, homeLosses, awayWins, awayLosses };
}
