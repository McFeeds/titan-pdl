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
  dex_number     INTEGER,
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
  team_name      TEXT        NOT NULL,
  logo_url       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


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


-- ------------------------------------------------------------
-- TEAM SEASONS  (season-specific placement — conference, group, draft order)
-- Replaces conference_id/group_id/draft_position on teams so those
-- attributes can differ across seasons.
-- ------------------------------------------------------------
CREATE TABLE team_seasons (
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  season_id      INTEGER NOT NULL REFERENCES seasons(id),
  conference_id  INTEGER NOT NULL REFERENCES conferences(id),
  group_id       INTEGER REFERENCES groups(id),
  draft_position INTEGER,
  PRIMARY KEY (team_id, season_id)
);

CREATE INDEX idx_team_seasons_season ON team_seasons (season_id);
CREATE INDEX idx_team_seasons_conf   ON team_seasons (season_id, conference_id);


-- ------------------------------------------------------------
-- TEAM MEMBERS  (human players per team per season)
-- ------------------------------------------------------------
CREATE TABLE team_members (
  id            SERIAL  PRIMARY KEY,
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  season_id     INTEGER NOT NULL REFERENCES seasons(id),
  discord_id    TEXT    NOT NULL,
  showdown_name TEXT,
  role          TEXT    NOT NULL CHECK (role IN ('owner', 'co_owner', 'manager')),
  UNIQUE (team_id, season_id, discord_id)
);

CREATE INDEX idx_team_members_team_season ON team_members (team_id, season_id);


-- ------------------------------------------------------------
-- MATCHES  (one row per weekly matchup)
-- ------------------------------------------------------------
CREATE TABLE matches (
  id           SERIAL      PRIMARY KEY,
  season_id    INTEGER     NOT NULL REFERENCES seasons(id),
  week_number  INTEGER     NOT NULL,
  home_team_id INTEGER     NOT NULL REFERENCES teams(id),
  away_team_id INTEGER     NOT NULL REFERENCES teams(id),
  played_at    TIMESTAMPTZ,
  UNIQUE (season_id, week_number, home_team_id, away_team_id)
);

CREATE INDEX idx_matches_season      ON matches (season_id);
CREATE INDEX idx_matches_season_week ON matches (season_id, week_number);
CREATE INDEX idx_matches_home_team   ON matches (home_team_id);
CREATE INDEX idx_matches_away_team   ON matches (away_team_id);


-- ------------------------------------------------------------
-- MATCH GAMES  (individual games within a BO3, up to 3)
-- ------------------------------------------------------------
CREATE TABLE match_games (
  id             SERIAL  PRIMARY KEY,
  match_id       INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  game_number    INTEGER NOT NULL CHECK (game_number BETWEEN 1 AND 3),
  winner_team_id INTEGER REFERENCES teams(id),
  replay_url     TEXT,
  UNIQUE (match_id, game_number)
);

CREATE INDEX idx_match_games_match ON match_games (match_id);


-- ------------------------------------------------------------
-- MATCH GAME POKEMON  (pokemon brought per team per game + per-game stats)
-- Row existence implies the pokemon was brought to that game.
-- ------------------------------------------------------------
CREATE TABLE match_game_pokemon (
  id            SERIAL  PRIMARY KEY,
  match_game_id INTEGER NOT NULL REFERENCES match_games(id) ON DELETE CASCADE,
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  pokemon_id    INTEGER NOT NULL REFERENCES pokemon(id),
  kills         INTEGER NOT NULL DEFAULT 0,
  deaths        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (match_game_id, team_id, pokemon_id)
);

CREATE INDEX idx_mgp_game    ON match_game_pokemon (match_game_id);
CREATE INDEX idx_mgp_team    ON match_game_pokemon (team_id);
CREATE INDEX idx_mgp_pokemon ON match_game_pokemon (pokemon_id);


-- ============================================================
-- VIEWS  (derived stats — no redundant storage)
-- ============================================================

-- Home/away game counts per match, derived from match_games.
CREATE VIEW match_results AS
SELECT
  m.id            AS match_id,
  m.season_id,
  m.week_number,
  m.home_team_id,
  m.away_team_id,
  COUNT(*) FILTER (WHERE mg.winner_team_id = m.home_team_id) AS home_games_won,
  COUNT(*) FILTER (WHERE mg.winner_team_id = m.away_team_id) AS away_games_won
FROM matches m
LEFT JOIN match_games mg ON mg.match_id = m.id
GROUP BY m.id, m.season_id, m.week_number, m.home_team_id, m.away_team_id;


-- W/L record per team per season. A match is won by taking 2+ games in the BO3.
CREATE VIEW team_records AS
WITH sides AS (
  SELECT season_id, home_team_id AS team_id, (home_games_won >= 2) AS won
  FROM match_results
  UNION ALL
  SELECT season_id, away_team_id AS team_id, (away_games_won >= 2) AS won
  FROM match_results
)
SELECT
  season_id,
  team_id,
  COUNT(*) FILTER (WHERE won)      AS wins,
  COUNT(*) FILTER (WHERE NOT won)  AS losses
FROM sides
GROUP BY season_id, team_id;


-- Aggregated pokemon stats per team per season.
-- `brought` = number of individual games the pokemon appeared in.
CREATE VIEW pokemon_season_stats AS
SELECT
  m.season_id,
  mgp.team_id,
  mgp.pokemon_id,
  COUNT(*)        AS brought,
  SUM(mgp.kills)  AS kills,
  SUM(mgp.deaths) AS deaths
FROM match_game_pokemon mgp
JOIN match_games mg ON mg.id = mgp.match_game_id
JOIN matches     m  ON m.id  = mg.match_id
GROUP BY m.season_id, mgp.team_id, mgp.pokemon_id;


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
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_seasons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_games         ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_game_pokemon  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON seasons            FOR SELECT USING (true);
CREATE POLICY "Public read" ON pokemon            FOR SELECT USING (true);
CREATE POLICY "Public read" ON important_moves    FOR SELECT USING (true);
CREATE POLICY "Public read" ON pokemon_moves      FOR SELECT USING (true);
CREATE POLICY "Public read" ON conferences        FOR SELECT USING (true);
CREATE POLICY "Public read" ON groups             FOR SELECT USING (true);
CREATE POLICY "Public read" ON teams              FOR SELECT USING (true);
CREATE POLICY "Public read" ON rosters            FOR SELECT USING (true);
CREATE POLICY "Public read" ON draft_log          FOR SELECT USING (true);
CREATE POLICY "Public read" ON transactions       FOR SELECT USING (true);
CREATE POLICY "Public read" ON transaction_items  FOR SELECT USING (true);
CREATE POLICY "Public read" ON team_seasons       FOR SELECT USING (true);
CREATE POLICY "Public read" ON team_members       FOR SELECT USING (true);
CREATE POLICY "Public read" ON matches            FOR SELECT USING (true);
CREATE POLICY "Public read" ON match_games        FOR SELECT USING (true);
CREATE POLICY "Public read" ON match_game_pokemon FOR SELECT USING (true);
