-- ============================================================
-- Titan PDL — Database Schema
-- ============================================================

-- ------------------------------------------------------------
-- SEASONS
-- ------------------------------------------------------------
CREATE TABLE seasons (
  id           SERIAL      PRIMARY KEY,
  name         TEXT        NOT NULL,
  is_active    BOOLEAN     NOT NULL DEFAULT FALSE,
  point_budget INTEGER     NOT NULL DEFAULT 115,
  fa_tokens    INTEGER     NOT NULL DEFAULT 3,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
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
  nickname      TEXT,
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
-- CONFERENCE DRAFTS
-- Tracks whether a conference's draft is currently live for a season,
-- so the public draft board can highlight whose turn it is.
-- ------------------------------------------------------------
CREATE TABLE conference_drafts (
  season_id     INTEGER NOT NULL REFERENCES seasons(id),
  conference_id INTEGER NOT NULL REFERENCES conferences(id),
  is_active     BOOLEAN NOT NULL DEFAULT FALSE,
  -- Set once, never cleared. Distinguishes "never started" (NULL) from
  -- "started, then ended" (NOT NULL AND is_active = false) — both look like
  -- is_active = false alone. Drives the pre-draft free-agency lock.
  started_at    TIMESTAMPTZ,
  PRIMARY KEY (season_id, conference_id)
);


-- ------------------------------------------------------------
-- CLOSE CONFERENCE DRAFT IF ALL ENDED
-- If every team in a conference has now ended their draft, flip the
-- conference's draft to inactive (started_at stays set, so it flows into
-- free agency — same end state as the admin's End Draft toggle).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION close_conference_draft_if_all_ended(
  p_season_id     INTEGER,
  p_conference_id INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining FROM team_seasons
    WHERE season_id = p_season_id AND conference_id = p_conference_id AND draft_ended_at IS NULL;

  IF v_remaining = 0 THEN
    UPDATE conference_drafts SET is_active = FALSE
      WHERE season_id = p_season_id AND conference_id = p_conference_id AND is_active = TRUE;
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- COMPUTE ON CLOCK TEAM
-- Walks the snake draft round-by-round (odd rounds draft_position 1->N,
-- even rounds N->1), skipping a team's remaining rounds once their draft
-- has ended — their already-made picks still count toward picksSoFar.
-- Mirrors computeOnClockTeamId() in src/lib/draft.ts — keep both in sync.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_on_clock_team(
  p_season_id     INTEGER,
  p_conference_id INTEGER,
  p_max_slots     INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_picks_so_far INTEGER;
  v_count        INTEGER := 0;
  v_round        INTEGER;
  v_team         RECORD;
BEGIN
  SELECT COUNT(*) INTO v_picks_so_far FROM draft_log
    WHERE season_id = p_season_id AND conference_id = p_conference_id;

  FOR v_round IN 1..p_max_slots LOOP
    FOR v_team IN
      SELECT ts.team_id, ts.draft_ended_at,
             (SELECT COUNT(*) FROM draft_log dl
                WHERE dl.team_id = ts.team_id AND dl.season_id = p_season_id AND dl.conference_id = p_conference_id
             ) AS picks_made
      FROM team_seasons ts
      WHERE ts.season_id = p_season_id AND ts.conference_id = p_conference_id AND ts.draft_position IS NOT NULL
      ORDER BY CASE WHEN v_round % 2 = 1 THEN ts.draft_position ELSE -ts.draft_position END
    LOOP
      IF v_team.draft_ended_at IS NOT NULL AND v_round > v_team.picks_made THEN
        CONTINUE; -- no slot left for this team
      END IF;
      IF v_count = v_picks_so_far THEN
        RETURN v_team.team_id;
      END IF;
      v_count := v_count + 1;
    END LOOP;
  END LOOP;

  RETURN NULL; -- draft complete
END;
$$;


-- ------------------------------------------------------------
-- END TEAM DRAFT
-- Used identically by a team's voluntary end and an admin's force-end —
-- the TS layer decides who's allowed to call it for which team.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION end_team_draft(
  p_season_id INTEGER,
  p_team_id   INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_conference_id INTEGER;
BEGIN
  SELECT conference_id INTO v_conference_id FROM team_seasons
    WHERE team_id = p_team_id AND season_id = p_season_id;
  IF v_conference_id IS NULL THEN
    RAISE EXCEPTION 'Team has no conference assigned this season';
  END IF;

  PERFORM pg_advisory_xact_lock(p_season_id, v_conference_id);

  UPDATE team_seasons SET draft_ended_at = COALESCE(draft_ended_at, NOW())
    WHERE team_id = p_team_id AND season_id = p_season_id;

  PERFORM close_conference_draft_if_all_ended(p_season_id, v_conference_id);
END;
$$;


-- ------------------------------------------------------------
-- REACTIVATE TEAM DRAFT
-- Manual admin undo of an end (voluntary, auto, or forced).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION reactivate_team_draft(
  p_season_id INTEGER,
  p_team_id   INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE team_seasons SET draft_ended_at = NULL
    WHERE team_id = p_team_id AND season_id = p_season_id;
END;
$$;


-- ------------------------------------------------------------
-- REVERT DRAFT TO PICK
-- Deletes every pick (and its roster entry) logged after the given pick
-- number for a conference. Pick numbers stay contiguous since only the
-- tail is ever trimmed, so no renumbering is needed. Does not touch
-- draft_ended_at or conference_drafts.is_active — those are separate,
-- already-existing admin controls to pair with a revert if needed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION revert_draft_to_pick(
  p_season_id              INTEGER,
  p_conference_id          INTEGER,
  p_keep_up_to_pick_number INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(p_season_id, p_conference_id);

  DELETE FROM rosters
  WHERE season_id = p_season_id AND conference_id = p_conference_id
    AND pokemon_id IN (
      SELECT pokemon_id FROM draft_log
      WHERE season_id = p_season_id AND conference_id = p_conference_id
        AND pick_number > p_keep_up_to_pick_number
    );

  DELETE FROM draft_log
  WHERE season_id = p_season_id AND conference_id = p_conference_id
    AND pick_number > p_keep_up_to_pick_number;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted;
END;
$$;


-- ------------------------------------------------------------
-- RECORD DRAFT PICK
-- Atomically adds a pokemon to a team's roster and appends the next
-- sequential pick_number to draft_log. An advisory lock keyed on
-- (season_id, conference_id) keeps concurrent picks from racing on
-- the pick_number computation. Also auto-ends the team afterward if they
-- can no longer afford anything undrafted, so compute_on_clock_team()
-- correctly skips them going forward.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_draft_pick(
  p_season_id     INTEGER,
  p_conference_id INTEGER,
  p_team_id       INTEGER,
  p_pokemon_id    INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_pick_number     INTEGER;
  v_point_budget    INTEGER;
  v_spent           INTEGER;
  v_can_afford_more BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(p_season_id, p_conference_id);

  INSERT INTO rosters (pokemon_id, conference_id, season_id, team_id)
  VALUES (p_pokemon_id, p_conference_id, p_season_id, p_team_id);

  SELECT COALESCE(MAX(pick_number), 0) + 1 INTO v_pick_number
  FROM draft_log
  WHERE season_id = p_season_id AND conference_id = p_conference_id;

  INSERT INTO draft_log (season_id, conference_id, pick_number, team_id, pokemon_id)
  VALUES (p_season_id, p_conference_id, v_pick_number, p_team_id, p_pokemon_id);

  SELECT point_budget INTO v_point_budget FROM seasons WHERE id = p_season_id;
  SELECT COALESCE(SUM(po.point_value), 0) INTO v_spent
    FROM rosters r JOIN pokemon po ON po.id = r.pokemon_id
    WHERE r.team_id = p_team_id AND r.season_id = p_season_id;

  SELECT EXISTS (
    SELECT 1 FROM pokemon p
    WHERE p.point_value <= (v_point_budget - v_spent)
      AND NOT EXISTS (
        SELECT 1 FROM rosters r
        WHERE r.pokemon_id = p.id AND r.conference_id = p_conference_id AND r.season_id = p_season_id
      )
  ) INTO v_can_afford_more;

  IF NOT v_can_afford_more THEN
    UPDATE team_seasons SET draft_ended_at = COALESCE(draft_ended_at, NOW())
      WHERE team_id = p_team_id AND season_id = p_season_id;
    PERFORM close_conference_draft_if_all_ended(p_season_id, p_conference_id);
  END IF;

  RETURN v_pick_number;
END;
$$;


-- ------------------------------------------------------------
-- SET CONFERENCE DRAFT ACTIVE
-- Stamps started_at exactly once, atomically, the first time a conference's
-- draft is activated. Used by the admin panel instead of a raw upsert.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_conference_draft_active(
  p_season_id     INTEGER,
  p_conference_id INTEGER,
  p_is_active     BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO conference_drafts (season_id, conference_id, is_active, started_at)
  VALUES (p_season_id, p_conference_id, p_is_active, CASE WHEN p_is_active THEN NOW() ELSE NULL END)
  ON CONFLICT (season_id, conference_id) DO UPDATE
  SET is_active  = EXCLUDED.is_active,
      started_at = COALESCE(conference_drafts.started_at, EXCLUDED.started_at);
END;
$$;


-- ------------------------------------------------------------
-- SUBMIT DRAFT PICK (player-facing)
-- Same mutation as record_draft_pick, but under the same advisory lock also
-- re-validates: draft is active, caller hasn't already ended their draft,
-- it's this team's turn (compute_on_clock_team — mirrors
-- computeOnClockTeamId() in src/lib/draft.ts, keep both in sync), pokemon
-- isn't already drafted, roster has room, and the pick fits the season's
-- point budget. Afterward, auto-ends the team if they can no longer afford
-- anything undrafted. record_draft_pick is left untouched for the admin
-- override flow, which intentionally skips the turn/ended checks.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_draft_pick(
  p_season_id     INTEGER,
  p_conference_id INTEGER,
  p_team_id       INTEGER,
  p_pokemon_id    INTEGER,
  p_max_slots     INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_active       BOOLEAN;
  v_draft_ended_at  TIMESTAMPTZ;
  v_point_budget    INTEGER;
  v_point_value     INTEGER;
  v_spent           INTEGER;
  v_slot_count      INTEGER;
  v_next_pick       INTEGER;
  v_on_clock_team   INTEGER;
  v_remaining       INTEGER;
  v_can_afford_more BOOLEAN;
BEGIN
  PERFORM pg_advisory_xact_lock(p_season_id, p_conference_id);

  SELECT is_active INTO v_is_active FROM conference_drafts
    WHERE season_id = p_season_id AND conference_id = p_conference_id;
  IF NOT COALESCE(v_is_active, FALSE) THEN
    RAISE EXCEPTION 'The draft is not currently active for your conference';
  END IF;

  SELECT draft_ended_at INTO v_draft_ended_at FROM team_seasons
    WHERE team_id = p_team_id AND season_id = p_season_id;
  IF v_draft_ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'You have ended your draft';
  END IF;

  IF EXISTS (
    SELECT 1 FROM rosters
    WHERE pokemon_id = p_pokemon_id AND conference_id = p_conference_id AND season_id = p_season_id
  ) THEN
    RAISE EXCEPTION 'That pokemon has already been drafted';
  END IF;

  SELECT point_value INTO v_point_value FROM pokemon WHERE id = p_pokemon_id;
  IF v_point_value IS NULL THEN RAISE EXCEPTION 'Pokemon not found'; END IF;

  SELECT COUNT(*) INTO v_slot_count FROM rosters
    WHERE team_id = p_team_id AND season_id = p_season_id;
  IF v_slot_count >= p_max_slots THEN RAISE EXCEPTION 'Your roster is full'; END IF;

  SELECT point_budget INTO v_point_budget FROM seasons WHERE id = p_season_id;
  SELECT COALESCE(SUM(po.point_value), 0) INTO v_spent
    FROM rosters r JOIN pokemon po ON po.id = r.pokemon_id
    WHERE r.team_id = p_team_id AND r.season_id = p_season_id;
  IF v_spent + v_point_value > v_point_budget THEN
    RAISE EXCEPTION 'Not enough points remaining';
  END IF;

  v_on_clock_team := compute_on_clock_team(p_season_id, p_conference_id, p_max_slots);
  IF v_on_clock_team IS NULL THEN
    RAISE EXCEPTION 'The draft is complete';
  END IF;
  IF v_on_clock_team != p_team_id THEN
    RAISE EXCEPTION 'It is not your team''s turn to pick';
  END IF;

  SELECT COALESCE(MAX(pick_number), 0) + 1 INTO v_next_pick
  FROM draft_log
  WHERE season_id = p_season_id AND conference_id = p_conference_id;

  INSERT INTO rosters (pokemon_id, conference_id, season_id, team_id)
    VALUES (p_pokemon_id, p_conference_id, p_season_id, p_team_id);
  INSERT INTO draft_log (season_id, conference_id, pick_number, team_id, pokemon_id)
    VALUES (p_season_id, p_conference_id, v_next_pick, p_team_id, p_pokemon_id);

  -- Auto-end: if nothing left in the pool fits the team's remaining budget
  v_remaining := v_point_budget - (v_spent + v_point_value);
  SELECT EXISTS (
    SELECT 1 FROM pokemon p
    WHERE p.point_value <= v_remaining
      AND NOT EXISTS (
        SELECT 1 FROM rosters r
        WHERE r.pokemon_id = p.id AND r.conference_id = p_conference_id AND r.season_id = p_season_id
      )
  ) INTO v_can_afford_more;

  IF NOT v_can_afford_more THEN
    UPDATE team_seasons SET draft_ended_at = COALESCE(draft_ended_at, NOW())
      WHERE team_id = p_team_id AND season_id = p_season_id;
    PERFORM close_conference_draft_if_all_ended(p_season_id, p_conference_id);
  END IF;

  RETURN v_next_pick;
END;
$$;


-- ------------------------------------------------------------
-- SUBMIT FREE AGENCY MOVE (player-facing add/drop, post-draft)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_free_agency_move(
  p_season_id     INTEGER,
  p_conference_id INTEGER,
  p_team_id       INTEGER,
  p_pokemon_id    INTEGER,
  p_action        TEXT,   -- 'add' | 'drop'
  p_max_slots     INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_point_budget   INTEGER;
  v_fa_tokens      INTEGER;
  v_point_value    INTEGER;
  v_spent          INTEGER;
  v_slot_count     INTEGER;
  v_tokens_used    INTEGER;
  v_transaction_id INTEGER;
BEGIN
  IF p_action NOT IN ('add', 'drop') THEN RAISE EXCEPTION 'Invalid free agency action'; END IF;

  PERFORM pg_advisory_xact_lock(p_season_id, p_team_id);

  SELECT point_value INTO v_point_value FROM pokemon WHERE id = p_pokemon_id;
  IF v_point_value IS NULL THEN RAISE EXCEPTION 'Pokemon not found'; END IF;

  SELECT point_budget, fa_tokens INTO v_point_budget, v_fa_tokens
    FROM seasons WHERE id = p_season_id;

  IF p_action = 'add' THEN
    IF EXISTS (
      SELECT 1 FROM rosters
      WHERE pokemon_id = p_pokemon_id AND conference_id = p_conference_id AND season_id = p_season_id
    ) THEN
      RAISE EXCEPTION 'That pokemon is already rostered';
    END IF;

    SELECT COUNT(*) INTO v_slot_count FROM rosters
      WHERE team_id = p_team_id AND season_id = p_season_id;
    IF v_slot_count >= p_max_slots THEN RAISE EXCEPTION 'Your roster is full'; END IF;

    SELECT COALESCE(SUM(po.point_value), 0) INTO v_spent
      FROM rosters r JOIN pokemon po ON po.id = r.pokemon_id
      WHERE r.team_id = p_team_id AND r.season_id = p_season_id;
    IF v_spent + v_point_value > v_point_budget THEN
      RAISE EXCEPTION 'Not enough points remaining';
    END IF;

    SELECT COUNT(*) INTO v_tokens_used
      FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id
      WHERE t.season_id = p_season_id AND t.type = 'free_agency'
        AND ti.team_id = p_team_id AND ti.action = 'add';
    IF v_tokens_used >= v_fa_tokens THEN
      RAISE EXCEPTION 'No free agency tokens remaining';
    END IF;

    INSERT INTO transactions (season_id, type) VALUES (p_season_id, 'free_agency')
      RETURNING id INTO v_transaction_id;
    INSERT INTO transaction_items (transaction_id, team_id, pokemon_id, action, points_delta)
      VALUES (v_transaction_id, p_team_id, p_pokemon_id, 'add', -v_point_value);
    INSERT INTO rosters (pokemon_id, conference_id, season_id, team_id)
      VALUES (p_pokemon_id, p_conference_id, p_season_id, p_team_id);

  ELSE -- drop
    IF NOT EXISTS (
      SELECT 1 FROM rosters
      WHERE pokemon_id = p_pokemon_id AND conference_id = p_conference_id
        AND season_id = p_season_id AND team_id = p_team_id
    ) THEN
      RAISE EXCEPTION 'That pokemon is not on your roster';
    END IF;

    INSERT INTO transactions (season_id, type) VALUES (p_season_id, 'free_agency')
      RETURNING id INTO v_transaction_id;
    INSERT INTO transaction_items (transaction_id, team_id, pokemon_id, action, points_delta)
      VALUES (v_transaction_id, p_team_id, p_pokemon_id, 'drop', v_point_value);
    DELETE FROM rosters
      WHERE pokemon_id = p_pokemon_id AND conference_id = p_conference_id
        AND season_id = p_season_id AND team_id = p_team_id;
  END IF;

  RETURN v_transaction_id;
END;
$$;


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
  -- Set once (never cleared automatically) when a team's draft ends —
  -- voluntarily, automatically (out of affordable picks), or by admin
  -- force-end. Drives turn-order skipping and the free-agency gate.
  draft_ended_at TIMESTAMPTZ,
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
ALTER TABLE conference_drafts   ENABLE ROW LEVEL SECURITY;
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
CREATE POLICY "Public read" ON conference_drafts  FOR SELECT USING (true);
CREATE POLICY "Public read" ON transactions       FOR SELECT USING (true);
CREATE POLICY "Public read" ON transaction_items  FOR SELECT USING (true);
CREATE POLICY "Public read" ON team_seasons       FOR SELECT USING (true);
CREATE POLICY "Public read" ON team_members       FOR SELECT USING (true);
CREATE POLICY "Public read" ON matches            FOR SELECT USING (true);
CREATE POLICY "Public read" ON match_games        FOR SELECT USING (true);
CREATE POLICY "Public read" ON match_game_pokemon FOR SELECT USING (true);


-- ============================================================
-- REALTIME
-- Tables the client subscribes to via postgres_changes.
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE rosters, draft_log, conference_drafts, team_seasons;
