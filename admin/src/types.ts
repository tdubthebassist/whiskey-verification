export interface Whiskey {
  id: number;
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
  id: number;
  pin_hash: string;
  pour_size_ml: number;
  markup_multiplier: number;
  margin_pct: number;
  rounding_unit: number;
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
