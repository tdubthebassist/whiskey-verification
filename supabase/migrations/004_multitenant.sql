-- 004: Single-bar -> multi-tenant conversion.
-- Introduces bars/accounts/sessions, stamps every tenant row with bar_id,
-- re-keys settings per bar, drops the PIN, and locks the raw tenant tables to
-- the service role only. Forward-only on auth (settings.pin_hash is dropped and
-- is NOT restorable -- see the down-migration section at the bottom).
-- First bar id is pinned to a literal so it can be used in a DDL default below.

-- 0. Required for gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Tenant + auth tables (uuid PKs).

-- 1a. Bars.
CREATE TABLE bars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert the first bar with a FIXED literal id so the snapshot DDL default and
-- all backfills below can reference it.
INSERT INTO bars (id, name, slug)
VALUES ('00000000-0000-0000-0000-000000000001', 'Main Bar', 'main');

-- 1b. Accounts (bar logins + a single owner).
CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login_id TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('bar', 'owner')),
  bar_id UUID REFERENCES bars(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  -- A bar account must have a bar_id; an owner account must not.
  CONSTRAINT accounts_bar_role_consistency CHECK ((role = 'bar') = (bar_id IS NOT NULL))
);

-- At most one bar account per bar.
CREATE UNIQUE INDEX one_account_per_bar ON accounts (bar_id) WHERE role = 'bar';
-- Exactly one owner account may exist.
CREATE UNIQUE INDEX one_owner ON accounts ((true)) WHERE role = 'owner';

