ALTER TABLE team_members ADD COLUMN showdown_name TEXT;

-- Carry forward existing showdown names to the migrated member rows
UPDATE team_members tm
SET showdown_name = t.showdown_name
FROM teams t
WHERE tm.team_id = t.id;

ALTER TABLE teams DROP COLUMN showdown_name;
