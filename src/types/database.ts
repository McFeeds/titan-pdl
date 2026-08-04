// ============================================================
// Row types — one interface per table, matching column names exactly.
// ============================================================

export interface Season {
  id: number;
  name: string;
  is_active: boolean;
  point_budget: number;
  fa_tokens: number;
  created_at: string;
}

export interface Pokemon {
  id: number;
  dex_number: number | null;
  name: string;
  slug: string;
  type_1: string;
  type_2: string | null;
  ability_1: string;
  ability_2: string | null;
  hidden_ability: string | null;
  hp: number;
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
  point_value: number;
}

export interface ImportantMove {
  id: number;
  name: string;
  slug: string;
}

export interface PokemonMove {
  pokemon_id: number;
  move_id: number;
}

export interface Conference {
  id: number;
  name: string;
}

export interface Group {
  id: number;
  conference_id: number;
  name: string;
}

export interface Team {
  id: number;
  team_name: string;
  logo_url: string | null;
  created_at: string;
}

export interface TeamSeason {
  team_id: number;
  season_id: number;
  conference_id: number;
  group_id: number | null;
  draft_position: number | null;
}

export interface TeamMember {
  id: number;
  team_id: number;
  season_id: number;
  discord_id: string;
  showdown_name: string | null;
  role: "owner" | "co_owner" | "manager";
}

export interface Match {
  id: number;
  season_id: number;
  week_number: number;
  home_team_id: number;
  away_team_id: number;
  played_at: string | null;
}

export interface MatchGame {
  id: number;
  match_id: number;
  game_number: number;
  winner_team_id: number | null;
  replay_url: string | null;
}

export interface MatchGamePokemon {
  id: number;
  match_game_id: number;
  team_id: number;
  pokemon_id: number;
  kills: number;
  deaths: number;
}

export interface Roster {
  pokemon_id: number;
  conference_id: number;
  season_id: number;
  team_id: number;
  nickname: string | null;
}

export interface DraftLog {
  id: number;
  season_id: number;
  conference_id: number;
  pick_number: number;
  team_id: number;
  pokemon_id: number;
  created_at: string;
}

export interface ConferenceDraft {
  season_id: number;
  conference_id: number;
  is_active: boolean;
  started_at: string | null;
}

export interface Transaction {
  id: number;
  season_id: number;
  type: "free_agency" | "trade";
  created_at: string;
}

export interface TransactionItem {
  id: number;
  transaction_id: number;
  team_id: number;
  pokemon_id: number;
  action: "add" | "drop";
  points_delta: number;
}

// ============================================================
// Composite types for common query shapes
// ============================================================

export interface PokemonWithMoves extends Pokemon {
  moves: ImportantMove[];
}

export interface RosterPokemon extends Pokemon {
  nickname: string | null;
}

export interface RosterEntry extends Roster {
  pokemon: Pokemon;
}

export interface TeamWithRoster extends Team {
  roster: RosterEntry[];
}

export interface DraftPick extends DraftLog {
  team: Team;
  pokemon: Pokemon;
}

export interface TransactionWithItems extends Transaction {
  items: (TransactionItem & { pokemon: Pokemon; team: Team })[];
}
