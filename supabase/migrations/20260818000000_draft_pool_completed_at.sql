-- ============================================================
-- Distinguish "draft paused" from "draft actually complete."
--
-- Free agency (and every other "is the draft done" check) used to key off
-- started_at set + is_active false — but the admin's manual End Draft
-- toggle sets exactly that combination too, so pausing a draft (or ending
-- it by mistake with zero picks made) silently opened free agency for
-- every team in the pool even though nobody had actually finished
-- drafting. completed_at is a new, separate timestamp stamped exactly once
-- — only when every team in the pool has genuinely ended their own draft
-- (voluntarily, auto-ended, or force-ended) — and is now what actually
-- gates free agency. The admin's manual toggle still starts/pauses/resumes
-- picking, but no longer has any power to open free agency on its own.
-- ============================================================

ALTER TABLE draft_pools ADD COLUMN completed_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION admin_reset_draft_history() RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM match_game_pokemon WHERE true;
  DELETE FROM match_games WHERE true;
  DELETE FROM matches WHERE true;
  DELETE FROM transaction_items WHERE true;
  DELETE FROM transactions WHERE true;
  DELETE FROM draft_log WHERE true;
  DELETE FROM rosters WHERE true;
  UPDATE draft_pools SET is_active = FALSE, started_at = NULL, completed_at = NULL WHERE true;
  UPDATE team_seasons SET draft_ended_at = NULL, fa_tokens_adjustment = 0 WHERE true;
END;
$$;

CREATE OR REPLACE FUNCTION close_draft_pool_if_all_ended(
  p_draft_pool_id INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_total     INTEGER;
  v_remaining INTEGER;
BEGIN
  SELECT COUNT(*), COUNT(*) FILTER (WHERE draft_ended_at IS NULL)
    INTO v_total, v_remaining
    FROM team_seasons WHERE draft_pool_id = p_draft_pool_id;

  -- v_total > 0 guard: an empty pool (no teams assigned yet) would
  -- otherwise vacuously satisfy "remaining = 0" the moment it's started.
  IF v_total > 0 AND v_remaining = 0 THEN
    UPDATE draft_pools
    SET is_active    = FALSE,
        completed_at = COALESCE(completed_at, NOW())
      WHERE id = p_draft_pool_id;
  END IF;
END;
$$;
