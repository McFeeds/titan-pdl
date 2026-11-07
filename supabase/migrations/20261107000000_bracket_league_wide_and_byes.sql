-- ============================================================
-- Playoff bracket is league-wide, not per-conference: drop
-- conference_id and rescope the unique constraint to (season_id,
-- round, position). Table is still empty in production (no bracket
-- has been configured yet), so this is a clean structural change,
-- not a data migration.
-- ============================================================

ALTER TABLE playoff_bracket_slots DROP CONSTRAINT playoff_bracket_slots_season_id_conference_id_round_positio_key;
ALTER TABLE playoff_bracket_slots DROP COLUMN conference_id;
ALTER TABLE playoff_bracket_slots ADD CONSTRAINT playoff_bracket_slots_season_id_round_position_key
  UNIQUE (season_id, round, position);
