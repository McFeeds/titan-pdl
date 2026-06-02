-- ============================================================
-- Historical season data infrastructure
-- - team_seasons: season-scoped conference/group/draft placement
-- - team_members: rebuilt with season scope and role
-- - matches, match_games, match_game_pokemon: weekly match results
-- - views: match_results, team_records, pokemon_season_stats
-- ============================================================


-- ------------------------------------------------------------
-- 1. team_seasons
-- Migrate existing conference/group/draft_position out of teams.
-- Teams without a conference are skipped (no active-season row created).
-- ------------------------------------------------------------
CREATE TABLE team_seasons (
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  season_id      INTEGER NOT NULL REFERENCES seasons(id),
  conference_id  INTEGER NOT NULL REFERENCES conferences(id),
  group_id       INTEGER REFERENCES groups(id),
  draft_position INTEGER,
  PRIMARY KEY (team_id, season_id)
);

INSERT INTO team_seasons (team_id, season_id, conference_id, group_id, draft_position)
SELECT t.id, s.id, t.conference_id, t.group_id, t.draft_position
FROM teams t
CROSS JOIN seasons s
WHERE s.is_active = TRUE
  AND t.conference_id IS NOT NULL;

CREATE INDEX idx_team_seasons_season ON team_seasons (season_id);
CREATE INDEX idx_team_seasons_conf   ON team_seasons (season_id, conference_id);

ALTER TABLE team_seasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON team_seasons FOR SELECT USING (true);


-- ------------------------------------------------------------
-- 2. Drop season-varying columns from teams
--    (dependent indexes are dropped automatically)
-- ------------------------------------------------------------
ALTER TABLE teams DROP COLUMN conference_id;
ALTER TABLE teams DROP COLUMN group_id;
ALTER TABLE teams DROP COLUMN draft_position;


-- ------------------------------------------------------------
-- 3. Rebuild team_members with season scope and role
-- Existing rows had (discord_id, team_id) as PK — migrate them
-- into the active season with role = 'owner'.
-- ------------------------------------------------------------
CREATE TABLE team_members_new (
  id            SERIAL  PRIMARY KEY,
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  season_id     INTEGER NOT NULL REFERENCES seasons(id),
  discord_id    TEXT    NOT NULL,
  showdown_name TEXT,
  role          TEXT    NOT NULL CHECK (role IN ('owner', 'co_owner', 'manager')),
  UNIQUE (team_id, season_id, discord_id)
);

-- Enable RLS immediately so the table is never publicly accessible.
-- The policy and RLS status carry over when the table is renamed below.
ALTER TABLE team_members_new ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON team_members_new FOR SELECT USING (true);

INSERT INTO team_members_new (team_id, season_id, discord_id, showdown_name, role)
SELECT tm.team_id, s.id, tm.discord_id, tm.showdown_name, 'owner'
FROM team_members tm
CROSS JOIN seasons s
WHERE s.is_active = TRUE;

DROP TABLE team_members;
ALTER TABLE team_members_new RENAME TO team_members;

CREATE INDEX idx_team_members_team_season ON team_members (team_id, season_id);


-- ------------------------------------------------------------
-- 4. matches
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

ALTER TABLE matches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON matches FOR SELECT USING (true);


-- ------------------------------------------------------------
-- 5. match_games
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

ALTER TABLE match_games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON match_games FOR SELECT USING (true);


-- ------------------------------------------------------------
-- 6. match_game_pokemon
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

ALTER TABLE match_game_pokemon ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON match_game_pokemon FOR SELECT USING (true);


-- ------------------------------------------------------------
-- 7. Views
-- ------------------------------------------------------------
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
