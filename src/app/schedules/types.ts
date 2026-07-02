export interface PokemonBasic {
  id: number;
  dex_number: number | null;
  name: string;
}

export interface TeamInfo {
  id: number;
  team_name: string;
  logo_url: string | null;
  wins: number;
  losses: number;
}

export interface ReplayLink {
  game_number: number;
  url: string;
}

export interface MatchupEntry {
  id: number;
  week_number: number;
  conference_id: number | null;
  home_team: TeamInfo;
  away_team: TeamInfo;
  home_games_won: number;
  away_games_won: number;
  total_games: number;
  played_at: string | null;
  replay_links: ReplayLink[];
  home_pokemon: PokemonBasic[];
  away_pokemon: PokemonBasic[];
}
