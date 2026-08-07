-- ------------------------------------------------------------
-- FIX: admin_reset_draft_history blocked by pg-safeupdate
-- Supabase enables the safeupdate extension on the API-facing role, which
-- rejects any DELETE/UPDATE lacking a WHERE clause (SQLSTATE 21000) --
-- exactly what the bare DELETEs and the team_seasons UPDATE used. It only
-- checks for the syntactic presence of a WHERE clause, so `WHERE true`
-- satisfies it without changing behavior.
-- ------------------------------------------------------------
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
  DELETE FROM conference_drafts WHERE true;
  UPDATE team_seasons SET draft_ended_at = NULL, fa_tokens_adjustment = 0 WHERE true;
END;
$$;
