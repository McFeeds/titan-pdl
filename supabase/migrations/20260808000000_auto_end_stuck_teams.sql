-- ------------------------------------------------------------
-- AUTO END INELIGIBLE TEAMS
-- Bug fix: auto-end previously only re-evaluated the team that had just
-- made a pick. A team who became unable to continue through no pick of
-- their own (e.g. another team drafted away the last pokemon they could
-- afford while it wasn't their turn) never got flagged -- and since they
-- can't submit a pick either (nothing affordable / no room), nothing ever
-- triggers the check for them, so the draft silently stalls on them
-- forever. This sweeps every not-yet-ended team in the conference on every
-- draft-state change and ends anyone out of room or unable to afford
-- anything left in the pool, regardless of whose turn it technically is.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_end_ineligible_teams(
  p_season_id     INTEGER,
  p_conference_id INTEGER,
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
  WHERE ts.season_id = p_season_id
    AND ts.conference_id = p_conference_id
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
          WHERE r2.pokemon_id = p.id AND r2.conference_id = p_conference_id AND r2.season_id = p_season_id
        )
      )
    );

  PERFORM close_conference_draft_if_all_ended(p_season_id, p_conference_id);
END;
$$;


-- record_draft_pick: swap the picker-only auto-end check for the
-- conference-wide sweep, so a pick that strands ANOTHER team (not just the
-- picker) is caught immediately too. Signature is unchanged from the prior
-- migration -- only the body changes, so this replaces in place.
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
  v_pick_number INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(p_season_id, p_conference_id);

  INSERT INTO rosters (pokemon_id, conference_id, season_id, team_id)
  VALUES (p_pokemon_id, p_conference_id, p_season_id, p_team_id);

  SELECT COALESCE(MAX(pick_number), 0) + 1 INTO v_pick_number
  FROM draft_log
  WHERE season_id = p_season_id AND conference_id = p_conference_id;

  INSERT INTO draft_log (season_id, conference_id, pick_number, team_id, pokemon_id)
  VALUES (p_season_id, p_conference_id, v_pick_number, p_team_id, p_pokemon_id);

  PERFORM auto_end_ineligible_teams(p_season_id, p_conference_id, p_max_slots);

  RETURN v_pick_number;
END;
$$;


-- submit_draft_pick: same replacement; every other validation is unchanged.
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

  PERFORM auto_end_ineligible_teams(p_season_id, p_conference_id, p_max_slots);

  RETURN v_next_pick;
END;
$$;


-- set_conference_draft_active: sweep once on activation, in case the draft
-- is being (re)started with a team already unable to make any legal pick.
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

  IF p_is_active THEN
    PERFORM auto_end_ineligible_teams(p_season_id, p_conference_id);
  END IF;
END;
$$;


-- end_team_draft: sweep afterward too, since one team ending can leave
-- another team newly stranded on a shrunken pool.
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

  PERFORM auto_end_ineligible_teams(p_season_id, v_conference_id);
END;
$$;


-- reactivate_team_draft: sweep afterward too -- if the reactivated team is
-- immediately unable to make a legal pick, this re-ends them right away
-- instead of leaving the draft looking "live" for a team that can't play.
CREATE OR REPLACE FUNCTION reactivate_team_draft(
  p_season_id INTEGER,
  p_team_id   INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_conference_id INTEGER;
BEGIN
  UPDATE team_seasons SET draft_ended_at = NULL
    WHERE team_id = p_team_id AND season_id = p_season_id
    RETURNING conference_id INTO v_conference_id;

  IF v_conference_id IS NOT NULL THEN
    PERFORM auto_end_ineligible_teams(p_season_id, v_conference_id);
  END IF;
END;
$$;
