-- ------------------------------------------------------------
-- TEAM SEASONS: draft_ended_at
-- Set once (never cleared automatically) when a team's draft ends —
-- voluntarily, automatically (out of affordable picks), or by admin
-- force-end. Drives turn-order skipping and the free-agency gate.
-- ------------------------------------------------------------
ALTER TABLE team_seasons ADD COLUMN draft_ended_at TIMESTAMPTZ;

-- Needed so spectators watching the live board see ended-status changes
-- without a refresh, same as rosters/draft_log/conference_drafts already are.
ALTER PUBLICATION supabase_realtime ADD TABLE team_seasons;


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
  p_season_id             INTEGER,
  p_conference_id         INTEGER,
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
-- SUBMIT DRAFT PICK (player-facing) — updated
-- Adds an "already ended your draft" guard, swaps the inline turn-order
-- math for compute_on_clock_team(), and auto-ends the team afterward if
-- no undrafted pokemon in the conference still fits their remaining budget.
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
-- RECORD DRAFT PICK (admin override) — updated
-- Still bypasses turn/budget/ended checks entirely, but now also auto-ends
-- the team afterward if they can no longer afford anything undrafted, so
-- they're correctly skipped by compute_on_clock_team going forward.
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
