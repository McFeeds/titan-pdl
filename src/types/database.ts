// ============================================================
// Row types — one interface per table, matching column names exactly.
// ============================================================

export interface Season {
  id: number;
  name: string;
  is_active: boolean;
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
  discord_id: string;
  showdown_name: string;
  team_name: string;
  logo_url: string | null;
  conference_id: number | null;
  group_id: number | null;
  draft_position: number | null;
  created_at: string;
}

export interface Roster {
  pokemon_id: number;
  conference_id: number;
  season_id: number;
  team_id: number;
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

export interface RosterEntry extends Roster {
  pokemon: Pokemon;
}

export interface TeamWithRoster extends Team {
  conference: Conference | null;
  group: Group | null;
  roster: RosterEntry[];
}

export interface DraftPick extends DraftLog {
  team: Team;
  pokemon: Pokemon;
}

export interface TransactionWithItems extends Transaction {
  items: (TransactionItem & { pokemon: Pokemon; team: Team })[];
}
