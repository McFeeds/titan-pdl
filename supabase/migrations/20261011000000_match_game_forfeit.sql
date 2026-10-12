-- ============================================================
-- Track forfeited games explicitly on match_games, rather than
-- overloading "replay_url IS NULL" (which already means "admin
-- hasn't entered a replay yet" in the manual-entry flow). A forfeit
-- always has a winner but never a replay or pokemon stats.
-- ============================================================

ALTER TABLE match_games ADD COLUMN is_forfeit BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE match_games ADD CONSTRAINT match_games_forfeit_has_winner
  CHECK (NOT is_forfeit OR winner_team_id IS NOT NULL);
