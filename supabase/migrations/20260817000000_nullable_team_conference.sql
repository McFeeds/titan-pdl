-- ============================================================
-- Allow a team to be placed in a season before it has a conference.
-- Newly created teams are now auto-added to the active season (team_id +
-- season_id only); an admin assigns conference/group afterward. Draft/FA
-- actions already guard against a NULL conference (submit_draft_pick,
-- record_draft_pick raise "Team has no conference assigned this season";
-- resolveCallerTeam() treats it the same as no placement at all).
-- ============================================================

ALTER TABLE team_seasons ALTER COLUMN conference_id DROP NOT NULL;
