import type { PricingConfig, PricingResult } from '../types';

export const DEFAULT_CONFIG: PricingConfig = {
  pourSizeMl: 29.5735,    // 1 oz in ml
  markupMultiplier: 3.0,
  marginPct: 15,
  roundingUnit: 1000,
};

export function normalizePricingConfig(
  config: Partial<PricingConfig> | null | undefined,
): PricingConfig {
  const pourSizeMl = Number(config?.pourSizeMl);
  const markupMultiplier = Number(config?.markupMultiplier);
  const marginPct = Number(config?.marginPct);
  const roundingUnit = Number(config?.roundingUnit);

  return {
    pourSizeMl: Number.isFinite(pourSizeMl) && pourSizeMl > 0
      ? pourSizeMl
      : DEFAULT_CONFIG.pourSizeMl,
    markupMultiplier: Number.isFinite(markupMultiplier) && markupMultiplier > 0
      ? markupMultiplier
      : DEFAULT_CONFIG.markupMultiplier,
    marginPct: Number.isFinite(marginPct) && marginPct >= 0
      ? marginPct
      : DEFAULT_CONFIG.marginPct,
    roundingUnit: Number.isFinite(roundingUnit) && roundingUnit > 0
      ? roundingUnit
      : DEFAULT_CONFIG.roundingUnit,
  };
}

/**
 * Calculate glass price from bottle cost using the bar's pricing formula.
 *
 * Default formula (user-specified):
 *   glass_price = (bottle_cost / (bottle_ml * 0.0338140227)) * 3
 *
 * Which is equivalent to:
 *   pourCount = bottle_ml / pour_size_ml  (default pour_size = 29.5735ml = 1oz)
 *   costPerPour = bottle_cost / pourCount
 *   basePrice = costPerPour * multiplier
 *   withMargin = basePrice * (1 + margin% / 100)
 *   finalPrice = round(withMargin / roundingUnit) * roundingUnit
 */
export function calculateGlassPrice(
  bottleCostKrw: number,
  bottleVolumeMl: number,
  config: PricingConfig = DEFAULT_CONFIG,
): PricingResult {
  const safeConfig = normalizePricingConfig(config);
  const safeBottleCost = Number.isFinite(bottleCostKrw) && bottleCostKrw > 0 ? bottleCostKrw : 0;
  const safeBottleVolume = Number.isFinite(bottleVolumeMl) && bottleVolumeMl > 0 ? bottleVolumeMl : 700;
  const pourCount = safeBottleVolume / safeConfig.pourSizeMl;
  const costPerPour = safeBottleCost / pourCount;
  const basePrice = costPerPour * safeConfig.markupMultiplier;
  const withMargin = basePrice * (1 + safeConfig.marginPct / 100);
  const finalPrice =
    Math.round(withMargin / safeConfig.roundingUnit) * safeConfig.roundingUnit;

  return { pourCount, costPerPour, basePrice, withMargin, finalPrice };
}

/**
 * Calculate bottle selling price from glass price and pour count.
 */
export function calculateBottlePrice(
  glassPrice: number,
  bottleVolumeMl: number,
  pourSizeMl: number = DEFAULT_CONFIG.pourSizeMl,
): number {
  const safePourSize = Number.isFinite(pourSizeMl) && pourSizeMl > 0 ? pourSizeMl : DEFAULT_CONFIG.pourSizeMl;
  const safeBottleVolume = Number.isFinite(bottleVolumeMl) && bottleVolumeMl > 0 ? bottleVolumeMl : 700;
  const safeGlassPrice = Number.isFinite(glassPrice) && glassPrice > 0 ? glassPrice : 0;
  const pourCount = safeBottleVolume / safePourSize;
  const raw = safeGlassPrice * pourCount;
  return Math.floor(raw / 1000) * 1000;
}

/**
 * Format KRW price with comma separators.
 */
export function formatKRW(n: number): string {
  return n.toLocaleString('ko-KR');
}
