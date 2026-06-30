import { useState, useMemo, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { upsertWhiskey, identifyBottle } from '../lib/api';
import { calculateGlassPrice, calculateBottlePrice, normalizePricingConfig } from '../lib/pricing';
import { REFERENCE_WHISKEYS, searchWhiskeys } from '../data/reference-whiskeys';
import PriceCalculator from './PriceCalculator';
import type { Whiskey, WhiskeyInput, PricingConfig, Settings, ReferenceWhiskey } from '../types';
import { REGIONS } from '../types';

interface AddBottleProps {
  pin: string;
  editing?: Whiskey | null;
  onDone: () => void;
  onCancel: () => void;
}

type Step = 'identify' | 'cost' | 'review';

export default function AddBottle({ pin, editing, onDone, onCancel }: AddBottleProps) {
  const [step, setStep] = useState<Step>(editing ? 'review' : 'identify');

  // Form state
  const [brand, setBrand] = useState(editing?.brand ?? '');
  const [expression, setExpression] = useState(editing?.expression ?? '');
  const [region, setRegion] = useState(editing?.region ?? 'islay');
  const [abv, setAbv] = useState(editing?.abv ?? 40);
  const [age, setAge] = useState<number | null>(editing?.age ?? null);
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [bottleVolume, setBottleVolume] = useState(editing?.bottle_volume_ml ?? 700);
  const [costPrice, setCostPrice] = useState(editing?.cost_price ?? 0);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);

  // Photo state
  const [photoLoading, setPhotoLoading] = useState(false);

  // Settings
  const [config, setConfig] = useState<PricingConfig>({
    pourSizeMl: 29.5735, markupMultiplier: 3, marginPct: 15, roundingUnit: 1000,
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('settings').select('*').eq('id', 1).single().then(({ data }) => {
      if (data) {
        setConfig(normalizePricingConfig({
          pourSizeMl: (data as Settings).pour_size_ml,
          markupMultiplier: (data as Settings).markup_multiplier,
          marginPct: (data as Settings).margin_pct,
          roundingUnit: (data as Settings).rounding_unit,
        }));
      }
    });
  }, []);

  // Search results
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];
    return searchWhiskeys(searchQuery, REFERENCE_WHISKEYS).slice(0, 8);
  }, [searchQuery]);

  const selectWhiskey = (w: ReferenceWhiskey) => {
    setBrand(w.brand);
    setExpression(w.expression);
    setRegion(w.region);
    setAbv(w.abv);
    setAge(w.age);
    setNotes(w.notes);
    setSearchQuery('');
    setShowResults(false);
    setStep('cost');
  };

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setPhotoLoading(true);
    try {
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.readAsDataURL(file);
      });

      const result = await identifyBottle(pin, base64);
      setBrand(result.brand || '');
      setExpression(result.expression || '');
      setRegion(result.region || 'world');
      setAbv(result.abv || 40);
      setAge(result.age);
      setNotes(result.notes || '');
      setStep('cost');
    } catch (err) {
      alert('인식 실패: ' + (err as Error).message + '\n수동으로 입력해주세요.');
    }
    setPhotoLoading(false);
  };

  // Calculate prices
  const pricing = useMemo(() => {
    if (!costPrice || costPrice <= 0) return null;
    return calculateGlassPrice(costPrice, bottleVolume, config);
  }, [costPrice, bottleVolume, config]);

  const handleSave = async () => {
    if (!brand.trim()) { alert('브랜드명을 입력해주세요.'); return; }
    if (!pricing) { alert('구매 가격을 입력해주세요.'); return; }

    // Duplicate check (only for new whiskeys, not edits)
    if (!editing) {
      const { data: existing } = await supabase
        .from('whiskeys')
        .select('id, brand, expression')
        .eq('brand', brand.trim())
        .eq('expression', expression.trim());

      if (existing && existing.length > 0) {
        if (!confirm(`"${(brand + ' ' + expression).trim()}"은(는) 이미 등록되어 있습니다.\n그래도 추가하시겠습니까?`)) {
          return;
        }
      }
    }

    setSaving(true);
    try {
      const input: WhiskeyInput = {
        brand: brand.trim(),
        expression: expression.trim(),
        region,
        abv,
        age,
        notes: notes.trim(),
        glass_price: pricing.finalPrice,
        bottle_price: calculateBottlePrice(pricing.finalPrice, bottleVolume, config.pourSizeMl),
        cost_price: costPrice,
        photo_url: editing?.photo_url ?? null,
        bottle_volume_ml: bottleVolume,
      };

      await upsertWhiskey(pin, input, editing?.id);
      onDone();
    } catch (err) {
      alert('저장 실패: ' + (err as Error).message);
    }
    setSaving(false);
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button style={styles.cancelBtn} onClick={onCancel}>&larr; 돌아가기</button>
        <h2 style={styles.title}>{editing ? '위스키 수정' : '새 위스키 추가'}</h2>
        <div style={styles.steps}>
          {(['identify', 'cost', 'review'] as Step[]).map((s, i) => (
            <span key={s} style={{
              ...styles.stepDot,
              background: step === s ? '#cd924a' : i <= ['identify', 'cost', 'review'].indexOf(step)
                ? 'rgba(205,146,74,0.5)' : 'rgba(221,201,166,0.2)',
            }} />
          ))}
        </div>
      </header>

      <div style={styles.body}>
        {step === 'identify' && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>1. 위스키 찾기</h3>

            <div style={{ position: 'relative' }}>
              <input
                style={styles.input}
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }}
                onFocus={() => setShowResults(true)}
                placeholder="위스키 이름으로 검색 (예: Lagavulin, 라프로익)"
              />
              {showResults && searchResults.length > 0 && (
                <div style={styles.dropdown}>
                  {searchResults.map((w, i) => (
                    <button key={i} style={styles.dropdownItem} onClick={() => selectWhiskey(w)}>
                      <strong>{w.brand}</strong> {w.expression}
                      <span style={styles.dropdownMeta}>{w.region} · {w.abv}%</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={styles.orDivider}>
              <span style={styles.orLine} />
              <span style={styles.orText}>또는</span>
              <span style={styles.orLine} />
            </div>

            <label style={styles.photoLabel}>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePhoto}
                style={{ display: 'none' }}
              />
              {photoLoading ? (
                <span>인식 중...</span>
              ) : (
                <span>📷 사진으로 인식하기</span>
              )}
            </label>

            <div style={styles.orDivider}>
              <span style={styles.orLine} />
              <span style={styles.orText}>또는 직접 입력</span>
              <span style={styles.orLine} />
            </div>

            <div style={styles.formGrid}>
              <div style={styles.field}>
                <label style={styles.label}>브랜드 *</label>
                <input style={styles.input} value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Lagavulin" />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>표현식</label>
                <input style={styles.input} value={expression} onChange={(e) => setExpression(e.target.value)} placeholder="16" />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>지역</label>
                <select style={styles.input} value={region} onChange={(e) => setRegion(e.target.value)}>
                  {REGIONS.map((r) => <option key={r.key} value={r.key}>{r.ko} ({r.en})</option>)}
                </select>
              </div>
              <div style={styles.field}>
                <label style={styles.label}>ABV (%)</label>
                <input style={styles.input} type="number" step="0.1" value={abv} onChange={(e) => setAbv(Number(e.target.value))} />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>숙성 (년)</label>
                <input style={styles.input} type="number" value={age ?? ''} onChange={(e) => setAge(e.target.value ? Number(e.target.value) : null)} placeholder="NAS" />
              </div>
              <div style={styles.field}>
                <label style={styles.label}>용량 (ml)</label>
                <input style={styles.input} type="number" value={bottleVolume} onChange={(e) => setBottleVolume(Number(e.target.value))} />
              </div>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>테이스팅 노트</label>
              <textarea style={{ ...styles.input, height: 60, resize: 'vertical' }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="짙은 피트와 셰리의 단맛, 오래 남는 스모크" />
            </div>

            {brand && (
              <button style={styles.nextBtn} onClick={() => setStep('cost')}>
                다음: 가격 입력 &rarr;
              </button>
            )}
          </div>
        )}

        {step === 'cost' && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>
              2. 가격 설정 — {brand} {expression}
            </h3>

            <div style={styles.field}>
              <label style={styles.label}>구매 가격 (₩)</label>
              <input
                style={{ ...styles.input, fontSize: 24, fontWeight: 700, textAlign: 'right' }}
                type="number"
                value={costPrice || ''}
                onChange={(e) => setCostPrice(Number(e.target.value))}
                placeholder="150,000"
                autoFocus
              />
            </div>

            <div style={styles.field}>
              <label style={styles.label}>마진 (%)</label>
              <input
                style={{ ...styles.input, width: 100 }}
                type="number"
                value={config.marginPct}
                onChange={(e) => setConfig({ ...config, marginPct: Number(e.target.value) || 0 })}
              />
            </div>

            <PriceCalculator
              bottleCost={costPrice}
              bottleVolumeMl={bottleVolume}
              config={config}
            />

            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button style={styles.backStepBtn} onClick={() => setStep('identify')}>&larr; 이전</button>
              <button
                style={{ ...styles.nextBtn, flex: 1, opacity: costPrice > 0 ? 1 : 0.4 }}
                onClick={() => {
                  if (!costPrice || costPrice <= 0) {
                    alert('구매 가격을 입력해주세요.');
                    return;
                  }
                  setStep('review');
                }}
              >
                다음: 확인 &rarr;
              </button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>3. 최종 확인</h3>

            <div style={styles.reviewCard}>
              <div style={styles.reviewRow}><span style={styles.reviewLabel}>브랜드</span><span>{brand}</span></div>
              <div style={styles.reviewRow}><span style={styles.reviewLabel}>표현식</span><span>{expression || '—'}</span></div>
              <div style={styles.reviewRow}><span style={styles.reviewLabel}>지역</span><span>{region}</span></div>
              <div style={styles.reviewRow}><span style={styles.reviewLabel}>ABV</span><span>{abv}%</span></div>
              <div style={styles.reviewRow}><span style={styles.reviewLabel}>숙성</span><span>{age ? `${age}년` : 'NAS'}</span></div>
              <div style={styles.reviewRow}><span style={styles.reviewLabel}>노트</span><span style={{ flex: 1 }}>{notes || '—'}</span></div>
              {pricing && (
                <>
                  <div style={{ ...styles.reviewRow, borderTop: '1px solid rgba(221,201,166,0.2)', paddingTop: 12, marginTop: 8 }}>
                    <span style={styles.reviewLabel}>구매가</span>
                    <span>₩{costPrice.toLocaleString('ko-KR')}</span>
                  </div>
                  <div style={styles.reviewRow}>
                    <span style={{ ...styles.reviewLabel, color: '#cd924a' }}>잔 가격</span>
                    <span style={{ color: '#cd924a', fontWeight: 700, fontSize: 20 }}>₩{pricing.finalPrice.toLocaleString('ko-KR')}</span>
                  </div>
                  <div style={styles.reviewRow}>
                    <span style={styles.reviewLabel}>보틀 가격</span>
                    <span>₩{calculateBottlePrice(pricing.finalPrice, bottleVolume, config.pourSizeMl).toLocaleString('ko-KR')}</span>
                  </div>
                </>
              )}
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
              <button style={styles.backStepBtn} onClick={() => setStep('cost')}>&larr; 수정</button>
              <button
                style={{ ...styles.saveBtn, flex: 1 }}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? '저장 중...' : editing ? '수정 완료' : '메뉴에 추가'}
              </button>
            </div>
          </div>
        )}
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
  cancelBtn: {
    background: 'none', border: 'none', color: '#837763', fontSize: 14,
    cursor: 'pointer', fontFamily: '"Nanum Myeongjo", serif',
  },
  title: {
    fontFamily: '"Cormorant Garamond", serif', fontSize: 20, fontWeight: 700,
    color: '#ece0cd', margin: 0, flex: 1,
  },
  steps: { display: 'flex', gap: 8 },
  stepDot: { width: 10, height: 10, borderRadius: '50%', transition: 'background 0.2s' },
  body: {
    flex: 1, overflow: 'auto', padding: '24px 32px',
    display: 'flex', justifyContent: 'center',
  },
  section: { width: '100%', maxWidth: 600 },
  sectionTitle: {
    fontFamily: '"Cormorant Garamond", serif', fontSize: 18, fontWeight: 600,
    color: '#cd924a', marginBottom: 20,
  },
  input: {
    width: '100%', background: '#1d1712', border: '1px solid rgba(221,201,166,0.13)',
    borderRadius: 8, padding: '10px 14px', color: '#ece0cd', fontSize: 15,
    fontFamily: '"Nanum Myeongjo", serif', outline: 'none', boxSizing: 'border-box' as const,
  },
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
    background: '#1d1712', border: '1px solid rgba(221,201,166,0.26)',
    borderRadius: 8, marginTop: 4, maxHeight: 300, overflow: 'auto',
  },
  dropdownItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', padding: '10px 14px', background: 'none', border: 'none',
    borderBottom: '1px solid rgba(221,201,166,0.08)', color: '#ece0cd',
    fontSize: 14, fontFamily: '"Nanum Myeongjo", serif', cursor: 'pointer', textAlign: 'left',
  },
  dropdownMeta: { color: '#837763', fontSize: 12 },
  orDivider: { display: 'flex', alignItems: 'center', gap: 16, margin: '20px 0' },
  orLine: { flex: 1, height: 1, background: 'rgba(221,201,166,0.13)' },
  orText: { color: '#837763', fontSize: 12, whiteSpace: 'nowrap' },
  photoLabel: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '14px 20px', background: '#1d1712',
    border: '1px dashed rgba(221,201,166,0.26)', borderRadius: 8,
    color: '#b8aa90', fontSize: 15, cursor: 'pointer',
  },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  field: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 },
  label: {
    fontFamily: '"Cormorant Garamond", serif', fontSize: 12, color: '#837763',
    letterSpacing: '0.1em', textTransform: 'uppercase' as const,
  },
  nextBtn: {
    marginTop: 20, padding: '12px 24px', background: '#cd924a', color: '#1a130c',
    border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 600,
    fontFamily: '"Cormorant Garamond", serif', cursor: 'pointer', width: '100%',
  },
  backStepBtn: {
    padding: '12px 20px', background: '#1d1712',
    border: '1px solid rgba(221,201,166,0.2)', borderRadius: 8,
    color: '#b8aa90', fontSize: 14, cursor: 'pointer',
    fontFamily: '"Nanum Myeongjo", serif',
  },
  saveBtn: {
    padding: '14px 24px', background: '#cd924a', color: '#1a130c',
    border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700,
    fontFamily: '"Cormorant Garamond", serif', cursor: 'pointer',
  },
  reviewCard: {
    background: '#1d1712', border: '1px solid rgba(221,201,166,0.13)',
    borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 10,
  },
  reviewRow: { display: 'flex', justifyContent: 'space-between', fontSize: 15 },
  reviewLabel: { color: '#837763', fontSize: 13 },
};
