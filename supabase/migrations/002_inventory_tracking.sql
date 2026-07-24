-- 1a. Add stock_percent column to whiskeys table
ALTER TABLE whiskeys
  ADD COLUMN stock_percent INTEGER DEFAULT NULL
  CHECK (stock_percent >= 0 AND stock_percent <= 100);

-- 1b. Create inventory_logs table for history
CREATE TABLE inventory_logs (
  id BIGSERIAL PRIMARY KEY,
  whiskey_id INTEGER NOT NULL REFERENCES whiskeys(id) ON DELETE CASCADE,
  stock_percent INTEGER NOT NULL CHECK (stock_percent >= 0 AND stock_percent <= 100),
  scanned_at TIMESTAMPTZ DEFAULT now(),
  confidence REAL,
  source TEXT DEFAULT 'vision_ai'
);

-- 1c. RLS policies
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read inventory_logs" ON inventory_logs FOR SELECT USING (true);

-- 1d. Index for time-series queries
CREATE INDEX idx_inventory_logs_whiskey_time
  ON inventory_logs (whiskey_id, scanned_at DESC);

-- 1e. Real-time
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_logs;

-- 1f. Atomic dual-write function
CREATE OR REPLACE FUNCTION record_inventory_scan(
  p_whiskey_id INTEGER,
  p_stock_percent INTEGER,
  p_confidence REAL,
  p_source TEXT DEFAULT 'vision_ai'
) RETURNS void AS $$
BEGIN
  UPDATE whiskeys SET stock_percent = p_stock_percent WHERE id = p_whiskey_id;
  INSERT INTO inventory_logs (whiskey_id, stock_percent, confidence, source)
  VALUES (p_whiskey_id, p_stock_percent, p_confidence, p_source);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Only the Edge Function may record scans after validating the admin PIN.
REVOKE EXECUTE ON FUNCTION record_inventory_scan(INTEGER, INTEGER, REAL, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION record_inventory_scan(INTEGER, INTEGER, REAL, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION record_inventory_scan(INTEGER, INTEGER, REAL, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION record_inventory_scan(INTEGER, INTEGER, REAL, TEXT) TO service_role;
