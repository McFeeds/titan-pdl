-- New junction table: many discord users → one team
CREATE TABLE team_members (
  discord_id TEXT    NOT NULL,
  team_id    INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  PRIMARY KEY (discord_id, team_id)
);

-- Migrate existing discord_ids before dropping the column
INSERT INTO team_members (discord_id, team_id)
SELECT discord_id, id FROM teams;

ALTER TABLE teams DROP COLUMN discord_id;

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON team_members FOR SELECT USING (true);
