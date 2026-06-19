import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { updateSettings } from '../lib/api';
import type { Settings as SettingsType } from '../types';

interface SettingsProps {
  pin: string;
  onBack: () => void;
}

export default function Settings({ pin, onBack }: SettingsProps) {
  const [pourSize, setPourSize] = useState(29.5735);
  const [multiplier, setMultiplier] = useState(3.0);
  const [marginPct, setMarginPct] = useState(15);
  const [roundingUnit, setRoundingUnit] = useState(1000);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    supabase
      .from('settings')
      .select('*')
      .eq('id', 1)
      .single()
      .then(({ data }) => {
        if (data) {
          const s = data as SettingsType;
          setPourSize(s.pour_size_ml);
          setMultiplier(s.markup_multiplier);
          setMarginPct(s.margin_pct);
          setRoundingUnit(s.rounding_unit);
        }
      });
  }, []);

  const handleSave = async () => {
    if (newPin && newPin !== confirmPin) {
      setMessage('PIN이 일치하지 않습니다.');
      return;
    }
    if (newPin && newPin.length !== 4) {
      setMessage('PIN은 4자리여야 합니다.');
      return;
    }

    setSaving(true);
    setMessage('');
    try {
      const body: Record<string, unknown> = {
        pin,
        settings: {
          pour_size_ml: pourSize,
          markup_multiplier: multiplier,
          margin_pct: marginPct,
          rounding_unit: roundingUnit,
        },
      };
      if (newPin) {
        (body as Record<string, unknown>).newPin = newPin;
      }

      await updateSettings(pin, body as never);
      setMessage('설정이 저장되었습니다.');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      setMessage('저장 실패: ' + (err as Error).message);
    }
    setSaving(false);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>&larr; 돌아가기</button>
        <h2 style={styles.title}>설정 · SETTINGS</h2>
      </header>

      <div style={styles.body}>
        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>가격 계산 공식</h3>

          <div style={styles.field}>
            <label style={styles.label}>잔 크기 (ml)</label>
            <input
              style={styles.input}
              type="number"
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
              step="0.1"
              value={multiplier}
              onChange={(e) => setMultiplier(Number(e.target.value))}
            />
            <span style={styles.hint}>기본값: 3.0 (원가의 3배)</span>
          </div>

          <div style={styles.field}>
            <label style={styles.label}>마진 (%)</label>
            <input
              style={styles.input}
              type="number"
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

          <div style={styles.formula}>
            <span style={styles.formulaLabel}>현재 공식:</span>
            <code style={styles.formulaCode}>
              (원가 &divide; ({pourSize.toFixed(1)}ml 잔)) &times; {multiplier} + {marginPct}% &rarr; ₩{roundingUnit.toLocaleString()} 단위
            </code>
          </div>
        </div>

        <div style={styles.card}>
          <h3 style={styles.sectionTitle}>PIN 변경</h3>

          <div style={styles.field}>
            <label style={styles.label}>새 PIN (4자리)</label>
            <input
              style={styles.input}
              type="password"
              maxLength={4}
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
              placeholder="비우면 변경하지 않음"
            />
          </div>

          {newPin && (
            <div style={styles.field}>
              <label style={styles.label}>PIN 확인</label>
              <input
                style={styles.input}
                type="password"
                maxLength={4}
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                placeholder="다시 입력"
              />
            </div>
          )}
        </div>

        {message && (
          <p style={{
            ...styles.message,
            color: message.includes('실패') || message.includes('일치') ? '#c2603a' : '#6fae8e',
          }}>
            {message}
          </p>
        )}

        <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? '저장 중...' : '설정 저장'}
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
    width: '100%', maxWidth: 500, background: '#1d1712',
    border: '1px solid rgba(221,201,166,0.13)', borderRadius: 12, padding: 24,
  },
  sectionTitle: {
    fontFamily: '"Cormorant Garamond", serif', fontSize: 16, fontWeight: 600,
    color: '#cd924a', marginBottom: 16, margin: '0 0 16px',
  },
  field: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 },
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
    marginTop: 12, padding: 12, background: '#241c15', borderRadius: 8,
    border: '1px solid rgba(205,146,74,0.2)',
  },
  formulaLabel: { color: '#837763', fontSize: 12, display: 'block', marginBottom: 6 },
  formulaCode: { color: '#cd924a', fontSize: 13, fontFamily: 'monospace' },
  message: { fontSize: 14, textAlign: 'center' },
  saveBtn: {
    width: '100%', maxWidth: 500, padding: '14px 24px', background: '#cd924a',
    color: '#1a130c', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700,
    fontFamily: '"Cormorant Garamond", serif', cursor: 'pointer',
  },
};
