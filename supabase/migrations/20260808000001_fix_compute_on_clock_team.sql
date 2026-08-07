-- ------------------------------------------------------------
-- COMPUTE ON CLOCK TEAM (rewrite)
-- The previous version replayed rounds 1..max_slots and counted slots,
-- assuming every team's Nth pick landed exactly in round N of a perfectly
-- interleaved sequence. That assumption breaks under an admin override made
-- out of turn, or a team ending with an irregular pick count -- both real,
-- supported flows -- and could hand the turn back to a team that had
-- already ended (draft_ended_at set) because the round/count bookkeeping
-- desynced from reality.
--
-- This rewrite ignores history entirely and just asks: among teams who
-- haven't ended, who is furthest behind on their own picks? Ties are
-- broken by snake order for that "round" (picksMade + 1: odd -> ascending
-- draft_position, even -> descending). This can't return an ended team by
-- construction, and is mathematically equivalent to the old algorithm for
-- any draft that has strictly followed turn order the whole way through.
-- Mirrors computeOnClockTeamId() in src/lib/draft.ts -- keep both in sync.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_on_clock_team(
  p_season_id     INTEGER,
  p_conference_id INTEGER,
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
              WHERE dl.team_id = ts.team_id AND dl.season_id = p_season_id AND dl.conference_id = p_conference_id
           ) AS picks_made
    FROM team_seasons ts
    WHERE ts.season_id = p_season_id AND ts.conference_id = p_conference_id
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
