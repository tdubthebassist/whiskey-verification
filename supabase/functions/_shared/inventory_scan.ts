import { parseJsonObject } from './ai.ts';

export interface InventoryScanResult {
  isWhiskeyBottle: boolean;
  stockPercent: number | null;
  confidence: number | null;
  rejectionReason: string | null;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function normalizeConfidence(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const confidence = Number(value);
  return Number.isFinite(confidence) ? clampNumber(confidence, 0, 1) : null;
}

function normalizeRejectionReason(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const reason = value.trim();
  return reason ? reason : null;
}

export function parseInventoryScanResult(text: string): InventoryScanResult {
  const parsed = parseJsonObject(text, 'Inventory scan');

  if (typeof parsed.is_whiskey_bottle !== 'boolean') {
    throw new Error('Inventory scan returned an invalid whiskey bottle classification');
  }

  const confidence = normalizeConfidence(parsed.confidence);

  if (!parsed.is_whiskey_bottle) {
    return {
      isWhiskeyBottle: false,
      stockPercent: null,
      confidence,
      rejectionReason: normalizeRejectionReason(parsed.rejection_reason),
    };
  }

  const stockPercent = Number(parsed.stock_percent);
  if (!Number.isFinite(stockPercent)) {
    throw new Error('Inventory scan returned an invalid stock percentage');
  }

  return {
    isWhiskeyBottle: true,
    stockPercent: clampNumber(Math.round(stockPercent), 0, 100),
    confidence,
    rejectionReason: null,
  };
}
