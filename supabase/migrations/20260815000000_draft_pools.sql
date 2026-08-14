-- ============================================================
-- Draft pools — decouple "who drafts together, in what order" from
-- conference/group, which stay purely for standings and rostering.
--
-- Today a draft is hard-wired to mean "one whole conference" (conference_drafts
-- + draft_log.conference_id + every draft SQL function keyed by conference_id).
-- This introduces an explicit draft_pools table as the new turn-order unit —
-- a pool can equal one conference (the default, backfilled below so nothing
-- changes for the current season), one group, several groups spanning
-- different conferences, or any hand-picked set of teams.
--
-- Conference remains the boundary for standings, scheduling, and "a pokemon
-- can only be drafted once per conference per season" (rosters' existing PK)
-- — a draft pool only decides who picks in what order and when.
-- ============================================================

CREATE TABLE draft_pools (
  id         SERIAL      PRIMARY KEY,
  season_id  INTEGER     NOT NULL REFERENCES seasons(id),
  name       TEXT        NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ,
  UNIQUE (season_id, name)
);

ALTER TABLE draft_pools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON draft_pools FOR SELECT USING (true);
ALTER PUBLICATION supabase_realtime ADD TABLE draft_pools;

ALTER TABLE team_seasons ADD COLUMN draft_pool_id INTEGER REFERENCES draft_pools(id);

-- Backfill: one pool per (season, conference) pair that already exists,
-- named after the conference, with every team in that conference placed
-- into it — reproduces today's "draft = one conference" behavior exactly.
INSERT INTO draft_pools (season_id, name)
SELECT DISTINCT ts.season_id, c.name
FROM team_seasons ts
JOIN conferences c ON c.id = ts.conference_id
WHERE ts.conference_id IS NOT NULL;

UPDATE team_seasons ts
SET draft_pool_id = dp.id
FROM draft_pools dp
JOIN conferences c ON c.name = dp.name
WHERE dp.season_id = ts.season_id
  AND c.id = ts.conference_id;

-- draft_log is empty on every existing environment (no draft has run yet
-- against this schema shape), so the new column can go straight to NOT NULL.
ALTER TABLE draft_log ADD COLUMN draft_pool_id INTEGER NOT NULL REFERENCES draft_pools(id);

-- Pick numbers are now sequenced per pool, not per conference (a pool can
-- span multiple conferences). conference_id stays on draft_log — captured
-- from the picking team's own conference — for the existing per-conference
-- pokemon-uniqueness rule.
ALTER TABLE draft_log DROP CONSTRAINT draft_log_season_id_conference_id_pick_number_key;
ALTER TABLE draft_log ADD CONSTRAINT draft_log_draft_pool_id_pick_number_key UNIQUE (draft_pool_id, pick_number);

CREATE INDEX idx_draft_log_pool ON draft_log (draft_pool_id);

-- Confirmed empty on every existing environment — conference_drafts is
-- fully replaced by draft_pools.
DROP TABLE conference_drafts;


