-- ============================================================
-- Titan PDL — Database Schema
-- ============================================================

-- ------------------------------------------------------------
-- SEASONS
-- ------------------------------------------------------------
CREATE TABLE seasons (
  id           SERIAL      PRIMARY KEY,
  name         TEXT        NOT NULL,
  is_active    BOOLEAN     NOT NULL DEFAULT FALSE,
  point_budget INTEGER     NOT NULL DEFAULT 115,
  fa_tokens    INTEGER     NOT NULL DEFAULT 3,
  -- 'bo3' (default) is the standard format used by every season unless an
  -- admin opts a specific season into 'singles_doubles' (a Bo1 singles game
  -- + a Bo3 doubles series, each worth its own win/loss).
  match_format TEXT        NOT NULL DEFAULT 'bo3' CHECK (match_format IN ('bo3', 'singles_doubles')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Only one season can be active at a time.
CREATE UNIQUE INDEX idx_seasons_one_active
  ON seasons (is_active)
  WHERE is_active = TRUE;


-- ------------------------------------------------------------
-- POKEMON
-- ------------------------------------------------------------
CREATE TABLE pokemon (
  id             SERIAL  PRIMARY KEY,
  dex_number     INTEGER,
  name           TEXT    NOT NULL,
  slug           TEXT    NOT NULL UNIQUE,
  type_1         TEXT    NOT NULL,
  type_2         TEXT,
  ability_1      TEXT    NOT NULL,
  ability_2      TEXT,
  hidden_ability TEXT,
  hp             INTEGER NOT NULL,
  atk            INTEGER NOT NULL,
  def            INTEGER NOT NULL,
  spa            INTEGER NOT NULL,
  spd            INTEGER NOT NULL,
  spe            INTEGER NOT NULL,
  point_value    INTEGER NOT NULL
);


-- ------------------------------------------------------------
-- IMPORTANT MOVES
-- ------------------------------------------------------------
CREATE TABLE important_moves (
  id   SERIAL PRIMARY KEY,
  name TEXT   NOT NULL UNIQUE,
  slug TEXT   NOT NULL UNIQUE
);


-- ------------------------------------------------------------
-- POKEMON ↔ MOVES  (junction)
-- ------------------------------------------------------------
CREATE TABLE pokemon_moves (
  pokemon_id INTEGER NOT NULL REFERENCES pokemon(id)         ON DELETE CASCADE,
  move_id    INTEGER NOT NULL REFERENCES important_moves(id) ON DELETE CASCADE,
  PRIMARY KEY (pokemon_id, move_id)
);

CREATE INDEX idx_pokemon_moves_move ON pokemon_moves (move_id);


-- ------------------------------------------------------------
-- CONFERENCES  (Hoenn, Sinnoh, …)
-- ------------------------------------------------------------
CREATE TABLE conferences (
  id   SERIAL PRIMARY KEY,
  name TEXT   NOT NULL UNIQUE
);


-- ------------------------------------------------------------
-- GROUPS  (Ruby, Sapphire, …)
-- ------------------------------------------------------------
CREATE TABLE groups (
  id            SERIAL  PRIMARY KEY,
  conference_id INTEGER NOT NULL REFERENCES conferences(id),
  name          TEXT    NOT NULL,
  UNIQUE (conference_id, name)
);

CREATE INDEX idx_groups_conference ON groups (conference_id);


-- ------------------------------------------------------------
-- TEAMS
-- ------------------------------------------------------------
CREATE TABLE teams (
  id             SERIAL      PRIMARY KEY,
  team_name      TEXT        NOT NULL,
  logo_url       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ------------------------------------------------------------
-- ROSTERS
-- A pokemon_id may appear at most once per conference per season.
-- ------------------------------------------------------------
CREATE TABLE rosters (
  pokemon_id    INTEGER NOT NULL REFERENCES pokemon(id),
  conference_id INTEGER NOT NULL REFERENCES conferences(id),
  season_id     INTEGER NOT NULL REFERENCES seasons(id),
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  nickname      TEXT,
  PRIMARY KEY (pokemon_id, conference_id, season_id)
);

CREATE INDEX idx_rosters_team    ON rosters (team_id, season_id);
CREATE INDEX idx_rosters_conf    ON rosters (conference_id, season_id);


-- ------------------------------------------------------------
-- DRAFT POOLS
-- The unit of "who drafts together, in what order, starting when" — an
-- admin-defined set of teams, independent of conference/group (which stay
-- purely for standings and rostering). A pool can equal one conference (the
-- common case), one group, several groups spanning different conferences,
-- or any hand-picked set of teams. Tracks whether a pool's draft is
-- currently live, so the public draft board can highlight whose turn it is.
-- ------------------------------------------------------------
CREATE TABLE draft_pools (
  id         SERIAL      PRIMARY KEY,
  season_id  INTEGER     NOT NULL REFERENCES seasons(id),
  name       TEXT        NOT NULL,
  is_active  BOOLEAN     NOT NULL DEFAULT FALSE,
  -- Set once, never cleared. Distinguishes "never started" (NULL) from
  -- "started, then ended" (NOT NULL AND is_active = false) — both look like
  -- is_active = false alone. Drives the pre-draft free-agency lock.
  started_at TIMESTAMPTZ,
  UNIQUE (season_id, name)
);


-- ------------------------------------------------------------
-- DRAFT LOG
-- ------------------------------------------------------------
CREATE TABLE draft_log (
  id            SERIAL      PRIMARY KEY,
  season_id     INTEGER     NOT NULL REFERENCES seasons(id),
  -- Pick numbers are sequenced per pool, not per conference (a pool can
  -- span multiple conferences).
  draft_pool_id INTEGER     NOT NULL REFERENCES draft_pools(id),
  -- Captured from the picking team's own conference_id at pick time — still
  -- drives the per-conference pokemon-uniqueness rule below.
  conference_id INTEGER     NOT NULL REFERENCES conferences(id),
  pick_number   INTEGER     NOT NULL,
  team_id       INTEGER     NOT NULL REFERENCES teams(id),
  pokemon_id    INTEGER     NOT NULL REFERENCES pokemon(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Each pick number is unique within a draft pool
  UNIQUE (draft_pool_id, pick_number),
  -- A pokemon can only be drafted once per conference per season
  UNIQUE (season_id, conference_id, pokemon_id)
);

CREATE INDEX idx_draft_log_season_conf ON draft_log (season_id, conference_id);
CREATE INDEX idx_draft_log_pool        ON draft_log (draft_pool_id);


-- ------------------------------------------------------------
-- CLOSE DRAFT POOL IF ALL ENDED
-- If every team in a pool has now ended their draft, flip the pool to
-- inactive (started_at stays set, so it flows into free agency — same end
-- state as the admin's End Draft toggle).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION close_draft_pool_if_all_ended(
  p_draft_pool_id INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_remaining FROM team_seasons
    WHERE draft_pool_id = p_draft_pool_id AND draft_ended_at IS NULL;

  IF v_remaining = 0 THEN
    UPDATE draft_pools SET is_active = FALSE
      WHERE id = p_draft_pool_id AND is_active = TRUE;
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- AUTO END INELIGIBLE TEAMS
-- Sweeps every not-yet-ended team in the pool on every draft-state change
-- and ends anyone out of room or unable to afford anything left in their
-- own conference's pool, regardless of whose turn it technically is. Needed
-- because a team can become stuck through no pick of their own (another
-- team drafts away the last pokemon they could afford while it wasn't their
-- turn) -- and since they can't submit a pick either, nothing else would
-- ever trigger the check for them. The affordability check uses each row's
-- own ts.conference_id (not a single pool-wide value), since availability
-- stays per-conference even when a pool spans multiple conferences.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION auto_end_ineligible_teams(
  p_season_id     INTEGER,
  p_draft_pool_id INTEGER,
  p_max_slots     INTEGER DEFAULT 12
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_point_budget INTEGER;
BEGIN
  SELECT point_budget INTO v_point_budget FROM seasons WHERE id = p_season_id;

  UPDATE team_seasons ts
  SET draft_ended_at = NOW()
  WHERE ts.draft_pool_id = p_draft_pool_id
    AND ts.draft_ended_at IS NULL
    AND (
      (SELECT COUNT(*) FROM rosters r WHERE r.team_id = ts.team_id AND r.season_id = p_season_id) >= p_max_slots
      OR NOT EXISTS (
        SELECT 1 FROM pokemon p
        WHERE p.point_value <= (
          v_point_budget - COALESCE((
            SELECT SUM(po.point_value) FROM rosters r JOIN pokemon po ON po.id = r.pokemon_id
            WHERE r.team_id = ts.team_id AND r.season_id = p_season_id
          ), 0)
        )
        AND NOT EXISTS (
          SELECT 1 FROM rosters r2
          WHERE r2.pokemon_id = p.id AND r2.conference_id = ts.conference_id AND r2.season_id = p_season_id
        )
      )
    );

  PERFORM close_draft_pool_if_all_ended(p_draft_pool_id);
END;
$$;


-- ------------------------------------------------------------
-- COMPUTE ON CLOCK TEAM
-- Among teams who haven't ended, whoever is furthest behind on their own
-- picks goes next; ties broken by snake order for that "round" (picksMade+1:
-- odd -> ascending draft_position, even -> descending). Ignoring ended teams
-- entirely (rather than replaying rounds and counting slots) makes it
-- immune to desync from an admin override made out of turn or a team
-- ending with an irregular pick count -- an earlier round-counting version
-- could hand the turn back to an already-ended team when history didn't
-- interleave perfectly.
-- Mirrors computeOnClockTeamId() in src/lib/draft.ts — keep both in sync.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION compute_on_clock_team(
  p_draft_pool_id INTEGER,
  p_max_slots     INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_team_id INTEGER;
BEGIN
  SELECT team_id INTO v_team_id
  FROM (
    SELECT ts.team_id, ts.draft_position,
           (SELECT COUNT(*) FROM draft_log dl
              WHERE dl.team_id = ts.team_id AND dl.draft_pool_id = p_draft_pool_id
           ) AS picks_made
    FROM team_seasons ts
    WHERE ts.draft_pool_id = p_draft_pool_id
      AND ts.draft_position IS NOT NULL AND ts.draft_ended_at IS NULL
  ) eligible
  WHERE picks_made < p_max_slots
  ORDER BY
    picks_made ASC,
    CASE WHEN (picks_made + 1) % 2 = 1 THEN draft_position ELSE -draft_position END ASC
  LIMIT 1;

  RETURN v_team_id; -- NULL when no eligible team remains (draft complete)
END;
$$;


-- ------------------------------------------------------------
-- END TEAM DRAFT
-- Used identically by a team's voluntary end and an admin's force-end —
-- the TS layer decides who's allowed to call it for which team.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION end_team_draft(
  p_season_id INTEGER,
  p_team_id   INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_draft_pool_id INTEGER;
BEGIN
  SELECT draft_pool_id INTO v_draft_pool_id FROM team_seasons
    WHERE team_id = p_team_id AND season_id = p_season_id;
  IF v_draft_pool_id IS NULL THEN
    RAISE EXCEPTION 'Team has no draft pool assigned this season';
  END IF;

  PERFORM pg_advisory_xact_lock(p_season_id, v_draft_pool_id);

  UPDATE team_seasons SET draft_ended_at = COALESCE(draft_ended_at, NOW())
    WHERE team_id = p_team_id AND season_id = p_season_id;

  PERFORM auto_end_ineligible_teams(p_season_id, v_draft_pool_id);
END;
$$;


-- ------------------------------------------------------------
-- REACTIVATE TEAM DRAFT
-- Manual admin undo of an end (voluntary, auto, or forced). Sweeps
-- afterward too -- if the reactivated team is immediately unable to make a
-- legal pick, this re-ends them right away instead of leaving the draft
-- looking "live" for a team that can't actually play.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION reactivate_team_draft(
  p_season_id INTEGER,
  p_team_id   INTEGER
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_draft_pool_id INTEGER;
BEGIN
  UPDATE team_seasons SET draft_ended_at = NULL
    WHERE team_id = p_team_id AND season_id = p_season_id
    RETURNING draft_pool_id INTO v_draft_pool_id;

  IF v_draft_pool_id IS NOT NULL THEN
    PERFORM auto_end_ineligible_teams(p_season_id, v_draft_pool_id);
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- REVERT DRAFT TO PICK
-- Deletes every pick (and its roster entry) logged after the given pick
-- number for a draft pool. Pick numbers stay contiguous since only the
-- tail is ever trimmed, so no renumbering is needed. Roster rows are
-- matched on the exact (pokemon_id, conference_id, season_id) triple from
-- the reverted picks, which stays precise even when the pool spans multiple
-- conferences. Does not touch draft_ended_at or draft_pools.is_active —
-- those are separate, already-existing admin controls to pair with a
-- revert if needed.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION revert_draft_to_pick(
  p_season_id              INTEGER,
  p_draft_pool_id          INTEGER,
  p_keep_up_to_pick_number INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(p_season_id, p_draft_pool_id);

  DELETE FROM rosters r
  USING draft_log dl
  WHERE dl.draft_pool_id = p_draft_pool_id
    AND dl.pick_number > p_keep_up_to_pick_number
    AND r.pokemon_id = dl.pokemon_id
    AND r.conference_id = dl.conference_id
    AND r.season_id = dl.season_id;

  DELETE FROM draft_log
  WHERE draft_pool_id = p_draft_pool_id
    AND pick_number > p_keep_up_to_pick_number;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN v_deleted;
END;
$$;


-- ------------------------------------------------------------
-- RECORD DRAFT PICK
-- Atomically adds a pokemon to a team's roster and appends the next
-- sequential pick_number to draft_log. An advisory lock keyed on
-- (season_id, draft_pool_id) keeps concurrent picks from racing on the
-- pick_number computation. Resolves the team's own conference_id for the
-- rosters insert and the per-conference draft_log uniqueness. Afterward
-- sweeps the whole pool via auto_end_ineligible_teams() so any team out of
-- room or budget -- not just the picker -- is skipped going forward and
-- close_draft_pool_if_all_ended() can actually see the draft finish.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_draft_pick(
  p_season_id     INTEGER,
  p_draft_pool_id INTEGER,
  p_team_id       INTEGER,
  p_pokemon_id    INTEGER,
  p_max_slots     INTEGER DEFAULT 12
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_conference_id INTEGER;
  v_pick_number   INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(p_season_id, p_draft_pool_id);

  SELECT conference_id INTO v_conference_id FROM team_seasons
    WHERE team_id = p_team_id AND season_id = p_season_id;
  IF v_conference_id IS NULL THEN
    RAISE EXCEPTION 'Team has no conference assigned this season';
  END IF;

  INSERT INTO rosters (pokemon_id, conference_id, season_id, team_id)
  VALUES (p_pokemon_id, v_conference_id, p_season_id, p_team_id);

  SELECT COALESCE(MAX(pick_number), 0) + 1 INTO v_pick_number
  FROM draft_log
  WHERE draft_pool_id = p_draft_pool_id;

  INSERT INTO draft_log (season_id, draft_pool_id, conference_id, pick_number, team_id, pokemon_id)
  VALUES (p_season_id, p_draft_pool_id, v_conference_id, v_pick_number, p_team_id, p_pokemon_id);

  PERFORM auto_end_ineligible_teams(p_season_id, p_draft_pool_id, p_max_slots);

  RETURN v_pick_number;
END;
$$;


-- ------------------------------------------------------------
-- SET DRAFT POOL ACTIVE
-- Stamps started_at exactly once, atomically, the first time a pool's
-- draft is activated. Used by the admin panel. Pools are admin-created rows
-- (unlike the old conference_drafts, which upserted lazily), so this is a
-- plain UPDATE. Sweeps once on activation, in case the draft is being
-- (re)started with a team already unable to make any legal pick.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_draft_pool_active(
  p_draft_pool_id INTEGER,
  p_is_active     BOOLEAN
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_season_id INTEGER;
BEGIN
  UPDATE draft_pools
  SET is_active  = p_is_active,
      started_at = COALESCE(started_at, CASE WHEN p_is_active THEN NOW() END)
  WHERE id = p_draft_pool_id
  RETURNING season_id INTO v_season_id;

  IF p_is_active AND v_season_id IS NOT NULL THEN
    PERFORM auto_end_ineligible_teams(v_season_id, p_draft_pool_id);
  END IF;
END;
$$;


-- ------------------------------------------------------------
-- SUBMIT DRAFT PICK (player-facing)
-- Same mutation as record_draft_pick, but under the same advisory lock also
-- re-validates: draft is active, caller hasn't already ended their draft,
-- it's this team's turn (compute_on_clock_team — mirrors
-- computeOnClockTeamId() in src/lib/draft.ts, keep both in sync), pokemon
-- isn't already drafted in the team's own conference, roster has room, and
-- the pick fits the season's point budget. Afterward sweeps the whole pool
-- via auto_end_ineligible_teams() so any team out of room or budget -- not
-- just the picker -- is skipped going forward. record_draft_pick gets the
-- same treatment but skips the turn/ended checks (admin override).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_draft_pick(
  p_season_id     INTEGER,
  p_draft_pool_id INTEGER,
  p_team_id       INTEGER,
  p_pokemon_id    INTEGER,
  p_max_slots     INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_active       BOOLEAN;
  v_draft_ended_at  TIMESTAMPTZ;
  v_conference_id   INTEGER;
  v_point_budget    INTEGER;
  v_point_value     INTEGER;
  v_spent           INTEGER;
  v_slot_count      INTEGER;
  v_next_pick       INTEGER;
  v_on_clock_team   INTEGER;
BEGIN
  PERFORM pg_advisory_xact_lock(p_season_id, p_draft_pool_id);

  SELECT is_active INTO v_is_active FROM draft_pools WHERE id = p_draft_pool_id;
  IF NOT COALESCE(v_is_active, FALSE) THEN
    RAISE EXCEPTION 'The draft is not currently active for your pool';
  END IF;

  SELECT draft_ended_at, conference_id INTO v_draft_ended_at, v_conference_id FROM team_seasons
    WHERE team_id = p_team_id AND season_id = p_season_id;
  IF v_draft_ended_at IS NOT NULL THEN
    RAISE EXCEPTION 'You have ended your draft';
  END IF;
  IF v_conference_id IS NULL THEN
    RAISE EXCEPTION 'Team has no conference assigned this season';
  END IF;

  IF EXISTS (
    SELECT 1 FROM rosters
    WHERE pokemon_id = p_pokemon_id AND conference_id = v_conference_id AND season_id = p_season_id
  ) THEN
    RAISE EXCEPTION 'That pokemon has already been drafted';
  END IF;

  SELECT point_value INTO v_point_value FROM pokemon WHERE id = p_pokemon_id;
  IF v_point_value IS NULL THEN RAISE EXCEPTION 'Pokemon not found'; END IF;
  IF v_point_value = 0 THEN RAISE EXCEPTION 'That pokemon is banned'; END IF;

  SELECT COUNT(*) INTO v_slot_count FROM rosters
    WHERE team_id = p_team_id AND season_id = p_season_id;
  IF v_slot_count >= p_max_slots THEN RAISE EXCEPTION 'Your roster is full'; END IF;

  SELECT point_budget INTO v_point_budget FROM seasons WHERE id = p_season_id;
  SELECT COALESCE(SUM(po.point_value), 0) INTO v_spent
    FROM rosters r JOIN pokemon po ON po.id = r.pokemon_id
    WHERE r.team_id = p_team_id AND r.season_id = p_season_id;
  IF v_spent + v_point_value > v_point_budget THEN
    RAISE EXCEPTION 'Not enough points remaining';
  END IF;

  v_on_clock_team := compute_on_clock_team(p_draft_pool_id, p_max_slots);
  IF v_on_clock_team IS NULL THEN
    RAISE EXCEPTION 'The draft is complete';
  END IF;
  IF v_on_clock_team != p_team_id THEN
    RAISE EXCEPTION 'It is not your team''s turn to pick';
  END IF;

  SELECT COALESCE(MAX(pick_number), 0) + 1 INTO v_next_pick
  FROM draft_log
  WHERE draft_pool_id = p_draft_pool_id;

  INSERT INTO rosters (pokemon_id, conference_id, season_id, team_id)
    VALUES (p_pokemon_id, v_conference_id, p_season_id, p_team_id);
  INSERT INTO draft_log (season_id, draft_pool_id, conference_id, pick_number, team_id, pokemon_id)
    VALUES (p_season_id, p_draft_pool_id, v_conference_id, v_next_pick, p_team_id, p_pokemon_id);

  PERFORM auto_end_ineligible_teams(p_season_id, p_draft_pool_id, p_max_slots);

  RETURN v_next_pick;
END;
$$;


-- ------------------------------------------------------------
-- SUBMIT FREE AGENCY MOVE (player-facing add/drop, post-draft)
-- A team that drops a pokemon can never pick that same pokemon back up for
-- the rest of the season (other teams are unaffected). Token limit is the
-- season default plus that team's fa_tokens_adjustment (admin correction).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION submit_free_agency_move(
  p_season_id     INTEGER,
  p_conference_id INTEGER,
  p_team_id       INTEGER,
  p_pokemon_id    INTEGER,
  p_action        TEXT,   -- 'add' | 'drop'
  p_max_slots     INTEGER
) RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_point_budget   INTEGER;
  v_fa_tokens      INTEGER;
  v_point_value    INTEGER;
  v_spent          INTEGER;
  v_slot_count     INTEGER;
  v_tokens_used    INTEGER;
  v_transaction_id INTEGER;
BEGIN
  IF p_action NOT IN ('add', 'drop') THEN RAISE EXCEPTION 'Invalid free agency action'; END IF;

  PERFORM pg_advisory_xact_lock(p_season_id, p_team_id);

  SELECT point_value INTO v_point_value FROM pokemon WHERE id = p_pokemon_id;
  IF v_point_value IS NULL THEN RAISE EXCEPTION 'Pokemon not found'; END IF;

  SELECT s.point_budget, s.fa_tokens + COALESCE(ts.fa_tokens_adjustment, 0)
    INTO v_point_budget, v_fa_tokens
    FROM seasons s
    LEFT JOIN team_seasons ts ON ts.season_id = s.id AND ts.team_id = p_team_id
    WHERE s.id = p_season_id;

  IF p_action = 'add' THEN
    IF v_point_value = 0 THEN RAISE EXCEPTION 'That pokemon is banned'; END IF;

    IF EXISTS (
      SELECT 1 FROM rosters
      WHERE pokemon_id = p_pokemon_id AND conference_id = p_conference_id AND season_id = p_season_id
    ) THEN
      RAISE EXCEPTION 'That pokemon is already rostered';
    END IF;

    IF EXISTS (
      SELECT 1 FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id
      WHERE t.season_id = p_season_id AND t.type = 'free_agency'
        AND ti.team_id = p_team_id AND ti.pokemon_id = p_pokemon_id AND ti.action = 'drop'
    ) THEN
      RAISE EXCEPTION 'Your team already dropped this pokemon and cannot re-add it this season';
    END IF;

    SELECT COUNT(*) INTO v_slot_count FROM rosters
      WHERE team_id = p_team_id AND season_id = p_season_id;
    IF v_slot_count >= p_max_slots THEN RAISE EXCEPTION 'Your roster is full'; END IF;

    SELECT COALESCE(SUM(po.point_value), 0) INTO v_spent
      FROM rosters r JOIN pokemon po ON po.id = r.pokemon_id
      WHERE r.team_id = p_team_id AND r.season_id = p_season_id;
    IF v_spent + v_point_value > v_point_budget THEN
      RAISE EXCEPTION 'Not enough points remaining';
    END IF;

    SELECT COUNT(*) INTO v_tokens_used
      FROM transaction_items ti JOIN transactions t ON t.id = ti.transaction_id
      WHERE t.season_id = p_season_id AND t.type = 'free_agency'
        AND ti.team_id = p_team_id AND ti.action = 'add';
    IF v_tokens_used >= v_fa_tokens THEN
      RAISE EXCEPTION 'No free agency tokens remaining';
    END IF;

    INSERT INTO transactions (season_id, type) VALUES (p_season_id, 'free_agency')
      RETURNING id INTO v_transaction_id;
    INSERT INTO transaction_items (transaction_id, team_id, pokemon_id, action, points_delta)
      VALUES (v_transaction_id, p_team_id, p_pokemon_id, 'add', -v_point_value);
    INSERT INTO rosters (pokemon_id, conference_id, season_id, team_id)
      VALUES (p_pokemon_id, p_conference_id, p_season_id, p_team_id);

  ELSE -- drop
    IF NOT EXISTS (
      SELECT 1 FROM rosters
      WHERE pokemon_id = p_pokemon_id AND conference_id = p_conference_id
        AND season_id = p_season_id AND team_id = p_team_id
    ) THEN
      RAISE EXCEPTION 'That pokemon is not on your roster';
    END IF;

    INSERT INTO transactions (season_id, type) VALUES (p_season_id, 'free_agency')
      RETURNING id INTO v_transaction_id;
    INSERT INTO transaction_items (transaction_id, team_id, pokemon_id, action, points_delta)
      VALUES (v_transaction_id, p_team_id, p_pokemon_id, 'drop', v_point_value);
    DELETE FROM rosters
      WHERE pokemon_id = p_pokemon_id AND conference_id = p_conference_id
        AND season_id = p_season_id AND team_id = p_team_id;
  END IF;

  RETURN v_transaction_id;
END;
$$;


-- ------------------------------------------------------------
-- TRANSACTIONS  (header)
-- ------------------------------------------------------------
CREATE TABLE transactions (
  id         SERIAL      PRIMARY KEY,
  season_id  INTEGER     NOT NULL REFERENCES seasons(id),
  type       TEXT        NOT NULL CHECK (type IN ('free_agency', 'trade')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_season ON transactions (season_id);


-- ------------------------------------------------------------
-- TRANSACTION ITEMS  (one row per pokemon per team per transaction)
-- points_delta: negative = points spent, positive = points gained
-- ------------------------------------------------------------
CREATE TABLE transaction_items (
  id             SERIAL  PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  pokemon_id     INTEGER NOT NULL REFERENCES pokemon(id),
  action         TEXT    NOT NULL CHECK (action IN ('add', 'drop')),
  points_delta   INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_tx_items_transaction ON transaction_items (transaction_id);
CREATE INDEX idx_tx_items_team        ON transaction_items (team_id);


-- ------------------------------------------------------------
-- TEAM SEASONS  (season-specific placement — conference, group, draft order)
-- Replaces conference_id/group_id/draft_position on teams so those
-- attributes can differ across seasons.
-- ------------------------------------------------------------
CREATE TABLE team_seasons (
  team_id        INTEGER NOT NULL REFERENCES teams(id),
  season_id      INTEGER NOT NULL REFERENCES seasons(id),
  conference_id  INTEGER NOT NULL REFERENCES conferences(id),
  group_id       INTEGER REFERENCES groups(id),
  -- Which draft pool this team drafts in this season — independent of
  -- conference/group, which stay purely for standings and rostering. See
  -- DRAFT POOLS below.
  draft_pool_id  INTEGER REFERENCES draft_pools(id),
  draft_position INTEGER,
  -- Set once (never cleared automatically) when a team's draft ends —
  -- voluntarily, automatically (out of affordable picks), or by admin
  -- force-end. Drives turn-order skipping and the free-agency gate.
  draft_ended_at TIMESTAMPTZ,
  -- Admin correction on top of the season's default fa_tokens. Effective
  -- limit for a team is always seasons.fa_tokens + this value.
  fa_tokens_adjustment INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (team_id, season_id)
);

CREATE INDEX idx_team_seasons_season ON team_seasons (season_id);
CREATE INDEX idx_team_seasons_conf   ON team_seasons (season_id, conference_id);


-- ------------------------------------------------------------
-- TEAM MEMBERS  (human players per team per season)
-- ------------------------------------------------------------
CREATE TABLE team_members (
  id            SERIAL  PRIMARY KEY,
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  season_id     INTEGER NOT NULL REFERENCES seasons(id),
  discord_id    TEXT    NOT NULL,
  showdown_name TEXT,
  role          TEXT    NOT NULL CHECK (role IN ('owner', 'co_owner', 'manager')),
  UNIQUE (team_id, season_id, discord_id)
);

CREATE INDEX idx_team_members_team_season ON team_members (team_id, season_id);


-- ------------------------------------------------------------
-- MATCHES  (one row per weekly matchup)
-- ------------------------------------------------------------
CREATE TABLE matches (
  id           SERIAL      PRIMARY KEY,
  season_id    INTEGER     NOT NULL REFERENCES seasons(id),
  week_number  INTEGER     NOT NULL,
  home_team_id INTEGER     NOT NULL REFERENCES teams(id),
  away_team_id INTEGER     NOT NULL REFERENCES teams(id),
  played_at    TIMESTAMPTZ,
  UNIQUE (season_id, week_number, home_team_id, away_team_id)
);

CREATE INDEX idx_matches_season      ON matches (season_id);
CREATE INDEX idx_matches_season_week ON matches (season_id, week_number);
CREATE INDEX idx_matches_home_team   ON matches (home_team_id);
CREATE INDEX idx_matches_away_team   ON matches (away_team_id);


-- ------------------------------------------------------------
-- MATCH GAMES  (individual games within a match)
--
-- For 'bo3' seasons this is a single up-to-3-game doubles series
-- (game_type defaults to 'doubles', game_number 1-3). For 'singles_doubles'
-- seasons a match holds two independent components: one 'singles' game
-- (always game_number 1) and up to three 'doubles' games (game_number 1-3).
-- ------------------------------------------------------------
CREATE TABLE match_games (
  id             SERIAL  PRIMARY KEY,
  match_id       INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  game_number    INTEGER NOT NULL,
  game_type      TEXT    NOT NULL DEFAULT 'doubles' CHECK (game_type IN ('singles', 'doubles')),
  winner_team_id INTEGER REFERENCES teams(id),
  replay_url     TEXT,
  CHECK (
    (game_type = 'singles' AND game_number = 1) OR
    (game_type = 'doubles' AND game_number BETWEEN 1 AND 3)
  ),
  UNIQUE (match_id, game_type, game_number)
);

CREATE INDEX idx_match_games_match ON match_games (match_id);


-- ------------------------------------------------------------
-- MATCH GAME POKEMON  (pokemon brought per team per game + per-game stats)
-- Row existence implies the pokemon was brought to that game.
-- ------------------------------------------------------------
CREATE TABLE match_game_pokemon (
  id            SERIAL  PRIMARY KEY,
  match_game_id INTEGER NOT NULL REFERENCES match_games(id) ON DELETE CASCADE,
  team_id       INTEGER NOT NULL REFERENCES teams(id),
  pokemon_id    INTEGER NOT NULL REFERENCES pokemon(id),
  kills         INTEGER NOT NULL DEFAULT 0,
  deaths        INTEGER NOT NULL DEFAULT 0,
  UNIQUE (match_game_id, team_id, pokemon_id)
);

CREATE INDEX idx_mgp_game    ON match_game_pokemon (match_game_id);
CREATE INDEX idx_mgp_team    ON match_game_pokemon (team_id);
CREATE INDEX idx_mgp_pokemon ON match_game_pokemon (pokemon_id);


-- ============================================================
-- VIEWS  (derived stats — no redundant storage)
-- ============================================================

-- Home/away game counts per match, derived from match_games.
CREATE VIEW match_results AS
SELECT
  m.id            AS match_id,
  m.season_id,
  m.week_number,
  m.home_team_id,
  m.away_team_id,
  COUNT(*) FILTER (WHERE mg.winner_team_id = m.home_team_id) AS home_games_won,
  COUNT(*) FILTER (WHERE mg.winner_team_id = m.away_team_id) AS away_games_won
FROM matches m
LEFT JOIN match_games mg ON mg.match_id = m.id
GROUP BY m.id, m.season_id, m.week_number, m.home_team_id, m.away_team_id;


-- W/L record per team per season. A match is won by taking 2+ games in the BO3.
CREATE VIEW team_records AS
WITH sides AS (
  SELECT season_id, home_team_id AS team_id, (home_games_won >= 2) AS won
  FROM match_results
  UNION ALL
  SELECT season_id, away_team_id AS team_id, (away_games_won >= 2) AS won
  FROM match_results
)
SELECT
  season_id,
  team_id,
  COUNT(*) FILTER (WHERE won)      AS wins,
  COUNT(*) FILTER (WHERE NOT won)  AS losses
FROM sides
GROUP BY season_id, team_id;


-- Aggregated pokemon stats per team per season.
-- `brought` = number of individual games the pokemon appeared in.
CREATE VIEW pokemon_season_stats AS
SELECT
  m.season_id,
  mgp.team_id,
  mgp.pokemon_id,
  COUNT(*)        AS brought,
  SUM(mgp.kills)  AS kills,
  SUM(mgp.deaths) AS deaths
FROM match_game_pokemon mgp
JOIN match_games mg ON mg.id = mgp.match_game_id
JOIN matches     m  ON m.id  = mg.match_id
GROUP BY m.season_id, mgp.team_id, mgp.pokemon_id;


-- ------------------------------------------------------------
-- ADMIN RESET: DRAFT / ROSTER / MATCH HISTORY
-- "Break in case of glass" -- wipes every table that represents draft,
-- roster, free-agency, and match HISTORY, while leaving team, pokemon,
-- conference, group, and season setup (including each team's conference
-- placement and draft position) untouched. Per-team fa_tokens_adjustment is
-- reset to 0 along with draft_ended_at, since both are draft-run state, not
-- season setup. Only ever invoked by an admin from a confirmation-gated UI.
-- ------------------------------------------------------------
-- Every DELETE/UPDATE here uses `WHERE true` because Supabase's API-facing
-- role runs under the safeupdate extension, which rejects any DELETE/UPDATE
-- lacking a WHERE clause (SQLSTATE 21000) -- it only checks for the
-- syntactic presence of one, so this satisfies it without changing behavior.
CREATE OR REPLACE FUNCTION admin_reset_draft_history() RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM match_game_pokemon WHERE true;
  DELETE FROM match_games WHERE true;
  DELETE FROM matches WHERE true;
  DELETE FROM transaction_items WHERE true;
  DELETE FROM transactions WHERE true;
  DELETE FROM draft_log WHERE true;
  DELETE FROM rosters WHERE true;
  UPDATE draft_pools SET is_active = FALSE, started_at = NULL WHERE true;
  UPDATE team_seasons SET draft_ended_at = NULL, fa_tokens_adjustment = 0 WHERE true;
END;
$$;


-- ============================================================
-- ROW LEVEL SECURITY
-- All tables are publicly readable (league data is open).
-- No client-side writes — all data entry uses the service role
-- key via the Supabase dashboard or a server-side admin panel.
-- ============================================================

ALTER TABLE seasons          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon          ENABLE ROW LEVEL SECURITY;
ALTER TABLE important_moves  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pokemon_moves    ENABLE ROW LEVEL SECURITY;
ALTER TABLE conferences      ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams            ENABLE ROW LEVEL SECURITY;
ALTER TABLE rosters          ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_log        ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_pools         ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_seasons        ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches             ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_games         ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_game_pokemon  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON seasons            FOR SELECT USING (true);
CREATE POLICY "Public read" ON pokemon            FOR SELECT USING (true);
CREATE POLICY "Public read" ON important_moves    FOR SELECT USING (true);
CREATE POLICY "Public read" ON pokemon_moves      FOR SELECT USING (true);
CREATE POLICY "Public read" ON conferences        FOR SELECT USING (true);
CREATE POLICY "Public read" ON groups             FOR SELECT USING (true);
CREATE POLICY "Public read" ON teams              FOR SELECT USING (true);
CREATE POLICY "Public read" ON rosters            FOR SELECT USING (true);
CREATE POLICY "Public read" ON draft_log          FOR SELECT USING (true);
CREATE POLICY "Public read" ON draft_pools        FOR SELECT USING (true);
CREATE POLICY "Public read" ON transactions       FOR SELECT USING (true);
CREATE POLICY "Public read" ON transaction_items  FOR SELECT USING (true);
CREATE POLICY "Public read" ON team_seasons       FOR SELECT USING (true);
CREATE POLICY "Public read" ON team_members       FOR SELECT USING (true);
CREATE POLICY "Public read" ON matches            FOR SELECT USING (true);
CREATE POLICY "Public read" ON match_games        FOR SELECT USING (true);
CREATE POLICY "Public read" ON match_game_pokemon FOR SELECT USING (true);


-- ============================================================
-- REALTIME
-- Tables the client subscribes to via postgres_changes.
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE rosters, draft_log, draft_pools, team_seasons;
