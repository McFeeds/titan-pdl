-- ============================================================
-- Playoff bracket: a single-elimination bracket of team slots per
-- (season, conference). Admin picks a bracket size, which creates an
-- empty slot skeleton for every round; admins then assign a team to
-- any slot (round 1 seeding, and manually advancing winners into
-- later rounds). Publicly readable; only shown on the Schedules page
-- when slots exist for that season/conference.
-- ============================================================

CREATE TABLE playoff_bracket_slots (
  id            SERIAL  PRIMARY KEY,
  season_id     INTEGER NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  conference_id INTEGER NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
  round         INTEGER NOT NULL CHECK (round >= 1),
  position      INTEGER NOT NULL CHECK (position >= 0),
  team_id       INTEGER REFERENCES teams(id) ON DELETE SET NULL,
  UNIQUE (season_id, conference_id, round, position)
);

CREATE INDEX idx_playoff_bracket_slots_season_conf
  ON playoff_bracket_slots (season_id, conference_id);

ALTER TABLE playoff_bracket_slots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON playoff_bracket_slots FOR SELECT USING (true);
