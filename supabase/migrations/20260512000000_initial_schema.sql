-- ============================================================
-- Titan PDL — Database Schema
-- ============================================================

-- ------------------------------------------------------------
-- SEASONS
-- ------------------------------------------------------------
CREATE TABLE seasons (
  id         SERIAL      PRIMARY KEY,
  name       TEXT        NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one season can be active at a time.
CREATE UNIQUE INDEX idx_seasons_one_active
  ON seasons (is_active)
  WHERE is_active = TRUE;


-- ------------------------------------------------------------
-- POKEMON
-- ------------------------------------------------------------
CREATE TABLE pokemon (
  id             SERIAL  PRIMARY KEY,
  dex_number     INTEGER UNIQUE,
  name           TEXT    NOT NULL,
  slug           TEXT    NOT NULL UNIQUE,
  type_1         TEXT    NOT NULL,
  type_2         TEXT,
  ability_1      TEXT    NOT NULL,
  ability_2      TEXT,
  hidden_ability TEXT,
  hp             INTEGER NOT NULL,
  atk            INTEGER NOT NULL,
  def            INTEGER NOT NULL,
  spa            INTEGER NOT NULL,
  spd            INTEGER NOT NULL,
  spe            INTEGER NOT NULL,
  point_value    INTEGER NOT NULL
);


-- ------------------------------------------------------------
-- IMPORTANT MOVES
-- ------------------------------------------------------------
CREATE TABLE important_moves (
  id   SERIAL PRIMARY KEY,
  name TEXT   NOT NULL UNIQUE,
  slug TEXT   NOT NULL UNIQUE
);


-- ------------------------------------------------------------
-- POKEMON ↔ MOVES  (junction)
-- ------------------------------------------------------------
CREATE TABLE pokemon_moves (
  pokemon_id INTEGER NOT NULL REFERENCES pokemon(id)         ON DELETE CASCADE,
  move_id    INTEGER NOT NULL REFERENCES important_moves(id) ON DELETE CASCADE,
  PRIMARY KEY (pokemon_id, move_id)
);

CREATE INDEX idx_pokemon_moves_move ON pokemon_moves (move_id);


-- ------------------------------------------------------------
-- CONFERENCES  (Hoenn, Sinnoh, …)
-- ------------------------------------------------------------
CREATE TABLE conferences (
  id   SERIAL PRIMARY KEY,
  name TEXT   NOT NULL UNIQUE
);


-- ------------------------------------------------------------
-- GROUPS  (Ruby, Sapphire, …)
-- ------------------------------------------------------------
CREATE TABLE groups (
  id            SERIAL  PRIMARY KEY,
  conference_id INTEGER NOT NULL REFERENCES conferences(id),
  name          TEXT    NOT NULL,
  UNIQUE (conference_id, name)
);

CREATE INDEX idx_groups_conference ON groups (conference_id);


-- ------------------------------------------------------------
-- TEAMS
-- ------------------------------------------------------------
CREATE TABLE teams (
  id             SERIAL      PRIMARY KEY,
  discord_id     TEXT        NOT NULL UNIQUE,
  showdown_name  TEXT        NOT NULL,
  team_name      TEXT        NOT NULL,
  logo_url       TEXT,
  conference_id  INTEGER     REFERENCES conferences(id),
  group_id       INTEGER     REFERENCES groups(id),
  draft_position INTEGER,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_teams_conference ON teams (conference_id);
CREATE INDEX idx_teams_group      ON teams (group_id);


-- ------------------------------------------------------------
-- ROSTERS
-- A pokemon_id may appear at most once per conference per season.
-- ------------------------------------------------------------
CREATE TABLE rosters (
  pokemon_id    INTEGER NOT NULL REFERENCES pokemon(id),
  conference_id INTEGER NOT NULL REFERENCES conferences(id),
  season_id     INTEGER NOT NULL REFERENCES seasons(id),
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  PRIMARY KEY (pokemon_id, conference_id, season_id)
);

CREATE INDEX idx_rosters_team    ON rosters (team_id, season_id);
CREATE INDEX idx_rosters_conf    ON rosters (conference_id, season_id);


-- ------------------------------------------------------------
-- DRAFT LOG
-- ------------------------------------------------------------
CREATE TABLE draft_log (
  id            SERIAL      PRIMARY KEY,
  season_id     INTEGER     NOT NULL REFERENCES seasons(id),
  conference_id INTEGER     NOT NULL REFERENCES conferences(id),
  pick_number   INTEGER     NOT NULL,
  team_id       INTEGER     NOT NULL REFERENCES teams(id),
  pokemon_id    INTEGER     NOT NULL REFERENCES pokemon(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Each pick number is unique within a conference + season
  UNIQUE (season_id, conference_id, pick_number),
  -- A pokemon can only be drafted once per conference per season
  UNIQUE (season_id, conference_id, pokemon_id)
);

CREATE INDEX idx_draft_log_season_conf ON draft_log (season_id, conference_id);


-- ------------------------------------------------------------
-- TRANSACTIONS  (header)
-- ------------------------------------------------------------
CREATE TABLE transactions (
  id         SERIAL      PRIMARY KEY,
  season_id  INTEGER     NOT NULL REFERENCES seasons(id),
  type       TEXT        NOT NULL CHECK (type IN ('free_agency', 'trade')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_season ON transactions (season_id);


-- ------------------------------------------------------------
-- TRANSACTION ITEMS  (one row per pokemon per team per transaction)
-- points_delta: negative = points spent, positive = points gained
-- ------------------------------------------------------------
CREATE TABLE transaction_items (
  id             SERIAL  PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  pokemon_id     INTEGER NOT NULL REFERENCES pokemon(id),
  action         TEXT    NOT NULL CHECK (action IN ('add', 'drop')),
  points_delta   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_tx_items_transaction ON transaction_items (transaction_id);
CREATE INDEX idx_tx_items_team        ON transaction_items (team_id);


-- ============================================================
-- ROW LEVEL SECURITY
-- All tables are publicly readable (league data is open).
-- No client-side writes — all data entry uses the service role
-- key via the Supabase dashboard or a server-side admin panel.
-- ============================================================

ALTER TABLE seasons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon          ENABLE ROW LEVEL SECURITY;
ALTER TABLE important_moves  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_moves    ENABLE ROW LEVEL SECURITY;
ALTER TABLE conferences      ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rosters          ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON seasons           FOR SELECT USING (true);
CREATE POLICY "Public read" ON pokemon           FOR SELECT USING (true);
CREATE POLICY "Public read" ON important_moves   FOR SELECT USING (true);
CREATE POLICY "Public read" ON pokemon_moves     FOR SELECT USING (true);
CREATE POLICY "Public read" ON conferences       FOR SELECT USING (true);
CREATE POLICY "Public read" ON groups            FOR SELECT USING (true);
CREATE POLICY "Public read" ON teams             FOR SELECT USING (true);
CREATE POLICY "Public read" ON rosters           FOR SELECT USING (true);
CREATE POLICY "Public read" ON draft_log         FOR SELECT USING (true);
CREATE POLICY "Public read" ON transactions      FOR SELECT USING (true);
CREATE POLICY "Public read" ON transaction_items FOR SELECT USING (true);
