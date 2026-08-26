import type { MatchFormat, GameType } from "@/types/database";

export interface PokemonBasic {
  id: number;
  dex_number: number | null;
  name: string;
}

export interface TeamInfo {
  id: number;
  team_name: string;
  logo_url: string | null;
  coaches: string[];
  wins: number;
  losses: number;
}

export interface ReplayLink {
  game_type: GameType;
  game_number: number;
  url: string;
}

export interface ComponentResult {
  label: string;
  winnerTeamName: string | null;
}

export interface MatchupEntry {
  id: number;
  week_number: number;
  conference_id: number | null;
  match_format: MatchFormat;
  home_team: TeamInfo;
  away_team: TeamInfo;
  // Score shown on the card: raw doubles-series game tally for 'bo3', or
  // combined singles+doubles win-unit count (0-2) for 'singles_doubles'.
  home_games_won: number;
  away_games_won: number;
  decided: boolean;
  total_games: number;
  played_at: string | null;
  replay_links: ReplayLink[];
  component_breakdown: ComponentResult[];
  home_pokemon: PokemonBasic[];
  away_pokemon: PokemonBasic[];
}
