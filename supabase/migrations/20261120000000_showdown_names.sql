-- ============================================================
-- Showdown names: binds each Discord account (Supabase auth user)
-- to the Pokemon Showdown name it logs into play.titan-pdl.com with.
-- The name is the Discord username (trimmed to Showdown's 18 chars);
-- showdown_id is Showdown's normalized ID (lowercase a-z0-9 only),
-- which is what must be unique: Showdown treats "john.doe" and
-- "johndoe" as the same user.
--
-- Only server code (service key) touches this table: RLS is enabled
-- with no policies, so it is invisible to the public/anon key.
-- ============================================================

CREATE TABLE showdown_names (
  user_id       UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  showdown_id   TEXT        NOT NULL UNIQUE CHECK (showdown_id ~ '^[a-z0-9]{1,18}$'),
  showdown_name TEXT        NOT NULL CHECK (char_length(showdown_name) BETWEEN 1 AND 18),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE showdown_names ENABLE ROW LEVEL SECURITY;
