-- Enable realtime broadcasts for the tables the draft board subscribes to.
-- rosters was already relied upon by client-side postgres_changes listeners
-- but was never actually added to the publication, so those updates never
-- fired; draft_log and conference_drafts back the new turn-order tracker.
ALTER PUBLICATION supabase_realtime ADD TABLE rosters, draft_log, conference_drafts;
