export interface Whiskey {
  id: number;
  bar_id: string;
  brand: string;
  expression: string;
  region: string;
  abv: number;
  age: number | null;
  notes: string;
  glass_price: number;
  bottle_price: number;
  cost_price: number | null;
  photo_url: string | null;
  bottle_volume_ml: number;
  created_at: string;
  updated_at: string;
  stock_percent: number | null;
}

export interface WhiskeyInput {
  brand: string;
  expression: string;
  region: string;
  abv: number;
  age: number | null;
  notes: string;
  glass_price: number;
  bottle_price: number;
  cost_price: number | null;
  photo_url: string | null;
  bottle_volume_ml: number;
}

export interface Settings {
  bar_id: string;
  pour_size_ml: number;
  markup_multiplier: number;
  margin_pct: number;
  rounding_unit: number;
  inventory_snapshot_day: number | null;
  updated_at: string;
}

export interface PricingConfig {
  pourSizeMl: number;
  markupMultiplier: number;
  marginPct: number;
  roundingUnit: number;
}

export interface PricingResult {
  pourCount: number;
  costPerPour: number;
  basePrice: number;
  withMargin: number;
  finalPrice: number;
}

export interface VisionResult {
  brand: string;
  expression: string;
  age: number | null;
  region: string;
  abv: number;
  notes: string;
  confidence: number;
}

export interface ReferenceWhiskey {
  brand: string;
  expression: string;
  region: string;
  abv: number;
  age: number | null;
  notes: string;
}

export interface InventoryLog {
  id: number;
  bar_id: string;
  whiskey_id: number;
  stock_percent: number;
  scanned_at: string;
  confidence: number | null;
  source: string;
  corrected_at?: string | null;
  corrected_from_percent?: number | null;
  correction_source?: string | null;
}

export interface ScanResult {
  whiskey_id: number;
  stock_percent: number;
  confidence: number | null;
}

export interface InventoryDailyTrendPoint {
  whiskey_id: number;
  day: string;
  log_id: number;
  stock_percent: number;
  scanned_at: string;
  corrected_at: string | null;
  source: string;
  confidence: number | null;
}

export interface InventoryMonthlySnapshot {
  id: number;
  whiskey_id: number;
  snapshot_month: string;
  snapshot_date: string;
  stock_percent: number;
  source_log_id: number | null;
  captured_at: string;
  source: string;
}

export interface InventoryCorrectionRequest {
  whiskey_id: number;
  log_id: number;
  stock_percent: number;
}

export interface InventoryCorrectionResult {
  success: boolean;
  whiskey_id: number;
  log_id: number;
  stock_percent: number;
  current_stock_percent: number | null;
  log?: InventoryLog;
}

export interface CaptureInventorySnapshotsResult {
  success: boolean;
  inserted?: number;
  skipped?: number;
  captured?: number;
}

export interface BulkUploadRow {
  rowIndex: number;
  brand: string;
  expression: string;
  cost_price: number;
  region: string;
  abv: number;
  age: number | null;
  notes: string;
  glass_price: number;
  bottle_price: number;
  bottle_volume_ml: number;
  status: 'pending' | 'enriched' | 'duplicate' | 'error' | 'registered';
  error?: string;
  enrichSource?: 'reference' | 'web' | 'ai_notes_only' | 'default';
  factDefaulted?: boolean;
}

export interface EnrichmentResult {
  region: string | null;
  abv: number | null;
  age: number | null;
  notes: string;
  source: 'reference' | 'web' | 'ai_notes_only';
}

export type Role = 'owner' | 'bar';

export interface Bar {
  id: string;
  name: string;
  slug: string;
  created_at?: string;
}

export interface BarSummary {
  bar_id: string;
  name: string;
  whiskey_count: number;
  last_scan_date: string | null;
}

export interface Session {
  token: string;
  role: Role;
  barId: string | null;
  barName: string | null;
}

export const REGIONS = [
  { key: 'islay', ko: '아일라', en: 'Islay' },
  { key: 'highland', ko: '하이랜드', en: 'Highland' },
  { key: 'speyside', ko: '스페이사이드', en: 'Speyside' },
  { key: 'islands', ko: '아일랜드', en: 'Islands' },
  { key: 'campbeltown', ko: '캠벨타운', en: 'Campbeltown' },
  { key: 'lowland', ko: '로우랜드', en: 'Lowland' },
  { key: 'japanese', ko: '재패니즈', en: 'Japanese' },
  { key: 'irish', ko: '아이리시', en: 'Irish' },
  { key: 'american', ko: '아메리칸', en: 'Bourbon' },
  { key: 'world', ko: '월드', en: 'World' },
] as const;
