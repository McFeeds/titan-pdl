-- ------------------------------------------------------------
-- SUBMIT FREE AGENCY MOVE — updated
-- A team that drops a pokemon can no longer pick that same pokemon back up
-- for the rest of the season (other teams are unaffected).
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
