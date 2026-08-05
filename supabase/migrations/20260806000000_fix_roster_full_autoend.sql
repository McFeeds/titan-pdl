-- ------------------------------------------------------------
-- FIX: auto-end also on a full roster, not just an unaffordable pool.
-- A team that fills all 12 slots with cheap picks while still having
-- points left over was never auto-ended (only "can't afford anything"
-- triggered it), so close_conference_draft_if_all_ended() never saw them
-- as done and the conference draft stayed "active" forever even once
-- every legal pick had been made.
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

  -- Auto-end: roster is now full, or nothing left in the pool fits the
  -- team's remaining budget.
  v_remaining := v_point_budget - (v_spent + v_point_value);
  SELECT EXISTS (
    SELECT 1 FROM pokemon p
    WHERE p.point_value <= v_remaining
      AND NOT EXISTS (
        SELECT 1 FROM rosters r
        WHERE r.pokemon_id = p.id AND r.conference_id = p_conference_id AND r.season_id = p_season_id
      )
  ) INTO v_can_afford_more;

  IF (v_slot_count + 1) >= p_max_slots OR NOT v_can_afford_more THEN
    UPDATE team_seasons SET draft_ended_at = COALESCE(draft_ended_at, NOW())
      WHERE team_id = p_team_id AND season_id = p_season_id;
    PERFORM close_conference_draft_if_all_ended(p_season_id, p_conference_id);
  END IF;

  RETURN v_next_pick;
END;
$$;


CREATE OR REPLACE FUNCTION record_draft_pick(
  p_season_id     INTEGER,
  p_conference_id INTEGER,
  p_team_id       INTEGER,
  p_pokemon_id    INTEGER,
  p_max_slots     INTEGER DEFAULT 12
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_pick_number     INTEGER;
  v_slot_count      INTEGER;
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

  SELECT COUNT(*) INTO v_slot_count FROM rosters
    WHERE team_id = p_team_id AND season_id = p_season_id;

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

  IF v_slot_count >= p_max_slots OR NOT v_can_afford_more THEN
    UPDATE team_seasons SET draft_ended_at = COALESCE(draft_ended_at, NOW())
      WHERE team_id = p_team_id AND season_id = p_season_id;
    PERFORM close_conference_draft_if_all_ended(p_season_id, p_conference_id);
  END IF;

  RETURN v_pick_number;
END;
$$;