-- 1c. Opaque server-side sessions.
CREATE TABLE sessions (
  token TEXT PRIMARY KEY,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  bar_id UUID REFERENCES bars(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

-- 1d. RLS on all three new tables with NO anon/authenticated policy.
-- Service role bypasses RLS; every other role is denied by default.
ALTER TABLE bars ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- 2. Add nullable bar_id to the existing tenant tables.
-- whiskeys / inventory_logs / settings get a plain nullable column here.
-- inventory_monthly_snapshots is handled separately below (its immutability
-- trigger forbids UPDATE, so it is backfilled via a DDL default).
ALTER TABLE whiskeys ADD COLUMN bar_id UUID;
ALTER TABLE inventory_logs ADD COLUMN bar_id UUID;
ALTER TABLE settings ADD COLUMN bar_id UUID;

-- 3. Backfill existing rows to the first bar.
-- whiskeys / inventory_logs / settings have no BEFORE UPDATE trigger -> plain UPDATE.
UPDATE whiskeys SET bar_id = '00000000-0000-0000-0000-000000000001';
UPDATE inventory_logs SET bar_id = '00000000-0000-0000-0000-000000000001';
UPDATE settings SET bar_id = '00000000-0000-0000-0000-000000000001' WHERE id = 1;

-- inventory_monthly_snapshots MUST NOT be backfilled with UPDATE: the
-- inventory_monthly_snapshots_immutable BEFORE UPDATE OR DELETE trigger
-- (003_inventory_history.sql:177-179) unconditionally RAISEs and would abort it.
-- Adding the column WITH a default fills every existing row via DDL (no per-row
-- UPDATE, so the trigger never fires); then drop the default so new rows must
-- supply bar_id explicitly through the snapshot function.
ALTER TABLE inventory_monthly_snapshots
  ADD COLUMN bar_id UUID DEFAULT '00000000-0000-0000-0000-000000000001';
ALTER TABLE inventory_monthly_snapshots
  ALTER COLUMN bar_id DROP DEFAULT;

-- 4. Assert the backfill is complete on all four tenant tables before enforcing
-- NOT NULL / FKs. Abort the whole migration (transaction) if any row is unstamped.
DO $$
BEGIN
  IF (SELECT count(*) FROM whiskeys WHERE bar_id IS NULL) > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: whiskeys has NULL bar_id rows';
  END IF;
  IF (SELECT count(*) FROM settings WHERE bar_id IS NULL) > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: settings has NULL bar_id rows';
  END IF;
  IF (SELECT count(*) FROM inventory_logs WHERE bar_id IS NULL) > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: inventory_logs has NULL bar_id rows';
  END IF;
  IF (SELECT count(*) FROM inventory_monthly_snapshots WHERE bar_id IS NULL) > 0 THEN
    RAISE EXCEPTION 'Backfill incomplete: inventory_monthly_snapshots has NULL bar_id rows';
  END IF;
END $$;

-- 5. Enforce NOT NULL + FKs + indexes on whiskeys / inventory_logs /
-- inventory_monthly_snapshots. (settings is re-keyed in section 6, where bar_id
-- becomes the PK and is therefore implicitly NOT NULL.)
ALTER TABLE whiskeys ALTER COLUMN bar_id SET NOT NULL;
ALTER TABLE inventory_logs ALTER COLUMN bar_id SET NOT NULL;
ALTER TABLE inventory_monthly_snapshots ALTER COLUMN bar_id SET NOT NULL;

ALTER TABLE whiskeys
  ADD CONSTRAINT whiskeys_bar_id_fkey
  FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE;
ALTER TABLE inventory_logs
  ADD CONSTRAINT inventory_logs_bar_id_fkey
  FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE;
ALTER TABLE inventory_monthly_snapshots
  ADD CONSTRAINT inventory_monthly_snapshots_bar_id_fkey
  FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE;

CREATE INDEX idx_whiskeys_bar ON whiskeys (bar_id);
CREATE INDEX idx_inventory_logs_bar ON inventory_logs (bar_id);
CREATE INDEX idx_inventory_monthly_snapshots_bar ON inventory_monthly_snapshots (bar_id);

-- Composite indexes for the common per-bar access paths.
CREATE INDEX idx_whiskeys_bar_id ON whiskeys (bar_id, id);
CREATE INDEX idx_inventory_logs_bar_whiskey_scanned
  ON inventory_logs (bar_id, whiskey_id, scanned_at DESC);
CREATE INDEX idx_inventory_monthly_snapshots_bar_whiskey_month
  ON inventory_monthly_snapshots (bar_id, whiskey_id, snapshot_month DESC);

-- 6. Re-key settings from the singleton (id INTEGER PRIMARY KEY DEFAULT 1) to a
-- per-bar table keyed by bar_id, and drop the PIN column.
-- settings.bar_id was added + backfilled above.
ALTER TABLE settings DROP CONSTRAINT settings_pkey;
ALTER TABLE settings DROP COLUMN id;
ALTER TABLE settings ADD PRIMARY KEY (bar_id);
ALTER TABLE settings
  ADD CONSTRAINT settings_bar_id_fkey
  FOREIGN KEY (bar_id) REFERENCES bars(id) ON DELETE CASCADE;

-- Forward-only auth cutover (Principle 4): the PIN secret is dropped and NOT
-- restorable. If a PIN rollback is ever needed, back it up BEFORE this DROP:
--   CREATE TABLE settings_pin_backup AS
--     SELECT '00000000-0000-0000-0000-000000000001'::uuid AS bar_id, pin_hash FROM settings;
ALTER TABLE settings DROP COLUMN pin_hash;

-- 7. Lock down anon/authenticated access on ALL FOUR tenant tables.
-- Drop the wide-open "Public read ..." policies.
DROP POLICY "Public read whiskeys" ON whiskeys;
DROP POLICY "Public read settings" ON settings;
DROP POLICY "Public read inventory_logs" ON inventory_logs;
DROP POLICY "Public read inventory_monthly_snapshots" ON inventory_monthly_snapshots;

-- Revoke direct PostgREST read access (defends against a leaked anon key).
REVOKE SELECT ON whiskeys, settings, inventory_logs, inventory_monthly_snapshots
  FROM anon, authenticated;

-- Remove both tables from the realtime publication (anon realtime is gone).
ALTER PUBLICATION supabase_realtime DROP TABLE whiskeys;
ALTER PUBLICATION supabase_realtime DROP TABLE inventory_logs;

-- 8. Drop the OLD function signatures BEFORE recreating with a bar_id dimension.
-- A bare CREATE OR REPLACE with a new signature would leave the old overload
-- live -- including the anon-granted get_inventory_daily_trend(INTEGER), a live
-- cross-bar leak. Drop each old signature explicitly.
DROP FUNCTION IF EXISTS record_inventory_scan(INTEGER, INTEGER, REAL, TEXT);
DROP FUNCTION IF EXISTS get_inventory_daily_trend(INTEGER);
DROP FUNCTION IF EXISTS overwrite_inventory_log(BIGINT, INTEGER, INTEGER, TEXT);
DROP FUNCTION IF EXISTS capture_monthly_inventory_snapshots(TIMESTAMPTZ);

-- 8a. record_inventory_scan: verify the whiskey belongs to p_bar_id, stamp bar_id.
CREATE OR REPLACE FUNCTION record_inventory_scan(
  p_bar_id UUID,
  p_whiskey_id INTEGER,
  p_stock_percent INTEGER,
  p_confidence REAL,
  p_source TEXT DEFAULT 'vision_ai'
) RETURNS void AS $$
BEGIN
  IF p_stock_percent < 0 OR p_stock_percent > 100 THEN
    RAISE EXCEPTION 'stock_percent must be between 0 and 100';
  END IF;

  UPDATE whiskeys
  SET stock_percent = p_stock_percent,
      updated_at = now()
  WHERE id = p_whiskey_id
    AND bar_id = p_bar_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Whiskey % not found for bar %', p_whiskey_id, p_bar_id;
  END IF;

  INSERT INTO inventory_logs (whiskey_id, stock_percent, confidence, source, bar_id)
  VALUES (p_whiskey_id, p_stock_percent, p_confidence, COALESCE(p_source, 'vision_ai'), p_bar_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8b. get_inventory_daily_trend: filter by bar.
CREATE OR REPLACE FUNCTION get_inventory_daily_trend(
  p_bar_id UUID,
  p_whiskey_id INTEGER
) RETURNS TABLE (
  whiskey_id INTEGER,
  day DATE,
  log_id BIGINT,
  stock_percent INTEGER,
  scanned_at TIMESTAMPTZ,
  corrected_at TIMESTAMPTZ,
  source TEXT,
  confidence REAL
) AS $$
  SELECT
    ranked.whiskey_id,
    ranked.day,
    ranked.id AS log_id,
    ranked.stock_percent,
    ranked.scanned_at,
    ranked.corrected_at,
    ranked.source,
    ranked.confidence
  FROM (
    SELECT
      inventory_logs.*,
      (inventory_logs.scanned_at AT TIME ZONE 'Asia/Seoul')::date AS day,
      ROW_NUMBER() OVER (
        PARTITION BY inventory_logs.whiskey_id, (inventory_logs.scanned_at AT TIME ZONE 'Asia/Seoul')::date
        ORDER BY COALESCE(inventory_logs.corrected_at, inventory_logs.scanned_at) DESC,
                 inventory_logs.id DESC
      ) AS rank
    FROM inventory_logs
    WHERE inventory_logs.whiskey_id = p_whiskey_id
      AND inventory_logs.bar_id = p_bar_id
  ) ranked
  WHERE ranked.rank = 1
  ORDER BY ranked.day;
$$ LANGUAGE sql STABLE SET search_path = public;

-- 8c. overwrite_inventory_log: guard every access by bar.
CREATE OR REPLACE FUNCTION overwrite_inventory_log(
  p_bar_id UUID,
  p_log_id BIGINT,
  p_whiskey_id INTEGER,
  p_stock_percent INTEGER,
  p_source TEXT DEFAULT 'manual_correction'
) RETURNS TABLE (
  whiskey_id INTEGER,
  log_id BIGINT,
  stock_percent INTEGER,
  current_stock_percent INTEGER,
  scanned_at TIMESTAMPTZ,
  corrected_at TIMESTAMPTZ,
  corrected_from_percent INTEGER,
  correction_source TEXT,
  source TEXT,
  confidence REAL
) AS $$
DECLARE
  v_current_stock_percent INTEGER;
BEGIN
  IF p_stock_percent < 0 OR p_stock_percent > 100 THEN
    RAISE EXCEPTION 'stock_percent must be between 0 and 100';
  END IF;

  UPDATE inventory_logs
  SET corrected_from_percent = COALESCE(corrected_from_percent, inventory_logs.stock_percent),
      stock_percent = p_stock_percent,
      corrected_at = now(),
      correction_source = COALESCE(p_source, 'manual_correction'),
      source = COALESCE(p_source, 'manual_correction')
  WHERE id = p_log_id
    AND inventory_logs.whiskey_id = p_whiskey_id
    AND inventory_logs.bar_id = p_bar_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory log % for whiskey % not found in bar %', p_log_id, p_whiskey_id, p_bar_id;
  END IF;

  SELECT il.stock_percent
  INTO v_current_stock_percent
  FROM inventory_logs il
  WHERE il.whiskey_id = p_whiskey_id
    AND il.bar_id = p_bar_id
  ORDER BY il.scanned_at DESC, il.id DESC
  LIMIT 1;

  UPDATE whiskeys
  SET stock_percent = v_current_stock_percent,
      updated_at = now()
  WHERE id = p_whiskey_id
    AND bar_id = p_bar_id;

  RETURN QUERY
  SELECT
    il.whiskey_id,
    il.id AS log_id,
    il.stock_percent,
    v_current_stock_percent AS current_stock_percent,
    il.scanned_at,
    il.corrected_at,
    il.corrected_from_percent,
    il.correction_source,
    il.source,
    il.confidence
  FROM inventory_logs il
  WHERE il.id = p_log_id
    AND il.bar_id = p_bar_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8d. capture_monthly_inventory_snapshots: read THAT bar's settings (by bar_id,
-- not id = 1), iterate only that bar's whiskeys/logs, stamp bar_id on inserts.
CREATE OR REPLACE FUNCTION capture_monthly_inventory_snapshots(
  p_bar_id UUID,
  p_run_at TIMESTAMPTZ DEFAULT now()
) RETURNS TABLE (
  inserted INTEGER,
  skipped INTEGER,
  snapshot_month DATE,
  snapshot_date DATE
) AS $$
DECLARE
  v_kst_date DATE := (p_run_at AT TIME ZONE 'Asia/Seoul')::date;
  v_snapshot_month DATE := date_trunc('month', (p_run_at AT TIME ZONE 'Asia/Seoul')::date)::date;
  v_override_day INTEGER;
  v_due_date DATE;
  v_eligible INTEGER := 0;
  v_inserted INTEGER := 0;
BEGIN
  SELECT settings.inventory_snapshot_day
  INTO v_override_day
  FROM settings
  WHERE bar_id = p_bar_id;

  v_due_date := inventory_snapshot_due_date(v_snapshot_month, v_override_day);

  IF v_due_date IS NULL THEN
    RAISE EXCEPTION 'Invalid inventory_snapshot_day: %', v_override_day;
  END IF;

  IF v_kst_date <> v_due_date THEN
    RETURN QUERY SELECT 0, 0, v_snapshot_month, v_due_date;
    RETURN;
  END IF;

  WITH latest_logs AS (
    SELECT DISTINCT ON (il.whiskey_id)
      il.whiskey_id,
      il.id AS source_log_id,
      il.stock_percent
    FROM inventory_logs il
    WHERE il.bar_id = p_bar_id
    ORDER BY il.whiskey_id, il.scanned_at DESC, il.id DESC
  ),
  eligible AS (
    SELECT
      w.id AS whiskey_id,
      COALESCE(latest_logs.stock_percent, w.stock_percent) AS stock_percent,
      latest_logs.source_log_id
    FROM whiskeys w
    LEFT JOIN latest_logs ON latest_logs.whiskey_id = w.id
    WHERE w.bar_id = p_bar_id
      AND COALESCE(latest_logs.stock_percent, w.stock_percent) IS NOT NULL
  ),
  eligible_count AS (
    SELECT COUNT(*)::INTEGER AS count FROM eligible
  ),
  inserted_rows AS (
    INSERT INTO inventory_monthly_snapshots (
      whiskey_id,
      snapshot_month,
      snapshot_date,
      stock_percent,
      source_log_id,
      source,
      bar_id
    )
    SELECT
      eligible.whiskey_id,
      v_snapshot_month,
      v_due_date,
      eligible.stock_percent,
      eligible.source_log_id,
      'scheduled_snapshot',
      p_bar_id
    FROM eligible
    ON CONFLICT (whiskey_id, snapshot_month) DO NOTHING
    RETURNING id
  )
  SELECT eligible_count.count, COUNT(inserted_rows.id)::INTEGER
  INTO v_eligible, v_inserted
  FROM eligible_count
  LEFT JOIN inserted_rows ON true
  GROUP BY eligible_count.count;

  RETURN QUERY SELECT
    v_inserted,
    GREATEST(v_eligible - v_inserted, 0),
    v_snapshot_month,
    v_due_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 8e. Grant EXECUTE on the new signatures to service_role ONLY.
-- No anon/authenticated on any of them (especially the trend function).
REVOKE EXECUTE ON FUNCTION record_inventory_scan(UUID, INTEGER, INTEGER, REAL, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_inventory_scan(UUID, INTEGER, INTEGER, REAL, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION record_inventory_scan(UUID, INTEGER, INTEGER, REAL, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_inventory_scan(UUID, INTEGER, INTEGER, REAL, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION get_inventory_daily_trend(UUID, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION get_inventory_daily_trend(UUID, INTEGER) FROM anon;
REVOKE EXECUTE ON FUNCTION get_inventory_daily_trend(UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_inventory_daily_trend(UUID, INTEGER) TO service_role;

REVOKE EXECUTE ON FUNCTION overwrite_inventory_log(UUID, BIGINT, INTEGER, INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION overwrite_inventory_log(UUID, BIGINT, INTEGER, INTEGER, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION overwrite_inventory_log(UUID, BIGINT, INTEGER, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION overwrite_inventory_log(UUID, BIGINT, INTEGER, INTEGER, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION capture_monthly_inventory_snapshots(UUID, TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION capture_monthly_inventory_snapshots(UUID, TIMESTAMPTZ) FROM anon;
REVOKE EXECUTE ON FUNCTION capture_monthly_inventory_snapshots(UUID, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION capture_monthly_inventory_snapshots(UUID, TIMESTAMPTZ) TO service_role;

-- 8f. Grant table DML to service_role EXPLICITLY. The Edge Function layer runs
-- as service_role (which bypasses RLS) and MUST read/write these tables. Do not
-- rely on the platform's implicit default privileges — grant explicitly so the
-- migration is environment-independent (local, self-hosted, and cloud all work).
-- RLS deny-all still blocks anon/authenticated; only service_role is granted.
GRANT SELECT, INSERT, UPDATE, DELETE ON bars                        TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON accounts                    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON sessions                    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON whiskeys                    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON settings                    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_logs              TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON inventory_monthly_snapshots TO service_role;
-- SERIAL/BIGSERIAL PKs need sequence usage for service_role INSERTs.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- The immutability trigger (inventory_monthly_snapshots_immutable) and
-- inventory_snapshot_due_date() are intentionally left as-is.


-- ============================================================================
-- DOWN MIGRATION (companion: run manually to roll back 004).
-- Restores BOTH schema and the original 003 function signatures/grants.
-- IRREVERSIBILITY (Principle 4): settings.pin_hash CANNOT be restored -- the
-- forward auth cutover is lossy by design. The pre-004 DB dump is the only true
-- PIN rollback (unless settings_pin_backup was created before the DROP above).
-- Every statement below is commented out; uncomment to execute.
-- ============================================================================
--
-- -- D1. Drop the new bar_id-carrying function signatures.
-- DROP FUNCTION IF EXISTS record_inventory_scan(UUID, INTEGER, INTEGER, REAL, TEXT);
-- DROP FUNCTION IF EXISTS get_inventory_daily_trend(UUID, INTEGER);
-- DROP FUNCTION IF EXISTS overwrite_inventory_log(UUID, BIGINT, INTEGER, INTEGER, TEXT);
-- DROP FUNCTION IF EXISTS capture_monthly_inventory_snapshots(UUID, TIMESTAMPTZ);
--
-- -- D2. Recreate the ORIGINAL 003 functions verbatim (old signatures).
-- CREATE OR REPLACE FUNCTION record_inventory_scan(
--   p_whiskey_id INTEGER,
--   p_stock_percent INTEGER,
--   p_confidence REAL,
--   p_source TEXT DEFAULT 'vision_ai'
-- ) RETURNS void AS $$
-- BEGIN
--   IF p_stock_percent < 0 OR p_stock_percent > 100 THEN
--     RAISE EXCEPTION 'stock_percent must be between 0 and 100';
--   END IF;
--
--   UPDATE whiskeys
--   SET stock_percent = p_stock_percent,
--       updated_at = now()
--   WHERE id = p_whiskey_id;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Whiskey % not found', p_whiskey_id;
--   END IF;
--
--   INSERT INTO inventory_logs (whiskey_id, stock_percent, confidence, source)
--   VALUES (p_whiskey_id, p_stock_percent, p_confidence, COALESCE(p_source, 'vision_ai'));
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
--
-- CREATE OR REPLACE FUNCTION get_inventory_daily_trend(
--   p_whiskey_id INTEGER
-- ) RETURNS TABLE (
--   whiskey_id INTEGER,
--   day DATE,
--   log_id BIGINT,
--   stock_percent INTEGER,
--   scanned_at TIMESTAMPTZ,
--   corrected_at TIMESTAMPTZ,
--   source TEXT,
--   confidence REAL
-- ) AS $$
--   SELECT
--     ranked.whiskey_id,
--     ranked.day,
--     ranked.id AS log_id,
--     ranked.stock_percent,
--     ranked.scanned_at,
--     ranked.corrected_at,
--     ranked.source,
--     ranked.confidence
--   FROM (
--     SELECT
--       inventory_logs.*,
--       (inventory_logs.scanned_at AT TIME ZONE 'Asia/Seoul')::date AS day,
--       ROW_NUMBER() OVER (
--         PARTITION BY inventory_logs.whiskey_id, (inventory_logs.scanned_at AT TIME ZONE 'Asia/Seoul')::date
--         ORDER BY COALESCE(inventory_logs.corrected_at, inventory_logs.scanned_at) DESC,
--                  inventory_logs.id DESC
--       ) AS rank
--     FROM inventory_logs
--     WHERE inventory_logs.whiskey_id = p_whiskey_id
--   ) ranked
--   WHERE ranked.rank = 1
--   ORDER BY ranked.day;
-- $$ LANGUAGE sql STABLE SET search_path = public;
--
-- CREATE OR REPLACE FUNCTION overwrite_inventory_log(
--   p_log_id BIGINT,
--   p_whiskey_id INTEGER,
--   p_stock_percent INTEGER,
--   p_source TEXT DEFAULT 'manual_correction'
-- ) RETURNS TABLE (
--   whiskey_id INTEGER,
--   log_id BIGINT,
--   stock_percent INTEGER,
--   current_stock_percent INTEGER,
--   scanned_at TIMESTAMPTZ,
--   corrected_at TIMESTAMPTZ,
--   corrected_from_percent INTEGER,
--   correction_source TEXT,
--   source TEXT,
--   confidence REAL
-- ) AS $$
-- DECLARE
--   v_current_stock_percent INTEGER;
-- BEGIN
--   IF p_stock_percent < 0 OR p_stock_percent > 100 THEN
--     RAISE EXCEPTION 'stock_percent must be between 0 and 100';
--   END IF;
--
--   UPDATE inventory_logs
--   SET corrected_from_percent = COALESCE(corrected_from_percent, inventory_logs.stock_percent),
--       stock_percent = p_stock_percent,
--       corrected_at = now(),
--       correction_source = COALESCE(p_source, 'manual_correction'),
--       source = COALESCE(p_source, 'manual_correction')
--   WHERE id = p_log_id
--     AND inventory_logs.whiskey_id = p_whiskey_id;
--
--   IF NOT FOUND THEN
--     RAISE EXCEPTION 'Inventory log % for whiskey % not found', p_log_id, p_whiskey_id;
--   END IF;
--
--   SELECT il.stock_percent
--   INTO v_current_stock_percent
--   FROM inventory_logs il
--   WHERE il.whiskey_id = p_whiskey_id
--   ORDER BY il.scanned_at DESC, il.id DESC
--   LIMIT 1;
--
--   UPDATE whiskeys
--   SET stock_percent = v_current_stock_percent,
--       updated_at = now()
--   WHERE id = p_whiskey_id;
--
--   RETURN QUERY
--   SELECT
--     il.whiskey_id,
--     il.id AS log_id,
--     il.stock_percent,
--     v_current_stock_percent AS current_stock_percent,
--     il.scanned_at,
--     il.corrected_at,
--     il.corrected_from_percent,
--     il.correction_source,
--     il.source,
--     il.confidence
--   FROM inventory_logs il
--   WHERE il.id = p_log_id;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
--
-- CREATE OR REPLACE FUNCTION capture_monthly_inventory_snapshots(
--   p_run_at TIMESTAMPTZ DEFAULT now()
-- ) RETURNS TABLE (
--   inserted INTEGER,
--   skipped INTEGER,
--   snapshot_month DATE,
--   snapshot_date DATE
-- ) AS $$
-- DECLARE
--   v_kst_date DATE := (p_run_at AT TIME ZONE 'Asia/Seoul')::date;
--   v_snapshot_month DATE := date_trunc('month', (p_run_at AT TIME ZONE 'Asia/Seoul')::date)::date;
--   v_override_day INTEGER;
--   v_due_date DATE;
--   v_eligible INTEGER := 0;
--   v_inserted INTEGER := 0;
-- BEGIN
--   SELECT settings.inventory_snapshot_day
--   INTO v_override_day
--   FROM settings
--   WHERE id = 1;
--
--   v_due_date := inventory_snapshot_due_date(v_snapshot_month, v_override_day);
--
--   IF v_due_date IS NULL THEN
--     RAISE EXCEPTION 'Invalid inventory_snapshot_day: %', v_override_day;
--   END IF;
--
--   IF v_kst_date <> v_due_date THEN
--     RETURN QUERY SELECT 0, 0, v_snapshot_month, v_due_date;
--     RETURN;
--   END IF;
--
--   WITH latest_logs AS (
--     SELECT DISTINCT ON (il.whiskey_id)
--       il.whiskey_id,
--       il.id AS source_log_id,
--       il.stock_percent
--     FROM inventory_logs il
--     ORDER BY il.whiskey_id, il.scanned_at DESC, il.id DESC
--   ),
--   eligible AS (
--     SELECT
--       w.id AS whiskey_id,
--       COALESCE(latest_logs.stock_percent, w.stock_percent) AS stock_percent,
--       latest_logs.source_log_id
--     FROM whiskeys w
--     LEFT JOIN latest_logs ON latest_logs.whiskey_id = w.id
--     WHERE COALESCE(latest_logs.stock_percent, w.stock_percent) IS NOT NULL
--   ),
--   eligible_count AS (
--     SELECT COUNT(*)::INTEGER AS count FROM eligible
--   ),
--   inserted_rows AS (
--     INSERT INTO inventory_monthly_snapshots (
--       whiskey_id,
--       snapshot_month,
--       snapshot_date,
--       stock_percent,
--       source_log_id,
--       source
--     )
--     SELECT
--       eligible.whiskey_id,
--       v_snapshot_month,
--       v_due_date,
--       eligible.stock_percent,
--       eligible.source_log_id,
--       'scheduled_snapshot'
--     FROM eligible
--     ON CONFLICT (whiskey_id, snapshot_month) DO NOTHING
--     RETURNING id
--   )
--   SELECT eligible_count.count, COUNT(inserted_rows.id)::INTEGER
--   INTO v_eligible, v_inserted
--   FROM eligible_count
--   LEFT JOIN inserted_rows ON true
--   GROUP BY eligible_count.count;
--
--   RETURN QUERY SELECT
--     v_inserted,
--     GREATEST(v_eligible - v_inserted, 0),
--     v_snapshot_month,
--     v_due_date;
-- END;
-- $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
--
-- -- D3. Restore the original 003 grants (incl. anon/authenticated on the trend fn).
-- REVOKE EXECUTE ON FUNCTION record_inventory_scan(INTEGER, INTEGER, REAL, TEXT) FROM PUBLIC;
-- REVOKE EXECUTE ON FUNCTION record_inventory_scan(INTEGER, INTEGER, REAL, TEXT) FROM anon;
-- REVOKE EXECUTE ON FUNCTION record_inventory_scan(INTEGER, INTEGER, REAL, TEXT) FROM authenticated;
-- GRANT EXECUTE ON FUNCTION record_inventory_scan(INTEGER, INTEGER, REAL, TEXT) TO service_role;
--
-- GRANT EXECUTE ON FUNCTION get_inventory_daily_trend(INTEGER) TO anon;
-- GRANT EXECUTE ON FUNCTION get_inventory_daily_trend(INTEGER) TO authenticated;
--
-- REVOKE EXECUTE ON FUNCTION overwrite_inventory_log(BIGINT, INTEGER, INTEGER, TEXT) FROM PUBLIC;
-- REVOKE EXECUTE ON FUNCTION overwrite_inventory_log(BIGINT, INTEGER, INTEGER, TEXT) FROM anon;
-- REVOKE EXECUTE ON FUNCTION overwrite_inventory_log(BIGINT, INTEGER, INTEGER, TEXT) FROM authenticated;
-- GRANT EXECUTE ON FUNCTION overwrite_inventory_log(BIGINT, INTEGER, INTEGER, TEXT) TO service_role;
--
-- REVOKE EXECUTE ON FUNCTION capture_monthly_inventory_snapshots(TIMESTAMPTZ) FROM PUBLIC;
-- REVOKE EXECUTE ON FUNCTION capture_monthly_inventory_snapshots(TIMESTAMPTZ) FROM anon;
-- REVOKE EXECUTE ON FUNCTION capture_monthly_inventory_snapshots(TIMESTAMPTZ) FROM authenticated;
-- GRANT EXECUTE ON FUNCTION capture_monthly_inventory_snapshots(TIMESTAMPTZ) TO service_role;
--
-- -- D4. Drop FKs / indexes / NOT NULL and the bar_id columns.
-- DROP INDEX IF EXISTS idx_inventory_monthly_snapshots_bar_whiskey_month;
-- DROP INDEX IF EXISTS idx_inventory_logs_bar_whiskey_scanned;
-- DROP INDEX IF EXISTS idx_whiskeys_bar_id;
-- DROP INDEX IF EXISTS idx_inventory_monthly_snapshots_bar;
-- DROP INDEX IF EXISTS idx_inventory_logs_bar;
-- DROP INDEX IF EXISTS idx_whiskeys_bar;
-- ALTER TABLE whiskeys DROP CONSTRAINT IF EXISTS whiskeys_bar_id_fkey;
-- ALTER TABLE inventory_logs DROP CONSTRAINT IF EXISTS inventory_logs_bar_id_fkey;
-- ALTER TABLE inventory_monthly_snapshots DROP CONSTRAINT IF EXISTS inventory_monthly_snapshots_bar_id_fkey;
-- ALTER TABLE whiskeys DROP COLUMN IF EXISTS bar_id;
-- ALTER TABLE inventory_logs DROP COLUMN IF EXISTS bar_id;
-- ALTER TABLE inventory_monthly_snapshots DROP COLUMN IF EXISTS bar_id;
--
-- -- D5. Restore the settings singleton (id INTEGER PRIMARY KEY DEFAULT 1).
-- -- NOTE: pin_hash is NOT restorable (was dropped, forward-only). Downstream code
-- -- that expects settings.pin_hash NOT NULL must be handled out of band.
-- ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_bar_id_fkey;
-- ALTER TABLE settings DROP CONSTRAINT settings_pkey;   -- was PRIMARY KEY (bar_id)
-- ALTER TABLE settings DROP COLUMN bar_id;
-- ALTER TABLE settings ADD COLUMN id INTEGER PRIMARY KEY DEFAULT 1;
--
-- -- D6. Restore the original "Public read ..." policies + anon SELECT grants.
-- CREATE POLICY "Public read whiskeys" ON whiskeys FOR SELECT USING (true);
-- CREATE POLICY "Public read settings" ON settings FOR SELECT USING (true);
-- CREATE POLICY "Public read inventory_logs" ON inventory_logs FOR SELECT USING (true);
-- CREATE POLICY "Public read inventory_monthly_snapshots"
--   ON inventory_monthly_snapshots FOR SELECT USING (true);
-- GRANT SELECT ON inventory_logs TO anon, authenticated;
-- GRANT SELECT ON inventory_monthly_snapshots TO anon, authenticated;
--
-- -- D7. Restore realtime publication membership.
-- ALTER PUBLICATION supabase_realtime ADD TABLE whiskeys;
-- ALTER PUBLICATION supabase_realtime ADD TABLE inventory_logs;
--
-- -- D8. Drop the new auth/tenant tables.
-- DROP TABLE IF EXISTS sessions;
-- DROP TABLE IF EXISTS accounts;
-- DROP TABLE IF EXISTS bars;