-- ------------------------------------------------------------
-- CLOSE DRAFT POOL IF ALL ENDED
-- (was close_conference_draft_if_all_ended)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS close_conference_draft_if_all_ended(INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION close_draft_pool_if_all_ended(
  p_draft_pool_id INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining FROM team_seasons
    WHERE draft_pool_id = p_draft_pool_id AND draft_ended_at IS NULL;

  IF v_remaining = 0 THEN
    UPDATE draft_pools SET is_active = FALSE
      WHERE id = p_draft_pool_id AND is_active = TRUE;
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- AUTO END INELIGIBLE TEAMS
-- Now pool-scoped, but the "any affordable pokemon still available" check
-- uses each team's own conference_id (ts.conference_id), not a single
-- pool-wide value, since availability stays per-conference even when a
-- pool spans multiple conferences.
-- ------------------------------------------------------------
-- CREATE OR REPLACE cannot rename an existing parameter (p_conference_id ->
-- p_draft_pool_id) in place, so the old signature must be dropped first.
DROP FUNCTION IF EXISTS auto_end_ineligible_teams(INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION auto_end_ineligible_teams(
  p_season_id     INTEGER,
  p_draft_pool_id INTEGER,
  p_max_slots     INTEGER DEFAULT 12
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_point_budget INTEGER;
BEGIN
  SELECT point_budget INTO v_point_budget FROM seasons WHERE id = p_season_id;

  UPDATE team_seasons ts
  SET draft_ended_at = NOW()
  WHERE ts.draft_pool_id = p_draft_pool_id
    AND ts.draft_ended_at IS NULL
    AND (
      (SELECT COUNT(*) FROM rosters r WHERE r.team_id = ts.team_id AND r.season_id = p_season_id) >= p_max_slots
      OR NOT EXISTS (
        SELECT 1 FROM pokemon p
        WHERE p.point_value <= (
          v_point_budget - COALESCE((
            SELECT SUM(po.point_value) FROM rosters r JOIN pokemon po ON po.id = r.pokemon_id
            WHERE r.team_id = ts.team_id AND r.season_id = p_season_id
          ), 0)
        )
        AND NOT EXISTS (
          SELECT 1 FROM rosters r2
          WHERE r2.pokemon_id = p.id AND r2.conference_id = ts.conference_id AND r2.season_id = p_season_id
        )
      )
    );

  PERFORM close_draft_pool_if_all_ended(p_draft_pool_id);
END;
$$;


-- ------------------------------------------------------------
-- COMPUTE ON CLOCK TEAM
-- Mirrors computeOnClockTeamId() in src/lib/draft.ts — keep both in sync.
-- Dropped p_season_id: draft_pool_id alone already scopes both team_seasons
-- and draft_log (a pool belongs to exactly one season).
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS compute_on_clock_team(INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION compute_on_clock_team(
  p_draft_pool_id INTEGER,
  p_max_slots     INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_team_id INTEGER;
BEGIN
  SELECT team_id INTO v_team_id
  FROM (
    SELECT ts.team_id, ts.draft_position,
           (SELECT COUNT(*) FROM draft_log dl
              WHERE dl.team_id = ts.team_id AND dl.draft_pool_id = p_draft_pool_id
           ) AS picks_made
    FROM team_seasons ts
    WHERE ts.draft_pool_id = p_draft_pool_id
      AND ts.draft_position IS NOT NULL AND ts.draft_ended_at IS NULL
  ) eligible
  WHERE picks_made < p_max_slots
  ORDER BY
    picks_made ASC,
    CASE WHEN (picks_made + 1) % 2 = 1 THEN draft_position ELSE -draft_position END ASC
  LIMIT 1;

  RETURN v_team_id; -- NULL when no eligible team remains (draft complete)
END;
$$;


-- ------------------------------------------------------------
-- END TEAM DRAFT
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION end_team_draft(
  p_season_id INTEGER,
  p_team_id   INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_draft_pool_id INTEGER;
BEGIN
  SELECT draft_pool_id INTO v_draft_pool_id FROM team_seasons
    WHERE team_id = p_team_id AND season_id = p_season_id;
  IF v_draft_pool_id IS NULL THEN
    RAISE EXCEPTION 'Team has no draft pool assigned this season';
  END IF;

  PERFORM pg_advisory_xact_lock(p_season_id, v_draft_pool_id);

  UPDATE team_seasons SET draft_ended_at = COALESCE(draft_ended_at, NOW())
    WHERE team_id = p_team_id AND season_id = p_season_id;

  PERFORM auto_end_ineligible_teams(p_season_id, v_draft_pool_id);
END;
$$;


-- ------------------------------------------------------------
-- REACTIVATE TEAM DRAFT
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION reactivate_team_draft(
  p_season_id INTEGER,
  p_team_id   INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_draft_pool_id INTEGER;
BEGIN
  UPDATE team_seasons SET draft_ended_at = NULL
    WHERE team_id = p_team_id AND season_id = p_season_id
    RETURNING draft_pool_id INTO v_draft_pool_id;

  IF v_draft_pool_id IS NOT NULL THEN
    PERFORM auto_end_ineligible_teams(p_season_id, v_draft_pool_id);
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- REVERT DRAFT TO PICK
-- Deletes the exact (pokemon_id, conference_id, season_id) roster rows the
-- reverted picks created — precise even when the pool spans multiple
-- conferences.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS revert_draft_to_pick(INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION revert_draft_to_pick(
  p_season_id              INTEGER,
  p_draft_pool_id          INTEGER,
  p_keep_up_to_pick_number INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(p_season_id, p_draft_pool_id);

  DELETE FROM rosters r
  USING draft_log dl
  WHERE dl.draft_pool_id = p_draft_pool_id
    AND dl.pick_number > p_keep_up_to_pick_number
    AND r.pokemon_id = dl.pokemon_id
    AND r.conference_id = dl.conference_id
    AND r.season_id = dl.season_id;

  DELETE FROM draft_log
  WHERE draft_pool_id = p_draft_pool_id
    AND pick_number > p_keep_up_to_pick_number;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted;
END;
$$;


-- ------------------------------------------------------------
-- RECORD DRAFT PICK
-- Resolves the team's own conference_id (for the rosters insert and the
-- per-conference draft_log uniqueness) and locks/sequences on the pool.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS record_draft_pick(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION record_draft_pick(
  p_season_id     INTEGER,
  p_draft_pool_id INTEGER,
  p_team_id       INTEGER,
  p_pokemon_id    INTEGER,
  p_max_slots     INTEGER DEFAULT 12
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_conference_id INTEGER;
  v_pick_number   INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(p_season_id, p_draft_pool_id);

  SELECT conference_id INTO v_conference_id FROM team_seasons
    WHERE team_id = p_team_id AND season_id = p_season_id;
  IF v_conference_id IS NULL THEN
    RAISE EXCEPTION 'Team has no conference assigned this season';
  END IF;

  INSERT INTO rosters (pokemon_id, conference_id, season_id, team_id)
  VALUES (p_pokemon_id, v_conference_id, p_season_id, p_team_id);

  SELECT COALESCE(MAX(pick_number), 0) + 1 INTO v_pick_number
  FROM draft_log
  WHERE draft_pool_id = p_draft_pool_id;

  INSERT INTO draft_log (season_id, draft_pool_id, conference_id, pick_number, team_id, pokemon_id)
  VALUES (p_season_id, p_draft_pool_id, v_conference_id, v_pick_number, p_team_id, p_pokemon_id);

  PERFORM auto_end_ineligible_teams(p_season_id, p_draft_pool_id, p_max_slots);

  RETURN v_pick_number;
END;
$$;


-- ------------------------------------------------------------
-- SET DRAFT POOL ACTIVE
-- (was set_conference_draft_active). Pools now pre-exist as admin-created
-- rows, so this is a plain UPDATE instead of an upsert.
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS set_conference_draft_active(INTEGER, INTEGER, BOOLEAN);

CREATE OR REPLACE FUNCTION set_draft_pool_active(
  p_draft_pool_id INTEGER,
  p_is_active     BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_season_id INTEGER;
BEGIN
  UPDATE draft_pools
  SET is_active  = p_is_active,
      started_at = COALESCE(started_at, CASE WHEN p_is_active THEN NOW() END)
  WHERE id = p_draft_pool_id
  RETURNING season_id INTO v_season_id;

  IF p_is_active AND v_season_id IS NOT NULL THEN
    PERFORM auto_end_ineligible_teams(v_season_id, p_draft_pool_id);
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- SUBMIT DRAFT PICK (player-facing)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS submit_draft_pick(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER);

CREATE OR REPLACE FUNCTION submit_draft_pick(
  p_season_id     INTEGER,
  p_draft_pool_id INTEGER,
  p_team_id       INTEGER,
  p_pokemon_id    INTEGER,
  p_max_slots     INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_active       BOOLEAN;
  v_draft_ended_at  TIMESTAMPTZ;
  v_conference_id   INTEGER;
  v_point_budget    INTEGER;
  v_point_value     INTEGER;
  v_spent           INTEGER;
  v_slot_count      INTEGER;
  v_next_pick       INTEGER;
  v_on_clock_team   INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(p_season_id, p_draft_pool_id);

  SELECT is_active INTO v_is_active FROM draft_pools WHERE id = p_draft_pool_id;
  IF NOT COALESCE(v_is_active, FALSE) THEN
    RAISE EXCEPTION 'The draft is not currently active for your pool';
  END IF;

  SELECT draft_ended_at, conference_id INTO v_draft_ended_at, v_conference_id FROM team_seasons
    WHERE team_id = p_team_id AND season_id = p_season_id;
  IF v_draft_ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'You have ended your draft';
  END IF;
  IF v_conference_id IS NULL THEN
    RAISE EXCEPTION 'Team has no conference assigned this season';
  END IF;

  IF EXISTS (
    SELECT 1 FROM rosters
    WHERE pokemon_id = p_pokemon_id AND conference_id = v_conference_id AND season_id = p_season_id
  ) THEN
    RAISE EXCEPTION 'That pokemon has already been drafted';
  END IF;

  SELECT point_value INTO v_point_value FROM pokemon WHERE id = p_pokemon_id;
  IF v_point_value IS NULL THEN RAISE EXCEPTION 'Pokemon not found'; END IF;
  IF v_point_value = 0 THEN RAISE EXCEPTION 'That pokemon is banned'; END IF;

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

  v_on_clock_team := compute_on_clock_team(p_draft_pool_id, p_max_slots);
  IF v_on_clock_team IS NULL THEN
    RAISE EXCEPTION 'The draft is complete';
  END IF;
  IF v_on_clock_team != p_team_id THEN
    RAISE EXCEPTION 'It is not your team''s turn to pick';
  END IF;

  SELECT COALESCE(MAX(pick_number), 0) + 1 INTO v_next_pick
  FROM draft_log
  WHERE draft_pool_id = p_draft_pool_id;

  INSERT INTO rosters (pokemon_id, conference_id, season_id, team_id)
    VALUES (p_pokemon_id, v_conference_id, p_season_id, p_team_id);
  INSERT INTO draft_log (season_id, draft_pool_id, conference_id, pick_number, team_id, pokemon_id)
    VALUES (p_season_id, p_draft_pool_id, v_conference_id, v_next_pick, p_team_id, p_pokemon_id);

  PERFORM auto_end_ineligible_teams(p_season_id, p_draft_pool_id, p_max_slots);

  RETURN v_next_pick;
END;
$$;


-- ------------------------------------------------------------
-- ADMIN RESET DRAFT HISTORY
-- draft_pools are now admin-created setup (like conferences/groups), so
-- reset their run-state instead of deleting them.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_reset_draft_history() RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM match_game_pokemon WHERE true;
  DELETE FROM match_games WHERE true;
  DELETE FROM matches WHERE true;
  DELETE FROM transaction_items WHERE true;
  DELETE FROM transactions WHERE true;
  DELETE FROM draft_log WHERE true;
  DELETE FROM rosters WHERE true;
  UPDATE draft_pools SET is_active = FALSE, started_at = NULL WHERE true;
  UPDATE team_seasons SET draft_ended_at = NULL, fa_tokens_adjustment = 0 WHERE true;
END;
$$;
