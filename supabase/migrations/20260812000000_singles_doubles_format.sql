-- ============================================================
-- Season-specific singles+doubles match format
--
-- Adds a per-season match_format flag (default 'bo3' preserves today's
-- behavior for every existing/future season) and a per-game game_type so a
-- 'singles_doubles' season can record a Bo1 singles game and a Bo3 doubles
-- series as two independent components of the same weekly matchup.
-- ============================================================

ALTER TABLE seasons ADD COLUMN match_format TEXT NOT NULL DEFAULT 'bo3'
  CHECK (match_format IN ('bo3', 'singles_doubles'));

ALTER TABLE match_games ADD COLUMN game_type TEXT NOT NULL DEFAULT 'doubles'
  CHECK (game_type IN ('singles', 'doubles'));

-- game_number was unconditionally 1..3; make it type-aware so a singles
-- game (always #1) can coexist with a doubles game #1 on the same match.
ALTER TABLE match_games DROP CONSTRAINT match_games_game_number_check;
ALTER TABLE match_games ADD CONSTRAINT match_games_game_number_check CHECK (
  (game_type = 'singles' AND game_number = 1) OR
  (game_type = 'doubles' AND game_number BETWEEN 1 AND 3)
);

-- UNIQUE(match_id, game_number) would collide between singles game 1 and
-- doubles game 1 on the same match.
ALTER TABLE match_games DROP CONSTRAINT match_games_match_id_game_number_key;
ALTER TABLE match_games ADD CONSTRAINT match_games_match_id_game_type_game_number_key
  UNIQUE (match_id, game_type, game_number);
