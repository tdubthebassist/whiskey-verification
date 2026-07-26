-- 005: Login rate-limiting / lockout support (plan §5 Step 3).
-- Replaces the removed PIN 3-fail/30s cooldown. `login/` records every login
-- attempt here and counts recent consecutive failures per login_id to decide
-- whether to lock the account out before checking the password.
--
-- This is an auth/infra table (NOT a tenant table): it is intentionally NOT in
-- _shared/auth.ts's TENANT_TABLES set and is reached with the raw service-role
-- client inside `login/` (which runs anon, before any session exists).

CREATE TABLE login_attempts (
  id BIGSERIAL PRIMARY KEY,
  login_id TEXT NOT NULL,
  ip TEXT,
  succeeded BOOLEAN NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Primary access path: recent attempts for one login_id, newest first.
CREATE INDEX idx_login_attempts_login_time
  ON login_attempts (login_id, attempted_at DESC);

-- RLS on, with NO anon/authenticated policy. Service role bypasses RLS; every
-- other role is denied by default (consistent with bars/accounts/sessions).
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- DOWN MIGRATION (companion: run manually to roll back 005).
-- ============================================================================
-- DROP TABLE IF EXISTS login_attempts;
