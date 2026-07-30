import { parseJsonObject } from './ai.ts';

export interface InventoryScanResult {
  isWhiskeyBottle: boolean;
  stockPercent: number | null;
  confidence: number | null;
  rejectionReason: string | null;
  needsMorePhotos: boolean;
  photoGuidance: string | null;
  geometry: InventoryScanGeometry | null;
}

export interface InventoryPoint {
  x: number;
  y: number;
}

export interface InventoryScanGeometry {
  neckBoundary: InventoryPoint;
  bottomBoundary: InventoryPoint;
  liquidLevel: InventoryPoint;
  bottleAngleDegrees: number | null;
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

function normalizePhotoGuidance(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const guidance = value.trim();
  return guidance ? guidance.slice(0, 400) : null;
}

function normalizePoint(value: unknown): InventoryPoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const point = value as Record<string, unknown>;
  const x = Number(point.x);
  const y = Number(point.y);
  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1000 || y < 0 || y > 1000) {
    return null;
  }

  return { x, y };
}

function normalizeGeometry(value: unknown): InventoryScanGeometry | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const geometry = value as Record<string, unknown>;
  const neckBoundary = normalizePoint(geometry.neck_boundary);
  const bottomBoundary = normalizePoint(geometry.bottom_boundary);
  const liquidLevel = normalizePoint(geometry.liquid_level);
  if (!neckBoundary || !bottomBoundary || !liquidLevel) {
    return null;
  }

  const angle = Number(geometry.bottle_angle_degrees);
  return {
    neckBoundary,
    bottomBoundary,
    liquidLevel,
    bottleAngleDegrees: Number.isFinite(angle) ? clampNumber(angle, -180, 180) : null,
  };
}

export function calculateStockPercentFromGeometry(
  geometry: InventoryScanGeometry,
): number | null {
  const axisX = geometry.neckBoundary.x - geometry.bottomBoundary.x;
  const axisY = geometry.neckBoundary.y - geometry.bottomBoundary.y;
  const axisLengthSquared = axisX * axisX + axisY * axisY;
  if (axisLengthSquared < 1) {
    return null;
  }

  const liquidX = geometry.liquidLevel.x - geometry.bottomBoundary.x;
  const liquidY = geometry.liquidLevel.y - geometry.bottomBoundary.y;
  const axisPosition = (liquidX * axisX + liquidY * axisY) / axisLengthSquared;
  return clampNumber(Math.round(axisPosition * 100), 0, 100);
}

export function parseInventoryScanResult(text: string): InventoryScanResult {
  const parsed = parseJsonObject(text, 'Inventory scan');

  if (typeof parsed.is_whiskey_bottle !== 'boolean') {
    throw new Error('Inventory scan returned an invalid whiskey bottle classification');
  }

  const confidence = normalizeConfidence(parsed.confidence);
  const needsMorePhotos = parsed.needs_more_photos === true;
  const photoGuidance = normalizePhotoGuidance(parsed.photo_guidance);

  if (!parsed.is_whiskey_bottle) {
    return {
      isWhiskeyBottle: false,
      stockPercent: null,
      confidence,
      rejectionReason: normalizeRejectionReason(parsed.rejection_reason),
      needsMorePhotos: false,
      photoGuidance: null,
      geometry: null,
    };
  }

  const stockPercent = Number(parsed.stock_percent);
  if (
    !needsMorePhotos
    && (parsed.stock_percent === null || parsed.stock_percent === undefined || !Number.isFinite(stockPercent))
  ) {
    throw new Error('Inventory scan returned an invalid stock percentage');
  }

  const geometry = normalizeGeometry(parsed.geometry);
  const geometryStockPercent = geometry
    ? calculateStockPercentFromGeometry(geometry)
    : null;

  return {
    isWhiskeyBottle: true,
    stockPercent: needsMorePhotos
      ? null
      : geometryStockPercent ?? clampNumber(Math.round(stockPercent), 0, 100),
    confidence,
    rejectionReason: null,
    needsMorePhotos,
    photoGuidance,
    geometry,
  };
}
