-- The previous migration changed record_draft_pick's signature (added
-- p_max_slots). CREATE OR REPLACE only replaces a function with the exact
-- same parameter types, so that added a second overload instead of
-- replacing the original — leaving the old 4-argument version (without the
-- roster-full auto-end fix) still live and reachable. Drop it so there's
-- only one record_draft_pick.
DROP FUNCTION IF EXISTS record_draft_pick(INTEGER, INTEGER, INTEGER, INTEGER);
