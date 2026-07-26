-- ------------------------------------------------------------
-- CONFERENCE DRAFTS
-- Tracks whether a conference's draft is currently live for a season,
-- so the public draft board can highlight whose turn it is.
-- ------------------------------------------------------------
CREATE TABLE conference_drafts (
  season_id     INTEGER NOT NULL REFERENCES seasons(id),
  conference_id INTEGER NOT NULL REFERENCES conferences(id),
  is_active     BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (season_id, conference_id)
);

ALTER TABLE conference_drafts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON conference_drafts FOR SELECT USING (true);


-- ------------------------------------------------------------
-- RECORD DRAFT PICK
-- Atomically adds a pokemon to a team's roster and appends the next
-- sequential pick_number to draft_log. An advisory lock keyed on
-- (season_id, conference_id) keeps concurrent picks from racing on
-- the pick_number computation.
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

  RETURN v_pick_number;
END;
$$;
