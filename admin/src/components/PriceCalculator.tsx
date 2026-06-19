import { useMemo } from 'react';
import { calculateGlassPrice, calculateBottlePrice, formatKRW } from '../lib/pricing';
import type { PricingConfig } from '../types';

interface PriceCalculatorProps {
  bottleCost: number;
  bottleVolumeMl: number;
  config: PricingConfig;
}

export default function PriceCalculator({
  bottleCost,
  bottleVolumeMl,
  config,
}: PriceCalculatorProps) {
  const result = useMemo(
    () => calculateGlassPrice(bottleCost, bottleVolumeMl, config),
    [bottleCost, bottleVolumeMl, config],
  );

  const bottleSellingPrice = useMemo(
    () => calculateBottlePrice(result.finalPrice, bottleVolumeMl, config.pourSizeMl),
    [result.finalPrice, bottleVolumeMl, config.pourSizeMl],
  );

  if (!bottleCost || bottleCost <= 0) {
    return (
      <div style={styles.container}>
        <p style={styles.placeholder}>구매 가격을 입력하면 판매가가 계산됩니다.</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.heading}>가격 계산 · PRICE BREAKDOWN</h3>

      <div style={styles.steps}>
        <div style={styles.step}>
          <span style={styles.label}>잔 수</span>
          <span style={styles.value}>
            {bottleVolumeMl}ml &divide; {config.pourSizeMl.toFixed(1)}ml ={' '}
            <strong>{result.pourCount.toFixed(1)}</strong> 잔
          </span>
        </div>

        <div style={styles.step}>
          <span style={styles.label}>잔당 원가</span>
          <span style={styles.value}>
            &won;{formatKRW(bottleCost)} &divide; {result.pourCount.toFixed(1)} ={' '}
            <strong>&won;{formatKRW(Math.round(result.costPerPour))}</strong>
          </span>
        </div>

        <div style={styles.step}>
          <span style={styles.label}>기본가 (&times;{config.markupMultiplier})</span>
          <span style={styles.value}>
            &won;{formatKRW(Math.round(result.costPerPour))} &times; {config.markupMultiplier} ={' '}
            <strong>&won;{formatKRW(Math.round(result.basePrice))}</strong>
          </span>
        </div>

        <div style={styles.step}>
          <span style={styles.label}>마진 (+{config.marginPct}%)</span>
          <span style={styles.value}>
            &won;{formatKRW(Math.round(result.basePrice))} + {config.marginPct}% ={' '}
            <strong>&won;{formatKRW(Math.round(result.withMargin))}</strong>
          </span>
        </div>

        <div style={styles.divider} />

        <div style={styles.finalRow}>
          <div style={styles.finalCard}>
            <span style={styles.finalLabel}>잔 · GLASS</span>
            <span style={styles.finalPrice}>
              <span style={styles.won}>&won;</span>
              {formatKRW(result.finalPrice)}
            </span>
            <span style={styles.rounding}>
              (&won;{config.roundingUnit.toLocaleString()} 단위 반올림)
            </span>
          </div>

          <div style={styles.finalCard}>
            <span style={styles.finalLabel}>보틀 · BOTTLE</span>
            <span style={styles.finalPrice}>
              <span style={styles.won}>&won;</span>
              {formatKRW(bottleSellingPrice)}
            </span>
          </div>
        </div>
      </div>

      {(result.finalPrice < 5000 || result.finalPrice > 200000) && (
        <p style={styles.warning}>
          {result.finalPrice < 5000
            ? '가격이 너무 낮습니다. 원가를 확인해주세요.'
            : '가격이 매우 높습니다. 확인 후 조정해주세요.'}
        </p>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    background: '#1d1712',
    border: '1px solid rgba(221,201,166,0.13)',
    borderRadius: 12,
    padding: 24,
  },
  placeholder: {
    color: '#837763',
    fontFamily: '"Nanum Myeongjo", serif',
    fontSize: 15,
    textAlign: 'center',
    margin: 0,
  },
  heading: {
    fontFamily: '"Cormorant Garamond", serif',
    fontSize: 14,
    fontWeight: 600,
    color: '#837763',
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
    margin: '0 0 18px',
  },
  steps: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  step: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontFamily: '"Nanum Myeongjo", serif',
    fontSize: 14,
    color: '#b8aa90',
  },
  value: {
    fontFamily: '"Cormorant Garamond", serif',
    fontSize: 15,
    color: '#ece0cd',
  },
  divider: {
    height: 1,
    background: 'rgba(221,201,166,0.26)',
    margin: '8px 0',
  },
  finalRow: {
    display: 'flex',
    gap: 14,
  },
  finalCard: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '14px 18px',
    background: '#241c15',
    border: '1px solid rgba(205,146,74,0.4)',
    borderRadius: 10,
  },
  finalLabel: {
    fontFamily: '"Cormorant Garamond", serif',
    fontSize: 11,
    fontWeight: 500,
    color: '#837763',
    letterSpacing: '0.15em',
    textTransform: 'uppercase' as const,
  },
  finalPrice: {
    fontFamily: '"Cormorant Garamond", serif',
    fontSize: 28,
    fontWeight: 700,
    color: '#cd924a',
  },
  won: {
    fontSize: 16,
    color: '#837763',
    marginRight: 3,
  },
  rounding: {
    fontFamily: '"Nanum Myeongjo", serif',
    fontSize: 11,
    color: '#837763',
  },
  warning: {
    marginTop: 12,
    padding: '8px 12px',
    background: 'rgba(194,96,58,0.15)',
    borderRadius: 6,
    color: '#c2603a',
    fontFamily: '"Nanum Myeongjo", serif',
    fontSize: 13,
  },
};
