-- ------------------------------------------------------------
-- FA TOKEN ADJUSTMENT
-- Per-team override on top of the season's default fa_tokens, for admin
-- corrections (e.g. "give this team 2 extra tokens"). Effective limit for a
-- team is always seasons.fa_tokens + team_seasons.fa_tokens_adjustment.
-- ------------------------------------------------------------
ALTER TABLE team_seasons ADD COLUMN fa_tokens_adjustment INTEGER NOT NULL DEFAULT 0;

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

  SELECT s.point_budget, s.fa_tokens + COALESCE(ts.fa_tokens_adjustment, 0)
    INTO v_point_budget, v_fa_tokens
    FROM seasons s
    LEFT JOIN team_seasons ts ON ts.season_id = s.id AND ts.team_id = p_team_id
    WHERE s.id = p_season_id;

  IF p_action = 'add' THEN
    IF EXISTS (
      SELECT 1 FROM rosters
      WHERE pokemon_id = p_pokemon_id AND conference_id = p_conference_id AND season_id = p_season_id
    ) THEN
      RAISE EXCEPTION 'That pokemon is already rostered';
    END IF;

    IF EXISTS (
      SELECT 1 FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id
      WHERE t.season_id = p_season_id AND t.type = 'free_agency'
        AND ti.team_id = p_team_id AND ti.pokemon_id = p_pokemon_id AND ti.action = 'drop'
    ) THEN
      RAISE EXCEPTION 'Your team already dropped this pokemon and cannot re-add it this season';
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
-- ADMIN RESET: DRAFT / ROSTER / MATCH HISTORY
-- "Break in case of glass" -- wipes every table that represents draft,
-- roster, free-agency, and match HISTORY, while leaving team, pokemon,
-- conference, group, and season setup (including each team's conference
-- placement and draft position) untouched. Per-team fa_tokens_adjustment is
-- reset to 0 along with draft_ended_at, since both are draft-run state, not
-- season setup. Only ever invoked by an admin from a confirmation-gated UI.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_reset_draft_history() RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM match_game_pokemon;
  DELETE FROM match_games;
  DELETE FROM matches;
  DELETE FROM transaction_items;
  DELETE FROM transactions;
  DELETE FROM draft_log;
  DELETE FROM rosters;
  DELETE FROM conference_drafts;
  UPDATE team_seasons SET draft_ended_at = NULL, fa_tokens_adjustment = 0;
END;
$$;
