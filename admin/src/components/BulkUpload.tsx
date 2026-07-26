import { useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import { enrichByName, checkDuplicateWhiskeys, getSettings, upsertWhiskey } from '../lib/api';
import {
  calculateGlassPrice,
  calculateBottlePrice,
  normalizePricingConfig,
  formatKRW,
  DEFAULT_CONFIG,
} from '../lib/pricing';
import type { BulkUploadRow, WhiskeyInput, PricingConfig } from '../types';
import { REGIONS } from '../types';

interface BulkUploadProps {
  activeBarId?: string;
  onDone: () => void;
  onCancel: () => void;
}

type Phase = 'upload' | 'review';

type RawRow = Record<string, string>;

const DEFAULT_VOLUME = 700;
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_UPLOAD_ROWS = 500;
const REGION_KEYS: ReadonlySet<string> = new Set(REGIONS.map((r) => r.key));

// --- Column header mapping (accepts common English + Korean variants) ---
function normalizeKey(k: string): string {
  return k.replace(/\uFEFF/g, '').trim().toLowerCase().replace(/[\s_()]/g, '');
}

const BRAND_KEYS = ['brand', '브랜드', '이름', 'name'];
const EXPRESSION_KEYS = ['expression', '표현', '표현식', 'expr'];
const COST_KEYS = ['costprice', 'cost', '원가', '구매가', 'price', '가격'];
const VOLUME_KEYS = ['bottlevolumeml', 'volume', 'volumeml', '용량'];

function getField(raw: RawRow, candidates: string[]): string {
  const normalized: Record<string, string> = {};
  for (const key of Object.keys(raw)) normalized[normalizeKey(key)] = raw[key];
  for (const c of candidates) {
    const v = normalized[c];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

function parseCost(v: string): number {
  const cleaned = v.replace(/[₩,\s]/g, '');
  return Number(cleaned);
}

// --- File parsing ---
async function parseCsv(file: File): Promise<RawRow[]> {
  const buffer = await file.arrayBuffer();
  // Korean Excel exports are frequently CP949/EUC-KR. Attempt UTF-8 first;
  // if the decode produces the replacement char (U+FFFD), re-decode as EUC-KR.
  let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  if (text.includes('�')) {
    try {
      text = new TextDecoder('euc-kr').decode(buffer);
    } catch {
      // Browser lacks the euc-kr label; keep the UTF-8 result (한글 may be garbled).
    }
  }
  const result = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true });
  if (result.errors.length > 0) {
    throw new Error(result.errors[0]?.message || 'CSV 형식이 올바르지 않습니다');
  }
  return result.data;
}

async function parseXlsx(file: File): Promise<RawRow[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<RawRow>(sheet, { defval: '', raw: false });
}

function computePrices(costPrice: number, volumeMl: number, cfg: PricingConfig) {
  const glass_price = calculateGlassPrice(costPrice, volumeMl, cfg).finalPrice;
  const bottle_price = calculateBottlePrice(glass_price, volumeMl, cfg.pourSizeMl);
  return { glass_price, bottle_price };
}

function hasSafePositiveNumber(value: number, max: number): boolean {
  return Number.isFinite(value) && value > 0 && value <= max;
}

function duplicateKey(brand: string, expression: string): string {
  return `${brand.toLowerCase().trim()}||${expression.toLowerCase().trim()}`;
}

function validateRow(row: BulkUploadRow): string | null {
  if (!row.brand.trim()) return '브랜드가 비어 있습니다';
  if (!row.expression.trim()) return '표현식이 비어 있습니다';
  if (!REGION_KEYS.has(row.region)) return '지역 값이 올바르지 않습니다';
  if (!hasSafePositiveNumber(row.abv, 100)) return 'ABV가 올바른 숫자가 아닙니다';
  if (row.age !== null && (!Number.isInteger(row.age) || row.age <= 0 || row.age > 100)) {
    return '숙성 연수가 올바른 숫자가 아닙니다';
  }
  if (!hasSafePositiveNumber(row.cost_price, 1_000_000_000)) {
    return '원가가 올바른 숫자가 아닙니다';
  }
  if (!hasSafePositiveNumber(row.bottle_volume_ml, 10_000)) {
    return '용량이 올바른 숫자가 아닙니다';
  }
  return null;
}

export default function BulkUpload({ activeBarId, onDone, onCancel }: BulkUploadProps) {
  const [phase, setPhase] = useState<Phase>('upload');
  const [rows, setRows] = useState<BulkUploadRow[]>([]);
  const [config, setConfig] = useState<PricingConfig>(DEFAULT_CONFIG);
  const [settingsWarning, setSettingsWarning] = useState(false);
  const [dupCheckWarning, setDupCheckWarning] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [registering, setRegistering] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const importRunRef = useRef(0);

  // --- Phase 1: Upload + parse + validate ---
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const runId = importRunRef.current + 1;
    importRunRef.current = runId;
    setFileError(null);
    setDupCheckWarning(false);
    setEnriching(false);
    setRegistering(false);

    if (file.size > MAX_UPLOAD_BYTES) {
      setFileError(`파일은 최대 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB까지 업로드할 수 있습니다.`);
      e.target.value = '';
      return;
    }

    let raw: RawRow[];
    try {
      const lower = file.name.toLowerCase();
      raw = lower.endsWith('.csv') ? await parseCsv(file) : await parseXlsx(file);
    } catch (err) {
      setFileError('파일을 읽지 못했습니다: ' + (err as Error).message);
      e.target.value = '';
      return;
    }

    if (raw.length > MAX_UPLOAD_ROWS) {
      setFileError(`한 번에 최대 ${MAX_UPLOAD_ROWS}행까지 업로드할 수 있습니다.`);
      e.target.value = '';
      return;
    }

    const parsed: BulkUploadRow[] = raw.map((r, i) => {
      const brand = getField(r, BRAND_KEYS);
      const expression = getField(r, EXPRESSION_KEYS);
      const costRaw = getField(r, COST_KEYS);
      const volumeRaw = getField(r, VOLUME_KEYS);
      const cost_price = parseCost(costRaw);
      const bottle_volume_ml = volumeRaw ? Number(volumeRaw) : DEFAULT_VOLUME;

      const base: BulkUploadRow = {
        rowIndex: i,
        brand,
        expression,
        cost_price: Number.isFinite(cost_price) ? cost_price : 0,
        region: 'world',
        abv: 40,
        age: null,
        notes: '',
        glass_price: 0,
        bottle_price: 0,
        bottle_volume_ml,
        status: 'pending',
      };

      const error = validateRow(base);
      return error ? { ...base, status: 'error', error } : base;
    });

    if (parsed.length === 0) {
      setFileError('데이터 행이 없습니다. brand, expression, cost_price 열을 확인해주세요.');
      e.target.value = '';
      return;
    }

    setRows(parsed);
    setPhase('review');
    void runEnrichment(parsed, runId);
    // reset the input so re-selecting the same file fires onChange again
    e.target.value = '';
  };

  // --- Phase 2: Dedupe + enrich (incremental) ---
  const runEnrichment = async (initial: BulkUploadRow[], runId: number) => {
    setEnriching(true);

    // Load pricing Settings; fall back to DEFAULT_CONFIG on failure with a visible warning.
    let cfg = DEFAULT_CONFIG;
    try {
      const data = await getSettings(activeBarId);
      cfg = normalizePricingConfig({
        pourSizeMl: data.pour_size_ml,
        markupMultiplier: data.markup_multiplier,
        marginPct: data.margin_pct,
        roundingUnit: data.rounding_unit,
      });
      if (importRunRef.current !== runId) return;
      setSettingsWarning(false);
    } catch {
      cfg = DEFAULT_CONFIG;
      if (importRunRef.current !== runId) return;
      setSettingsWarning(true);
    }
    if (importRunRef.current !== runId) return;
    setConfig(cfg);

    // Dedupe: mark rows whose brand+expression already exist.
    const validRows = initial.filter((r) => r.status !== 'error');
    let dupKeys = new Set<string>();
    let dupCheckFailed = false;
    try {
      dupKeys = await checkDuplicateWhiskeys(
        validRows.map((r) => ({ brand: r.brand, expression: r.expression })),
        activeBarId,
      );
    } catch {
      dupKeys = new Set();
      dupCheckFailed = true;
    }
    if (importRunRef.current !== runId) return;
    setDupCheckWarning(dupCheckFailed);
    // Mark DB duplicates AND intra-file duplicates (first occurrence wins).
    setRows((prev) => {
      const seenKeys = new Set<string>();
      return prev.map((r) => {
        if (r.status === 'error') return r;
        const key = duplicateKey(r.brand, r.expression);
        if (dupKeys.has(key)) return { ...r, status: 'duplicate' };
        if (seenKeys.has(key)) return { ...r, status: 'duplicate' };
        seenKeys.add(key);
        return r;
      });
    });

    const enrichSeenKeys = new Set<string>();
    const toEnrich = validRows.filter((r) => {
      const key = duplicateKey(r.brand, r.expression);
      if (dupKeys.has(key) || enrichSeenKeys.has(key)) return false;
      enrichSeenKeys.add(key);
      return true;
    });
    setProgress({ done: 0, total: toEnrich.length });

    // Enrich in parallel batches of 5, filling rows incrementally via functional updates
    // so async results never clobber an in-progress user edit.
    for (let i = 0; i < toEnrich.length; i += 5) {
      const batch = toEnrich.slice(i, i + 5);
      await Promise.allSettled(
        batch.map(async (row) => {
          let region = 'world';
          let abv = 40;
          let age: number | null = null;
          let notes = '';
          let factDefaulted = false;
          let enrichSource: BulkUploadRow['enrichSource'] = 'default';

          try {
            const res = await enrichByName(row.brand, row.expression, activeBarId);
            notes = res.notes ?? '';
            if (res.region != null && res.abv != null) {
              region = res.region;
              abv = res.abv;
              age = res.age;
              enrichSource = res.source;
              factDefaulted = false;
            } else {
              region = res.region ?? 'world';
              abv = res.abv ?? 40;
              age = res.age;
              enrichSource = 'default';
              factDefaulted = true;
            }
          } catch {
            factDefaulted = true;
            enrichSource = 'default';
          }

          if (importRunRef.current !== runId) return;
          setRows((prev) =>
            prev.map((r) => {
              if (r.rowIndex !== row.rowIndex || r.status !== 'pending') return r;
              const prices = computePrices(r.cost_price, r.bottle_volume_ml, cfg);
              return {
                ...r,
                region,
                abv,
                age,
                notes,
                enrichSource,
                factDefaulted,
                status: 'enriched',
                ...prices,
              };
            }),
          );
        }),
      );
      if (importRunRef.current !== runId) return;
      setProgress((p) => ({ ...p, done: Math.min(p.done + batch.length, p.total) }));
    }

    if (importRunRef.current === runId) setEnriching(false);
  };

  // --- Editing (recompute prices live on cost/volume change; re-validate on every edit) ---
  const updateRow = (rowIndex: number, patch: Partial<BulkUploadRow>) => {
    setRows((prev) =>
      prev.map((r) => {
        if (r.rowIndex !== rowIndex) return r;
        const next = { ...r, ...patch };
        if (
          r.factDefaulted &&
          ('region' in patch || 'abv' in patch || 'age' in patch)
        ) {
          next.factDefaulted = false;
        }
        if ('cost_price' in patch || 'bottle_volume_ml' in patch) {
          Object.assign(next, computePrices(next.cost_price, next.bottle_volume_ml, config));
        }
        // Re-validate constraints.
        const error = validateRow(next);
        if (error) return { ...next, status: 'error' as const, error };
        // Restore a previously-errored row to enriched once all constraints pass.
        if (next.status === 'error') {
          const prices = computePrices(next.cost_price, next.bottle_volume_ml, config);
          return { ...next, status: 'enriched' as const, error: undefined, ...prices };
        }
        return next;
      }),
    );
  };

  // --- Summary + gating ---
  const summary = useMemo(() => {
    let neu = 0;
    let dup = 0;
    let err = 0;
    let review = 0;
    for (const r of rows) {
      if (r.status === 'duplicate') dup++;
      else if (r.status === 'error') err++;
      else if (r.status === 'enriched') {
        neu++;
        if (r.factDefaulted) review++;
      }
    }
    return { neu, dup, err, review };
  }, [rows]);

  const remaining = progress.total - progress.done;
  const allTerminal = rows.every((r) => r.status !== 'pending');
  const canRegister =
    !enriching
    && allTerminal
    && summary.neu > 0
    && summary.review === 0
    && !dupCheckWarning
    && !registering;

  // --- Phase 4: Register ---
  const handleRegister = async () => {
    const candidates = rows.filter((r) => r.status === 'enriched' && !r.factDefaulted);
    if (candidates.length === 0) return;

    setRegistering(true);
    let existingKeys: Set<string>;
    try {
      existingKeys = await checkDuplicateWhiskeys(
        candidates.map((r) => ({ brand: r.brand, expression: r.expression })),
        activeBarId,
      );
    } catch {
      setDupCheckWarning(true);
      setRegistering(false);
      alert('중복 확인에 실패했습니다. 네트워크를 확인한 후 다시 시도해주세요.');
      return;
    }

    const seenKeys = new Set<string>();
    const duplicateRowIndexes = new Set<number>();
    for (const row of candidates) {
      const key = duplicateKey(row.brand, row.expression);
      if (existingKeys.has(key) || seenKeys.has(key)) duplicateRowIndexes.add(row.rowIndex);
      seenKeys.add(key);
    }
    if (duplicateRowIndexes.size > 0) {
      setRows((prev) => prev.map((row) =>
        duplicateRowIndexes.has(row.rowIndex) ? { ...row, status: 'duplicate' as const } : row,
      ));
    }

    const valid = candidates.filter((row) => !duplicateRowIndexes.has(row.rowIndex));
    if (valid.length === 0) {
      setRegistering(false);
      return;
    }

    let success = 0;
    let fail = 0;
    for (let i = 0; i < valid.length; i += 5) {
      const batch = valid.slice(i, i + 5);
      const results = await Promise.allSettled(
        batch.map((r) => {
          const input: WhiskeyInput = {
            brand: r.brand,
            expression: r.expression,
            region: r.region,
            abv: r.abv,
            age: r.age,
            notes: r.notes,
            glass_price: r.glass_price,
            bottle_price: r.bottle_price,
            cost_price: r.cost_price,
            photo_url: null,
            bottle_volume_ml: r.bottle_volume_ml || DEFAULT_VOLUME,
          };
          return upsertWhiskey(input, undefined, activeBarId);
        }),
      );
      const outcomes = new Map<number, PromiseSettledResult<{ id: number }>>();
      batch.forEach((row, index) => {
        const result = results[index];
        outcomes.set(row.rowIndex, result);
        if (result.status === 'fulfilled') success++;
        else fail++;
      });
      setRows((prev) =>
        prev.map((row) => {
          const res = outcomes.get(row.rowIndex);
          if (!res) return row;
          if (res.status === 'fulfilled') {
            return { ...row, status: 'registered' as const, error: undefined };
          }
          return { ...row, status: 'error' as const, error: (res.reason as Error)?.message || '등록 실패' };
        }),
      );
    }
    setRegistering(false);
    alert(`${success}종 등록${fail > 0 ? ` / ${fail}종 실패` : ''}`);
    if (fail === 0) onDone();
  };

  const sourceLabel = (r: BulkUploadRow): { text: string; color: string } => {
    switch (r.enrichSource) {
      case 'reference':
        return { text: '레퍼런스', color: '#7fa86b' };
      case 'web':
        return { text: '웹 검색', color: '#cd924a' };
      case 'ai_notes_only':
        return { text: '노트만', color: '#b8aa90' };
      default:
        return { text: '기본값', color: '#c2603a' };
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button style={styles.cancelBtn} onClick={() => { importRunRef.current += 1; onCancel(); }}>&larr; 돌아가기</button>
        <h2 style={styles.title}>CSV / 엑셀 일괄 업로드</h2>
      </header>

      <div style={styles.body}>
        {phase === 'upload' && (
          <div style={styles.uploadSection}>
            <h3 style={styles.sectionTitle}>파일 선택</h3>
            <p style={styles.helpText}>
              열 이름: <strong>brand</strong>(브랜드/이름), <strong>expression</strong>(표현식),{' '}
              <strong>cost_price</strong>(원가). CSV 또는 엑셀(.xlsx/.xls) 파일을 지원합니다.
            </p>
            <label style={styles.fileLabel}>
              <input
                type="file"
                accept=".csv,.xlsx,.xls"
                onChange={handleFile}
                style={{ display: 'none' }}
              />
              <span>📄 파일 선택하기</span>
            </label>
            {fileError && <p style={styles.errorText}>{fileError}</p>}
          </div>
        )}

        {phase === 'review' && (
          <div style={styles.reviewSection}>
            {settingsWarning && (
              <div style={styles.warningBanner}>
                ⚠ 가격 공식 설정을 불러오지 못해 기본값으로 계산했습니다. 등록 후 가격을 확인해주세요.
              </div>
            )}
            {dupCheckWarning && (
              <div style={styles.warningBanner}>
                ⚠ 중복 검사를 수행하지 못했습니다. 이미 등록된 위스키가 있을 수 있습니다.
              </div>
            )}

            <div style={styles.summaryBar}>
              <span style={styles.summaryItem}>신규 <strong style={{ color: '#7fa86b' }}>{summary.neu}</strong></span>
              <span style={styles.summaryItem}>중복 <strong style={{ color: '#837763' }}>{summary.dup}</strong></span>
              <span style={styles.summaryItem}>오류 <strong style={{ color: '#c2603a' }}>{summary.err}</strong></span>
              <span style={styles.summaryItem}>확인필요 <strong style={{ color: '#cd924a' }}>{summary.review}</strong></span>
              {enriching && (
                <span style={{ ...styles.summaryItem, marginLeft: 'auto', color: '#cd924a' }}>
                  보강 중… {progress.done}/{progress.total}
                </span>
              )}
            </div>

            <div style={styles.tableWrap}>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>상태</th>
                    <th style={styles.th}>브랜드</th>
                    <th style={styles.th}>표현식</th>
                    <th style={styles.th}>지역</th>
                    <th style={styles.th}>ABV</th>
                    <th style={styles.th}>숙성</th>
                    <th style={styles.th}>노트</th>
                    <th style={styles.th}>용량</th>
                    <th style={styles.thRight}>원가</th>
                    <th style={styles.thRight}>잔</th>
                    <th style={styles.thRight}>보틀</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const editable = r.status === 'enriched' || r.status === 'error';
                    const rowBg =
                      r.status === 'duplicate'
                        ? 'rgba(131,119,99,0.12)'
                        : r.status === 'error'
                        ? 'rgba(194,96,58,0.12)'
                        : r.factDefaulted
                        ? 'rgba(205,146,74,0.12)'
                        : 'transparent';
                    const muted = r.status === 'duplicate' || r.status === 'error';
                    return (
                      <tr key={r.rowIndex} style={{ background: rowBg, opacity: muted ? 0.6 : 1 }}>
                        <td style={styles.td}>
                          {r.status === 'pending' && <span style={styles.badgePending}>처리 중…</span>}
                          {r.status === 'duplicate' && <span style={styles.badgeDup}>중복 — 제외됨</span>}
                          {r.status === 'error' && <span style={styles.badgeError}>{r.error}</span>}
                          {r.status === 'registered' && <span style={styles.badgeSource}>등록됨</span>}
                          {r.status === 'enriched' && (
                            r.factDefaulted ? (
                              <span style={styles.badgeReview}>수동 입력 필요</span>
                            ) : (
                              <span style={{ ...styles.badgeSource, color: sourceLabel(r).color }}>
                                {sourceLabel(r).text}
                              </span>
                            )
                          )}
                        </td>
                        <td style={styles.td}>
                          {editable ? (
                            <input
                              style={styles.cellInput}
                              value={r.brand}
                              onChange={(e) => updateRow(r.rowIndex, { brand: e.target.value })}
                            />
                          ) : (
                            r.brand
                          )}
                        </td>
                        <td style={styles.td}>
                          {editable ? (
                            <input
                              style={styles.cellInput}
                              value={r.expression}
                              onChange={(e) => updateRow(r.rowIndex, { expression: e.target.value })}
                            />
                          ) : (
                            r.expression
                          )}
                        </td>
                        <td style={styles.td}>
                          {editable ? (
                            <select
                              style={styles.cellInput}
                              value={r.region}
                              onChange={(e) => updateRow(r.rowIndex, { region: e.target.value })}
                            >
                              {REGIONS.map((rg) => (
                                <option key={rg.key} value={rg.key}>{rg.ko}</option>
                              ))}
                            </select>
                          ) : (
                            r.region
                          )}
                        </td>
                        <td style={styles.td}>
                          {editable ? (
                            <input
                              style={{ ...styles.cellInput, width: 56 }}
                              type="number"
                              step="0.1"
                              value={r.abv}
                              onChange={(e) => updateRow(r.rowIndex, { abv: Number(e.target.value) })}
                            />
                          ) : (
                            r.status === 'enriched' ? `${r.abv}%` : ''
                          )}
                        </td>
                        <td style={styles.td}>
                          {editable ? (
                            <input
                              style={{ ...styles.cellInput, width: 56 }}
                              type="number"
                              value={r.age ?? ''}
                              placeholder="NAS"
                              onChange={(e) =>
                                updateRow(r.rowIndex, { age: e.target.value ? Number(e.target.value) : null })
                              }
                            />
                          ) : (
                            ''
                          )}
                        </td>
                        <td style={{ ...styles.td, minWidth: 160 }}>
                          {editable ? (
                            <input
                              style={styles.cellInput}
                              value={r.notes}
                              onChange={(e) => updateRow(r.rowIndex, { notes: e.target.value })}
                            />
                          ) : (
                            ''
                          )}
                        </td>
                        <td style={styles.td}>
                          {editable ? (
                            <input
                              style={{ ...styles.cellInput, width: 64 }}
                              type="number"
                              value={r.bottle_volume_ml}
                              onChange={(e) =>
                                updateRow(r.rowIndex, { bottle_volume_ml: Number(e.target.value) || DEFAULT_VOLUME })
                              }
                            />
                          ) : (
                            `${r.bottle_volume_ml}ml`
                          )}
                        </td>
                        <td style={styles.tdRight}>
                          {editable ? (
                            <input
                              style={{ ...styles.cellInput, width: 90, textAlign: 'right' }}
                              type="number"
                              value={r.cost_price}
                              onChange={(e) => updateRow(r.rowIndex, { cost_price: Number(e.target.value) })}
                            />
                          ) : (
                            `₩${formatKRW(r.cost_price)}`
                          )}
                        </td>
                        <td style={{ ...styles.tdRight, color: '#cd924a', fontWeight: 700 }}>
                          {r.status === 'enriched' ? `₩${formatKRW(r.glass_price)}` : '—'}
                        </td>
                        <td style={styles.tdRight}>
                          {r.status === 'enriched' ? `₩${formatKRW(r.bottle_price)}` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={styles.footer}>
              <button style={styles.backStepBtn} onClick={() => { importRunRef.current += 1; setEnriching(false); setPhase('upload'); setRows([]); }}>
                &larr; 다른 파일
              </button>
              <button
                style={{ ...styles.registerBtn, opacity: canRegister ? 1 : 0.4 }}
                onClick={handleRegister}
                disabled={!canRegister}
              >
                {registering
                  ? '등록 중…'
                  : enriching
                  ? `보강 중… (${remaining}종 남음)`
                  : `${summary.neu}종 등록`}
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
  body: {
    flex: 1, overflow: 'auto', padding: '24px 32px',
    display: 'flex', justifyContent: 'center',
  },
  uploadSection: { width: '100%', maxWidth: 600 },
  sectionTitle: {
    fontFamily: '"Cormorant Garamond", serif', fontSize: 18, fontWeight: 600,
    color: '#cd924a', marginBottom: 16,
  },
  helpText: { color: '#b8aa90', fontSize: 14, lineHeight: 1.6, marginBottom: 20 },
  fileLabel: {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '18px 20px', background: '#1d1712',
    border: '1px dashed rgba(221,201,166,0.26)', borderRadius: 8,
    color: '#cd924a', fontSize: 15, cursor: 'pointer',
  },
  errorText: { color: '#c2603a', fontSize: 14, marginTop: 16 },
  reviewSection: { width: '100%', maxWidth: 1100, display: 'flex', flexDirection: 'column', gap: 16 },
  warningBanner: {
    background: 'rgba(194,96,58,0.15)', border: '1px solid rgba(194,96,58,0.4)',
    borderRadius: 8, padding: '12px 16px', color: '#e0a58a', fontSize: 14,
  },
  summaryBar: {
    display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap',
    background: '#1d1712', border: '1px solid rgba(221,201,166,0.13)',
    borderRadius: 8, padding: '12px 18px', fontSize: 14, color: '#b8aa90',
  },
  summaryItem: { display: 'flex', gap: 6, alignItems: 'center' },
  tableWrap: {
    overflowX: 'auto', border: '1px solid rgba(221,201,166,0.13)', borderRadius: 8,
  },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: {
    textAlign: 'left', padding: '10px 12px', color: '#837763',
    fontFamily: '"Cormorant Garamond", serif', fontSize: 12,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    borderBottom: '1px solid rgba(221,201,166,0.13)', whiteSpace: 'nowrap',
  },
  thRight: {
    textAlign: 'right', padding: '10px 12px', color: '#837763',
    fontFamily: '"Cormorant Garamond", serif', fontSize: 12,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    borderBottom: '1px solid rgba(221,201,166,0.13)', whiteSpace: 'nowrap',
  },
  td: {
    padding: '8px 12px', borderBottom: '1px solid rgba(221,201,166,0.06)',
    color: '#ece0cd', verticalAlign: 'middle', whiteSpace: 'nowrap',
  },
  tdRight: {
    padding: '8px 12px', borderBottom: '1px solid rgba(221,201,166,0.06)',
    color: '#ece0cd', textAlign: 'right', whiteSpace: 'nowrap',
  },
  cellInput: {
    width: '100%', minWidth: 60, background: '#1d1712',
    border: '1px solid rgba(221,201,166,0.13)', borderRadius: 6,
    padding: '5px 8px', color: '#ece0cd', fontSize: 13,
    fontFamily: '"Nanum Myeongjo", serif', outline: 'none', boxSizing: 'border-box',
  },
  badgePending: { color: '#cd924a', fontSize: 12 },
  badgeDup: { color: '#837763', fontSize: 12 },
  badgeError: { color: '#c2603a', fontSize: 12 },
  badgeReview: {
    color: '#1a130c', background: '#cd924a', fontSize: 11, fontWeight: 700,
    padding: '3px 8px', borderRadius: 4, whiteSpace: 'nowrap',
  },
  badgeSource: { fontSize: 12, fontWeight: 600 },
  footer: {
    display: 'flex', gap: 12, justifyContent: 'flex-end', paddingTop: 4,
  },
  backStepBtn: {
    padding: '12px 20px', background: '#1d1712',
    border: '1px solid rgba(221,201,166,0.2)', borderRadius: 8,
    color: '#b8aa90', fontSize: 14, cursor: 'pointer',
    fontFamily: '"Nanum Myeongjo", serif',
  },
  registerBtn: {
    padding: '12px 28px', background: '#cd924a', color: '#1a130c',
    border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700,
    fontFamily: '"Cormorant Garamond", serif', cursor: 'pointer',
  },
};
