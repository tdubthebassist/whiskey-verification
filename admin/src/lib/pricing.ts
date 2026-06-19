import type { PricingConfig, PricingResult } from '../types';

export const DEFAULT_CONFIG: PricingConfig = {
  pourSizeMl: 29.5735,    // 1 oz in ml
  markupMultiplier: 3.0,
  marginPct: 15,
  roundingUnit: 1000,
};

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
  const pourCount = bottleVolumeMl / config.pourSizeMl;
  const costPerPour = bottleCostKrw / pourCount;
  const basePrice = costPerPour * config.markupMultiplier;
  const withMargin = basePrice * (1 + config.marginPct / 100);
  const finalPrice =
    Math.round(withMargin / config.roundingUnit) * config.roundingUnit;

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
  const pourCount = bottleVolumeMl / pourSizeMl;
  return Math.round(glassPrice * pourCount);
}

/**
 * Format KRW price with comma separators.
 */
export function formatKRW(n: number): string {
  return n.toLocaleString('ko-KR');
}
