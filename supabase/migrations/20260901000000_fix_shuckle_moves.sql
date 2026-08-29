-- ============================================================
-- Correct Shuckle's moveset to match Pokemon Showdown's actual
-- national-dex learnset data (verified via a full DB-wide diff
-- against live Showdown learnsets.ts — Shuckle was the only
-- pokemon in the DB that didn't match).
--
-- Add:    Sandstorm, Shell Smash, Sunny Day
-- Remove: Trick Room (not actually in Shuckle's real learnset;
--         this was an unverified guess made when Shuckle was
--         first added to the DB)
-- ============================================================

INSERT INTO pokemon_moves (pokemon_id, move_id)
SELECT p.id, m.id FROM pokemon p, important_moves m
WHERE p.slug = 'shuckle' AND m.slug IN ('sandstorm', 'shell-smash', 'sunny-day')
ON CONFLICT DO NOTHING;

DELETE FROM pokemon_moves
WHERE pokemon_id = (SELECT id FROM pokemon WHERE slug = 'shuckle')
  AND move_id = (SELECT id FROM important_moves WHERE slug = 'trick-room');
