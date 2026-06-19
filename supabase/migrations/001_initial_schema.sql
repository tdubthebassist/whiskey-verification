-- Bar Backroom Admin: Initial Schema
-- Whiskeys table
CREATE TABLE whiskeys (
  id SERIAL PRIMARY KEY,
  brand TEXT NOT NULL,
  expression TEXT DEFAULT '',
  region TEXT NOT NULL,
  abv REAL NOT NULL,
  age INTEGER,           -- NULL = NAS
  notes TEXT DEFAULT '',
  glass_price INTEGER NOT NULL,  -- KRW (selling price per glass)
  bottle_price INTEGER NOT NULL, -- KRW (selling price per bottle)
  cost_price INTEGER,            -- KRW (purchase cost, NULL for legacy entries)
  photo_url TEXT,
  bottle_volume_ml INTEGER DEFAULT 700,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Admin settings (singleton row)
CREATE TABLE settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  pin_hash TEXT NOT NULL,
  pour_size_ml REAL DEFAULT 29.5735,   -- 1 oz in ml (default formula)
  markup_multiplier REAL DEFAULT 3.0,
  margin_pct REAL DEFAULT 15.0,
  rounding_unit INTEGER DEFAULT 1000,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: read-only for anon key. ALL writes go through Edge Functions.
ALTER TABLE whiskeys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read whiskeys" ON whiskeys FOR SELECT USING (true);

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read settings" ON settings FOR SELECT USING (true);

-- Real-time for customer menu auto-refresh
ALTER PUBLICATION supabase_realtime ADD TABLE whiskeys;

-- Default settings (PIN: 1234, hashed with simple SHA-256 for MVP)
INSERT INTO settings (pin_hash) VALUES ('03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4');
