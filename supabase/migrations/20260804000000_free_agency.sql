-- ------------------------------------------------------------
-- SEASON DRAFT CONFIG
-- Point budget and free agency tokens, configured per season.
-- Defaults match the values already hardcoded/used across the app.
-- ------------------------------------------------------------
ALTER TABLE seasons ADD COLUMN point_budget INTEGER NOT NULL DEFAULT 115;
ALTER TABLE seasons ADD COLUMN fa_tokens    INTEGER NOT NULL DEFAULT 3;

-- ------------------------------------------------------------
-- CONFERENCE DRAFTS: started_at
-- Distinguishes "never started" (started_at IS NULL) from "started, then
-- ended" (started_at IS NOT NULL AND is_active = false) — both currently
-- look identical via is_active = false alone. Set once, never cleared.
-- ------------------------------------------------------------
ALTER TABLE conference_drafts ADD COLUMN started_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- SET CONFERENCE DRAFT ACTIVE
-- Replaces the raw upsert used by the admin panel so started_at is stamped
-- exactly once, atomically, the first time a conference's draft is activated.
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
-- re-validates: draft is active, it's this team's turn (snake order — mirrors
-- computeOnClockPosition() in src/lib/draft.ts), pokemon isn't already
-- drafted, roster has room, and the pick fits the season's point budget.
-- record_draft_pick is left untouched for the admin override flow, which
-- intentionally skips all of this.
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
  v_is_active      BOOLEAN;
  v_point_budget   INTEGER;
  v_point_value    INTEGER;
  v_spent          INTEGER;
  v_slot_count     INTEGER;
  v_draft_position INTEGER;
  v_team_count     INTEGER;
  v_picks_so_far   INTEGER;
  v_next_pick      INTEGER;
  v_round          INTEGER;
  v_pos_in_round   INTEGER;
  v_on_clock_pos   INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(p_season_id, p_conference_id);

  SELECT is_active INTO v_is_active FROM conference_drafts
    WHERE season_id = p_season_id AND conference_id = p_conference_id;
  IF NOT COALESCE(v_is_active, FALSE) THEN
    RAISE EXCEPTION 'The draft is not currently active for your conference';
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

  SELECT draft_position INTO v_draft_position FROM team_seasons
    WHERE team_id = p_team_id AND season_id = p_season_id;
  IF v_draft_position IS NULL THEN
    RAISE EXCEPTION 'Your team has no draft position assigned';
  END IF;

  SELECT COUNT(*) INTO v_team_count FROM team_seasons
    WHERE season_id = p_season_id AND conference_id = p_conference_id;

  SELECT COUNT(*) INTO v_picks_so_far FROM draft_log
    WHERE season_id = p_season_id AND conference_id = p_conference_id;

  IF v_team_count <= 0 OR v_picks_so_far >= v_team_count * p_max_slots THEN
    RAISE EXCEPTION 'The draft is complete';
  END IF;

  v_next_pick    := v_picks_so_far + 1;
  v_round        := CEIL(v_next_pick::NUMERIC / v_team_count);
  v_pos_in_round := ((v_next_pick - 1) % v_team_count) + 1;
  v_on_clock_pos := CASE WHEN v_round % 2 = 1 THEN v_pos_in_round ELSE v_team_count + 1 - v_pos_in_round END;

  IF v_on_clock_pos != v_draft_position THEN
    RAISE EXCEPTION 'It is not your team''s turn to pick';
  END IF;

  INSERT INTO rosters (pokemon_id, conference_id, season_id, team_id)
    VALUES (p_pokemon_id, p_conference_id, p_season_id, p_team_id);
  INSERT INTO draft_log (season_id, conference_id, pick_number, team_id, pokemon_id)
    VALUES (p_season_id, p_conference_id, v_next_pick, p_team_id, p_pokemon_id);

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
