-- Inventory history corrections, daily trends, and monthly snapshots.

ALTER TABLE inventory_logs
  ADD COLUMN IF NOT EXISTS corrected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS corrected_from_percent INTEGER
    CHECK (corrected_from_percent >= 0 AND corrected_from_percent <= 100),
  ADD COLUMN IF NOT EXISTS correction_source TEXT;

ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS inventory_snapshot_day INTEGER
    CHECK (inventory_snapshot_day IS NULL OR inventory_snapshot_day BETWEEN 1 AND 28);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_whiskey_scanned
  ON inventory_logs (whiskey_id, scanned_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_logs_whiskey_effective
  ON inventory_logs (whiskey_id, scanned_at DESC, corrected_at DESC, id DESC);

CREATE OR REPLACE FUNCTION record_inventory_scan(
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
  WHERE id = p_whiskey_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Whiskey % not found', p_whiskey_id;
  END IF;

  INSERT INTO inventory_logs (whiskey_id, stock_percent, confidence, source)
  VALUES (p_whiskey_id, p_stock_percent, p_confidence, COALESCE(p_source, 'vision_ai'));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_inventory_daily_trend(
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
  ) ranked
  WHERE ranked.rank = 1
  ORDER BY ranked.day;
$$ LANGUAGE sql STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION overwrite_inventory_log(
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
    AND inventory_logs.whiskey_id = p_whiskey_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventory log % for whiskey % not found', p_log_id, p_whiskey_id;
  END IF;

  SELECT il.stock_percent
  INTO v_current_stock_percent
  FROM inventory_logs il
  WHERE il.whiskey_id = p_whiskey_id
  ORDER BY il.scanned_at DESC, il.id DESC
  LIMIT 1;

  UPDATE whiskeys
  SET stock_percent = v_current_stock_percent,
      updated_at = now()
  WHERE id = p_whiskey_id;

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
  WHERE il.id = p_log_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TABLE IF NOT EXISTS inventory_monthly_snapshots (
  id BIGSERIAL PRIMARY KEY,
  whiskey_id INTEGER NOT NULL REFERENCES whiskeys(id) ON DELETE CASCADE,
  snapshot_month DATE NOT NULL,
  snapshot_date DATE NOT NULL,
  stock_percent INTEGER NOT NULL CHECK (stock_percent >= 0 AND stock_percent <= 100),
  source_log_id BIGINT REFERENCES inventory_logs(id) ON DELETE SET NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'scheduled_snapshot',
  UNIQUE (whiskey_id, snapshot_month)
);

ALTER TABLE inventory_monthly_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read inventory_monthly_snapshots" ON inventory_monthly_snapshots;
CREATE POLICY "Public read inventory_monthly_snapshots"
  ON inventory_monthly_snapshots FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_inventory_monthly_snapshots_whiskey_month
  ON inventory_monthly_snapshots (whiskey_id, snapshot_month DESC);

CREATE OR REPLACE FUNCTION prevent_inventory_snapshot_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Inventory monthly snapshots are immutable';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS inventory_monthly_snapshots_immutable
  ON inventory_monthly_snapshots;
CREATE TRIGGER inventory_monthly_snapshots_immutable
  BEFORE UPDATE OR DELETE ON inventory_monthly_snapshots
  FOR EACH ROW EXECUTE FUNCTION prevent_inventory_snapshot_mutation();

CREATE OR REPLACE FUNCTION inventory_snapshot_due_date(
  p_month DATE,
  p_override_day INTEGER
) RETURNS DATE AS $$
  SELECT CASE
    WHEN p_override_day IS NULL THEN
      (date_trunc('month', p_month)::date + INTERVAL '1 month - 1 day')::date
    WHEN p_override_day BETWEEN 1 AND 28 THEN
      (date_trunc('month', p_month)::date + ((p_override_day - 1) || ' days')::interval)::date
    ELSE
      NULL
  END;
$$ LANGUAGE sql IMMUTABLE SET search_path = public;

CREATE OR REPLACE FUNCTION capture_monthly_inventory_snapshots(
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
  WHERE id = 1;

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
    ORDER BY il.whiskey_id, il.scanned_at DESC, il.id DESC
  ),
  eligible AS (
    SELECT
      w.id AS whiskey_id,
      COALESCE(latest_logs.stock_percent, w.stock_percent) AS stock_percent,
      latest_logs.source_log_id
    FROM whiskeys w
    LEFT JOIN latest_logs ON latest_logs.whiskey_id = w.id
    WHERE COALESCE(latest_logs.stock_percent, w.stock_percent) IS NOT NULL
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
      source
    )
    SELECT
      eligible.whiskey_id,
      v_snapshot_month,
      v_due_date,
      eligible.stock_percent,
      eligible.source_log_id,
      'scheduled_snapshot'
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

GRANT SELECT ON inventory_logs TO anon, authenticated;
GRANT SELECT ON inventory_monthly_snapshots TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION record_inventory_scan(INTEGER, INTEGER, REAL, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_inventory_scan(INTEGER, INTEGER, REAL, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION record_inventory_scan(INTEGER, INTEGER, REAL, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_inventory_scan(INTEGER, INTEGER, REAL, TEXT) TO service_role;

GRANT EXECUTE ON FUNCTION get_inventory_daily_trend(INTEGER) TO anon;
GRANT EXECUTE ON FUNCTION get_inventory_daily_trend(INTEGER) TO authenticated;

REVOKE EXECUTE ON FUNCTION overwrite_inventory_log(BIGINT, INTEGER, INTEGER, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION overwrite_inventory_log(BIGINT, INTEGER, INTEGER, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION overwrite_inventory_log(BIGINT, INTEGER, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION overwrite_inventory_log(BIGINT, INTEGER, INTEGER, TEXT) TO service_role;

REVOKE EXECUTE ON FUNCTION capture_monthly_inventory_snapshots(TIMESTAMPTZ) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION capture_monthly_inventory_snapshots(TIMESTAMPTZ) FROM anon;
REVOKE EXECUTE ON FUNCTION capture_monthly_inventory_snapshots(TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION capture_monthly_inventory_snapshots(TIMESTAMPTZ) TO service_role;
