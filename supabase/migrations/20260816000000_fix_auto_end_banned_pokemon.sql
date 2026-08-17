-- ============================================================
-- Fix auto_end_ineligible_teams: banned pokemon (point_value = 0) were
-- never excluded from the "is there still an affordable pokemon left"
-- check, so that check always found a banned $0 mon technically within
-- budget and never-yet-drafted (banned mons are never actually draftable),
-- which meant a team could never be auto-ended for running out of
-- affordable picks. Same signature as before, so a straight replace.
-- ============================================================

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
        WHERE p.point_value > 0 -- banned pokemon (0 pts) are never actually draftable
        AND p.point_value <= (
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
