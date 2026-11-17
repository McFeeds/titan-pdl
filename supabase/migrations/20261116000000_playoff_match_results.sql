-- ============================================================
-- Playoff match results: a lightweight result (binary winner +
-- replay links) for a single bracket matchup, distinct from the
-- regular-season matches/match_games tables -- no per-game stats, no
-- singles/doubles breakdown, just who won and where the replays are.
-- One row per (season, round, match_index); match_index is the
-- matchup's position within its round (slots 2*match_index and
-- 2*match_index+1 in playoff_bracket_slots are its two participants).
-- ============================================================

CREATE TABLE playoff_matches (
  id             SERIAL      PRIMARY KEY,
  season_id      INTEGER     NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  round          INTEGER     NOT NULL CHECK (round >= 1),
  match_index    INTEGER     NOT NULL CHECK (match_index >= 0),
  winner_team_id INTEGER     NOT NULL REFERENCES teams(id),
  submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (season_id, round, match_index)
);

CREATE INDEX idx_playoff_matches_season ON playoff_matches (season_id);

CREATE TABLE playoff_match_replays (
  id               SERIAL  PRIMARY KEY,
  playoff_match_id INTEGER NOT NULL REFERENCES playoff_matches(id) ON DELETE CASCADE,
  url              TEXT    NOT NULL,
  position         INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_playoff_match_replays_match ON playoff_match_replays (playoff_match_id);

ALTER TABLE playoff_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE playoff_match_replays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON playoff_matches FOR SELECT USING (true);
CREATE POLICY "Public read" ON playoff_match_replays FOR SELECT USING (true);
