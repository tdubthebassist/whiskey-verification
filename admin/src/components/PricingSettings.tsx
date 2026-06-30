import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { updateSettings } from '../lib/api';
import { DEFAULT_CONFIG, normalizePricingConfig } from '../lib/pricing';
import type { Settings as SettingsType } from '../types';

interface PricingSettingsProps {
  pin: string;
  onBack: () => void;
}

export default function PricingSettings({ pin, onBack }: PricingSettingsProps) {
  const [pourSize, setPourSize] = useState(DEFAULT_CONFIG.pourSizeMl);
  const [multiplier, setMultiplier] = useState(DEFAULT_CONFIG.markupMultiplier);
  const [marginPct, setMarginPct] = useState(DEFAULT_CONFIG.marginPct);
  const [roundingUnit, setRoundingUnit] = useState(DEFAULT_CONFIG.roundingUnit);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const config = useMemo(
    () => normalizePricingConfig({
      pourSizeMl: pourSize,
      markupMultiplier: multiplier,
      marginPct,
      roundingUnit,
    }),
    [pourSize, multiplier, marginPct, roundingUnit],
  );

  useEffect(() => {
    supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (!data) return;
        const s = data as SettingsType;
        const next = normalizePricingConfig({
          pourSizeMl: s.pour_size_ml,
          markupMultiplier: s.markup_multiplier,
          marginPct: s.margin_pct,
          roundingUnit: s.rounding_unit,
        });
        setPourSize(next.pourSizeMl);
        setMultiplier(next.markupMultiplier);
        setMarginPct(next.marginPct);
        setRoundingUnit(next.roundingUnit);
      });
  }, []);

  const handleSave = async () => {
    if (pourSize <= 0 || multiplier <= 0 || marginPct < 0 || roundingUnit <= 0) {
      setMessage('계산 변수는 0보다 큰 값이어야 합니다.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      await updateSettings(
        pin,
        {
          pour_size_ml: config.pourSizeMl,
          markup_multiplier: config.markupMultiplier,
          margin_pct: config.marginPct,
          rounding_unit: config.roundingUnit,
        } as Partial<SettingsType>,
      );
      setMessage('가격 계산 변수가 저장되었습니다.');
    } catch (err) {
      setMessage('저장 실패: ' + (err as Error).message);
    }
    setSaving(false);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>&larr; 돌아가기</button>
        <h2 style={styles.title}>가격 공식 · PRICING</h2>
      </header>

      <div style={styles.body}>
        <section style={styles.card}>
          <h3 style={styles.sectionTitle}>계산 변수</h3>

          <div style={styles.grid}>
            <div style={styles.field}>
              <label style={styles.label}>잔 크기 (ml)</label>
              <input
                style={styles.input}
                type="number"
                min="1"
                step="0.01"
                value={pourSize}
                onChange={(e) => setPourSize(Number(e.target.value))}
              />
              <span style={styles.hint}>기본값: 29.5735ml (1 oz)</span>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>마크업 배수</label>
              <input
                style={styles.input}
                type="number"
                min="0.1"
                step="0.1"
                value={multiplier}
                onChange={(e) => setMultiplier(Number(e.target.value))}
              />
              <span style={styles.hint}>예: 3.0 = 원가의 3배</span>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>마진 (%)</label>
              <input
                style={styles.input}
                type="number"
                min="0"
                step="1"
                value={marginPct}
                onChange={(e) => setMarginPct(Number(e.target.value))}
              />
              <span style={styles.hint}>기본값: 15%</span>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>반올림 단위 (₩)</label>
              <select
                style={styles.input}
                value={roundingUnit}
                onChange={(e) => setRoundingUnit(Number(e.target.value))}
              >
                <option value={500}>₩500</option>
                <option value={1000}>₩1,000</option>
                <option value={5000}>₩5,000</option>
              </select>
            </div>
          </div>

          <div style={styles.formula}>
            <span style={styles.formulaLabel}>현재 공식</span>
            <code style={styles.formulaCode}>
              (원가 / ({config.pourSizeMl.toFixed(1)}ml 잔)) x {config.markupMultiplier} + {config.marginPct}% {'->'} ₩{config.roundingUnit.toLocaleString()} 단위
            </code>
          </div>
        </section>

        {message && (
          <p style={{
            ...styles.message,
            color: message.includes('실패') || message.includes('0보다') ? '#c2603a' : '#6fae8e',
          }}>
            {message}
          </p>
        )}

        <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? '저장 중...' : '가격 공식 저장'}
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed', inset: 0, background: '#17130f',
    display: 'flex', flexDirection: 'column', color: '#ece0cd',
    fontFamily: '"Nanum Myeongjo", serif',
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 20,
    padding: '18px 32px', borderBottom: '1px solid rgba(221,201,166,0.13)',
  },
  backBtn: {
    background: 'none', border: 'none', color: '#837763', fontSize: 14,
    cursor: 'pointer', fontFamily: '"Nanum Myeongjo", serif',
  },
  title: {
    fontFamily: '"Cormorant Garamond", serif', fontSize: 20, fontWeight: 700,
    color: '#ece0cd', margin: 0,
  },
  body: {
    flex: 1, overflow: 'auto', padding: '24px 32px',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
  },
  card: {
    width: '100%', maxWidth: 640, background: '#1d1712',
    border: '1px solid rgba(221,201,166,0.13)', borderRadius: 12, padding: 24,
  },
  sectionTitle: {
    fontFamily: '"Cormorant Garamond", serif', fontSize: 16, fontWeight: 600,
    color: '#cd924a', margin: '0 0 16px',
  },
  grid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14,
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: {
    fontFamily: '"Cormorant Garamond", serif', fontSize: 12, color: '#837763',
    letterSpacing: '0.1em', textTransform: 'uppercase' as const,
  },
  input: {
    width: '100%', background: '#241c15', border: '1px solid rgba(221,201,166,0.13)',
    borderRadius: 8, padding: '10px 14px', color: '#ece0cd', fontSize: 15,
    fontFamily: '"Nanum Myeongjo", serif', outline: 'none', boxSizing: 'border-box' as const,
  },
  hint: { color: '#837763', fontSize: 11 },
  formula: {
    marginTop: 18, padding: 12, background: '#241c15', borderRadius: 8,
    border: '1px solid rgba(205,146,74,0.2)',
  },
  formulaLabel: { color: '#837763', fontSize: 12, display: 'block', marginBottom: 6 },
  formulaCode: { color: '#cd924a', fontSize: 13, fontFamily: 'monospace', whiteSpace: 'normal' as const },
  message: { fontSize: 14, textAlign: 'center' },
  saveBtn: {
    width: '100%', maxWidth: 640, padding: '14px 24px', background: '#cd924a',
    color: '#1a130c', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700,
    fontFamily: '"Cormorant Garamond", serif', cursor: 'pointer',
  },
};
