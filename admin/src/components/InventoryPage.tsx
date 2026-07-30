import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, CSSProperties, ReactNode } from 'react';
import {
  correctInventoryLog,
  EdgeFunctionError,
  getInventoryDailyTrend,
  listWhiskeys,
  scanInventory,
} from '../lib/api';
import { readImageAsDataUrl } from '../lib/image';
import type { InventoryDailyTrendPoint, Whiskey } from '../types';

interface InventoryPageProps {
  activeBarId?: string;
  onBack: () => void;
}

const CHART_WIDTH = 520;
const CHART_HEIGHT = 160;
const CHART_PAD_X = 18;
const CHART_PAD_Y = 14;
const CHART_PLOT_WIDTH = CHART_WIDTH - CHART_PAD_X * 2;
const CHART_PLOT_HEIGHT = CHART_HEIGHT - CHART_PAD_Y * 2;

function stockColor(pct: number | null): string {
  if (pct === null) return '#837763';
  if (pct <= 20) return '#c2603a';
  if (pct <= 50) return '#cd924a';
  return '#4a8c5c';
}

function formatServerDay(day: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return `${day.slice(5, 7)}/${day.slice(8, 10)}`;
  }

  return day;
}

function formatTimestampDate(value: string): string {
  return new Date(value).toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('ko-KR', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatTrendPointDate(point: InventoryDailyTrendPoint): string {
  return point.day ? formatServerDay(point.day) : formatTimestampDate(point.scanned_at);
}

function chartPointPosition(
  point: InventoryDailyTrendPoint,
  index: number,
  totalPoints: number,
): { x: number; y: number } {
  const denom = Math.max(totalPoints - 1, 1);

  return {
    x: CHART_PAD_X + (index / denom) * CHART_PLOT_WIDTH,
    y: CHART_PAD_Y + (1 - point.stock_percent / 100) * CHART_PLOT_HEIGHT,
  };
}

function buildPath(points: InventoryDailyTrendPoint[]): string {
  if (points.length === 0) return '';

  return points
    .map((point, index) => {
      const { x, y } = chartPointPosition(point, index, points.length);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

export default function InventoryPage({ activeBarId, onBack }: InventoryPageProps) {
  const [whiskeys, setWhiskeys] = useState<Whiskey[]>([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [trend, setTrend] = useState<InventoryDailyTrendPoint[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [editingLogId, setEditingLogId] = useState<number | null>(null);
  const [correctionValue, setCorrectionValue] = useState('');
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [scanning, setScanning] = useState<number | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const loadWhiskeys = useCallback(async () => {
    const rows = await listWhiskeys(activeBarId);
    setWhiskeys(rows);
    setSelectedId((current) => current ?? rows[0]?.id ?? null);
  }, [activeBarId]);

  useEffect(() => {
    void loadWhiskeys();
  }, [loadWhiskeys]);

  const selectedWhiskey = useMemo(
    () => whiskeys.find((w) => w.id === selectedId) ?? null,
    [selectedId, whiskeys],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return whiskeys;

    return whiskeys.filter((w) =>
      w.brand.toLowerCase().includes(q) || w.expression.toLowerCase().includes(q),
    );
  }, [query, whiskeys]);

  const loadTrend = async (whiskeyId: number) => {
    setTrendLoading(true);
    setTrendError(null);
    try {
      const rows = await getInventoryDailyTrend(whiskeyId, activeBarId);
      setTrend(rows);
    } catch (err) {
      setTrend([]);
      setTrendError((err as Error).message);
    } finally {
      setTrendLoading(false);
    }
  };

  useEffect(() => {
    if (selectedId === null) return;
    void Promise.resolve().then(() => loadTrend(selectedId));
  }, [selectedId]);

  const selectWhiskey = (id: number) => {
    setEditingLogId(null);
    setCorrectionValue('');
    setCorrectionError(null);
    setSelectedId(id);
  };

  const handleCameraClick = (id: number) => {
    selectWhiskey(id);
    setScanError(null);
    fileInputRefs.current[id]?.click();
  };

  const handleFileChange = async (w: Whiskey, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    selectWhiskey(w.id);
    setScanning(w.id);
    setScanError(null);

    try {
      const photo = await readImageAsDataUrl(file);
      const result = await scanInventory(photo, w.id, activeBarId);
      setWhiskeys((prev) =>
        prev.map((item) =>
          item.id === result.whiskey_id
            ? { ...item, stock_percent: result.stock_percent }
            : item,
        ),
      );
      await loadTrend(w.id);
    } catch (err) {
      if (err instanceof EdgeFunctionError && err.code === 'needs_more_photos') {
        setScanError(`${err.message} 병 전체의 목과 바닥이 모두 보이도록 다른 각도에서 사진을 한두 장 더 찍은 뒤 다시 시도해 주세요.`);
      } else {
        setScanError((err as Error).message);
      }
    } finally {
      setScanning(null);
      if (fileInputRefs.current[w.id]) {
        fileInputRefs.current[w.id]!.value = '';
      }
    }
  };

  const startCorrection = (point: InventoryDailyTrendPoint) => {
    setEditingLogId(point.log_id);
    setCorrectionValue(String(point.stock_percent));
    setCorrectionError(null);
  };

  const saveCorrection = async () => {
    if (!selectedWhiskey || editingLogId === null) return;

    const nextPercent = Number(correctionValue);
    if (!Number.isInteger(nextPercent) || nextPercent < 0 || nextPercent > 100) {
      setCorrectionError('재고율은 0부터 100 사이의 정수여야 합니다.');
      return;
    }

    setSavingCorrection(true);
    setCorrectionError(null);
    try {
      const result = await correctInventoryLog({
        whiskey_id: selectedWhiskey.id,
        log_id: editingLogId,
        stock_percent: nextPercent,
      }, activeBarId);

      setWhiskeys((prev) =>
        prev.map((item) =>
          item.id === selectedWhiskey.id
            ? { ...item, stock_percent: result.current_stock_percent }
            : item,
        ),
      );
      setEditingLogId(null);
      setCorrectionValue('');
      await loadTrend(selectedWhiskey.id);
    } catch (err) {
      setCorrectionError((err as Error).message);
    } finally {
      setSavingCorrection(false);
    }
  };

  const chartPath = buildPath(trend);
  const latestPoint = trend[trend.length - 1] ?? null;
  let chartContent: ReactNode;

  if (trendLoading) {
    chartContent = <p style={styles.empty}>기록을 불러오는 중...</p>;
  } else if (trendError) {
    chartContent = <p style={styles.errorText}>기록 오류: {trendError}</p>;
  } else if (trend.length === 0) {
    chartContent = <p style={styles.empty}>아직 재고 기록이 없습니다.</p>;
  } else {
    chartContent = (
      <>
        <svg viewBox="0 0 520 160" style={styles.chart} role="img" aria-label="재고 이력 차트">
          <line x1="18" y1="14" x2="18" y2="146" stroke="rgba(221,201,166,0.18)" />
          <line x1="18" y1="146" x2="502" y2="146" stroke="rgba(221,201,166,0.18)" />
          <line x1="18" y1="80" x2="502" y2="80" stroke="rgba(221,201,166,0.08)" />
          <path d={chartPath} fill="none" stroke="#cd924a" strokeWidth="3" />
          {trend.map((point, index) => {
            const { x, y } = chartPointPosition(point, index, trend.length);
            return (
              <circle
                key={point.log_id}
                cx={x}
                cy={y}
                r="4"
                fill={stockColor(point.stock_percent)}
              />
            );
          })}
        </svg>
        <div style={styles.chartLabels}>
          <span>{formatTrendPointDate(trend[0])}</span>
          <span>{formatTrendPointDate(trend[trend.length - 1])}</span>
        </div>
      </>
    );
  }

  return (
    <div className="admin-page" style={styles.container}>
      <header className="admin-page-header" style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 className="admin-page-title" style={styles.title}>재고 관리</h1>
          <span style={styles.count}>{whiskeys.length}종</span>
        </div>
        <button style={styles.backBtn} onClick={onBack}>← 돌아가기</button>
      </header>

      <div className="admin-page-toolbar" style={styles.toolbar}>
        <div className="admin-search" style={styles.searchBox}>
          <input
            style={styles.searchInput}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="위스키 검색..."
          />
          {query && (
            <span style={styles.clear} onClick={() => setQuery('')}>&times;</span>
          )}
        </div>
      </div>

      {scanError && (
        <div className="admin-error-banner" style={styles.errorBanner}>
          스캔 오류: {scanError}
          <span style={styles.errorClose} onClick={() => setScanError(null)}>&times;</span>
        </div>
      )}

      <main className="admin-content-grid" style={styles.content}>
        <section className="admin-list" style={styles.list}>
          <div className="admin-list-header" style={styles.listHeader}>
            <span style={{ ...styles.col, flex: 2 }}>위스키</span>
            <span style={{ ...styles.col, flex: 1.5 }}>재고 수준</span>
            <span style={{ ...styles.col, flex: 0.5, textAlign: 'center' }}>스캔</span>
          </div>

          {filtered.map((w) => {
            const pct = w.stock_percent;
            const color = stockColor(pct);
            const isScanning = scanning === w.id;
            const isSelected = selectedId === w.id;

            return (
              <div
                key={w.id}
                className="admin-list-row"
                style={{ ...styles.row, ...(isSelected ? styles.selectedRow : {}) }}
                onClick={() => selectWhiskey(w.id)}
              >
                <div className="admin-list-primary" style={{ ...styles.col, flex: 2 }}>
                  <span style={styles.brand}>{w.brand}</span>
                  {w.expression && <span style={styles.expr}> {w.expression}</span>}
                  <div style={styles.meta}>
                    {w.age ? `${w.age}년` : 'NAS'} · {w.abv}% · {w.region}
                  </div>
                </div>

                <div className="admin-list-data" style={{ ...styles.col, flex: 1.5 }}>
                  {pct === null ? (
                    <span style={styles.unmeasured}>미측정</span>
                  ) : (
                    <div>
                      <div style={styles.barTrack}>
                        <div
                          style={{
                            ...styles.barFill,
                            width: `${pct}%`,
                            background: color,
                          }}
                        />
                      </div>
                      <span style={{ ...styles.pctLabel, color }}>{pct}%</span>
                    </div>
                  )}
                </div>

                <div className="admin-list-actions" style={{ ...styles.col, flex: 0.5, display: 'flex', justifyContent: 'center' }}>
                  <button
                    style={{
                      ...styles.cameraBtn,
                      opacity: isScanning ? 0.5 : 1,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCameraClick(w.id);
                    }}
                    disabled={isScanning}
                    title="사진으로 재고 스캔"
                  >
                    {isScanning ? '...' : '📷'}
                  </button>
                  <input
                    ref={(el) => { fileInputRefs.current[w.id] = el; }}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(e) => handleFileChange(w, e)}
                  />
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <p style={styles.empty}>
              {query ? '검색 결과가 없습니다.' : '위스키가 없습니다.'}
            </p>
          )}
        </section>

        <aside className="admin-detail" style={styles.detail}>
          {!selectedWhiskey ? (
            <p style={styles.empty}>기록을 볼 위스키를 선택하세요.</p>
          ) : (
            <>
              <div style={styles.detailHeader}>
                <div>
                  <h2 style={styles.detailTitle}>
                    {selectedWhiskey.brand} {selectedWhiskey.expression}
                  </h2>
                  <p style={styles.detailMeta}>
                    현재 재고: {selectedWhiskey.stock_percent ?? '미측정'}
                    {selectedWhiskey.stock_percent !== null ? '%' : ''}
                  </p>
                </div>
                {latestPoint && (
                  <span style={{ ...styles.latestBadge, color: stockColor(latestPoint.stock_percent) }}>
                    {latestPoint.stock_percent}%
                  </span>
                )}
              </div>

              <div style={styles.chartCard}>
                {chartContent}
              </div>

              {correctionError && (
                <p style={styles.errorText}>{correctionError}</p>
              )}

              <div style={styles.historyList}>
                {trend.map((point) => (
                  <div key={point.log_id} style={styles.historyRow}>
                    <div>
                      <strong style={{ color: stockColor(point.stock_percent) }}>
                        {point.stock_percent}%
                      </strong>
                      <span style={styles.historyMeta}>
                        {formatDateTime(point.scanned_at)} · {point.source}
                        {point.corrected_at ? ' · 수정됨' : ''}
                      </span>
                    </div>

                    {editingLogId === point.log_id ? (
                      <div style={styles.correctionControls}>
                        <input
                          style={styles.percentInput}
                          type="number"
                          min="0"
                          max="100"
                          value={correctionValue}
                          onChange={(e) => setCorrectionValue(e.target.value)}
                        />
                        <button style={styles.smallBtn} onClick={saveCorrection} disabled={savingCorrection}>
                          저장
                        </button>
                        <button
                          style={styles.ghostBtn}
                          onClick={() => {
                            setEditingLogId(null);
                            setCorrectionValue('');
                            setCorrectionError(null);
                          }}
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <button style={styles.ghostBtn} onClick={() => startCorrection(point)}>
                        수정
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </aside>
      </main>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  container: {
    position: 'fixed', inset: 0, background: '#17130f',
    display: 'flex', flexDirection: 'column', color: '#ece0cd',
    fontFamily: '"Nanum Myeongjo", "Cormorant Garamond", serif',
  },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '20px 32px', borderBottom: '1px solid rgba(221,201,166,0.13)',
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16 },
  title: {
    fontFamily: '"Cormorant Garamond", serif', fontSize: 22, fontWeight: 700,
    color: '#cd924a', letterSpacing: '0.15em', margin: 0,
  },
  count: { color: '#837763', fontSize: 14 },
  backBtn: {
    background: 'none', border: 'none', color: '#837763', fontSize: 13,
    fontFamily: '"Nanum Myeongjo", serif', cursor: 'pointer',
  },
  toolbar: {
    display: 'flex', gap: 16, padding: '16px 32px', alignItems: 'center',
  },
  searchBox: {
    flex: 1, display: 'flex', alignItems: 'center', position: 'relative',
  },
  searchInput: {
    width: '100%', background: '#1d1712', border: '1px solid rgba(221,201,166,0.13)',
    borderRadius: 8, padding: '10px 16px', color: '#ece0cd', fontSize: 15,
    fontFamily: '"Nanum Myeongjo", serif', outline: 'none',
  },
  clear: {
    position: 'absolute', right: 12, color: '#837763', cursor: 'pointer', fontSize: 18,
  },
  errorBanner: {
    margin: '0 32px 8px', background: 'rgba(194,96,58,0.15)',
    border: '1px solid rgba(194,96,58,0.4)', borderRadius: 8,
    padding: '10px 16px', color: '#c2603a', fontSize: 13,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  },
  errorClose: { cursor: 'pointer', fontSize: 18, color: '#c2603a' },
  content: {
    flex: 1, display: 'grid', gridTemplateColumns: 'minmax(420px, 1fr) minmax(360px, 520px)',
    gap: 24, overflow: 'hidden', padding: '0 32px 32px',
  },
  list: { overflow: 'auto' },
  listHeader: {
    display: 'flex', gap: 16, padding: '12px 8px',
    borderBottom: '1px solid rgba(221,201,166,0.26)',
    fontFamily: '"Cormorant Garamond", serif', fontSize: 12,
    color: '#837763', letterSpacing: '0.1em', textTransform: 'uppercase',
  },
  row: {
    display: 'flex', gap: 16, padding: '14px 8px', alignItems: 'center',
    borderBottom: '1px solid rgba(221,201,166,0.08)', cursor: 'pointer',
  },
  selectedRow: {
    background: 'rgba(205,146,74,0.08)',
    boxShadow: 'inset 3px 0 0 #cd924a',
  },
  col: { flex: 1, fontSize: 14 },
  brand: { fontFamily: '"Cormorant Garamond", serif', fontSize: 18, fontWeight: 600 },
  expr: { color: '#b8aa90', fontWeight: 400, fontSize: '0.85em' },
  meta: { color: '#837763', fontSize: 12, marginTop: 3 },
  unmeasured: { color: '#837763', fontStyle: 'italic', fontSize: 13 },
  barTrack: {
    height: 8, borderRadius: 4, background: 'rgba(221,201,166,0.1)',
    overflow: 'hidden', width: '100%', maxWidth: 160,
  },
  barFill: {
    height: '100%', borderRadius: 4, transition: 'width 0.3s ease',
  },
  pctLabel: { fontSize: 12, marginTop: 4, display: 'block' },
  cameraBtn: {
    background: '#1d1712', border: '1px solid rgba(221,201,166,0.2)',
    borderRadius: 8, padding: '6px 10px', fontSize: 18,
    cursor: 'pointer', lineHeight: 1,
  },
  empty: { textAlign: 'center', color: '#837763', padding: 24, margin: 0 },
  detail: {
    overflow: 'auto', background: '#1d1712', border: '1px solid rgba(221,201,166,0.13)',
    borderRadius: 8, padding: 20,
  },
  detailHeader: {
    display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start',
    marginBottom: 18,
  },
  detailTitle: {
    fontFamily: '"Cormorant Garamond", serif', fontSize: 20, margin: '0 0 6px',
    color: '#ece0cd',
  },
  detailMeta: { color: '#837763', margin: 0, fontSize: 13 },
  latestBadge: {
    fontFamily: '"Cormorant Garamond", serif', fontSize: 28, fontWeight: 700,
  },
  chartCard: {
    background: '#17130f', border: '1px solid rgba(221,201,166,0.1)',
    borderRadius: 8, padding: 12, marginBottom: 16,
  },
  chart: { width: '100%', height: 180, display: 'block' },
  chartLabels: {
    display: 'flex', justifyContent: 'space-between', color: '#837763',
    fontSize: 11, padding: '0 4px',
  },
  errorText: { color: '#c2603a', fontSize: 13, margin: '8px 0' },
  historyList: { display: 'flex', flexDirection: 'column', gap: 8 },
  historyRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
    padding: '10px 0', borderBottom: '1px solid rgba(221,201,166,0.08)',
  },
  historyMeta: { display: 'block', color: '#837763', fontSize: 12, marginTop: 3 },
  correctionControls: { display: 'flex', alignItems: 'center', gap: 6 },
  percentInput: {
    width: 64, background: '#241c15', border: '1px solid rgba(221,201,166,0.18)',
    color: '#ece0cd', borderRadius: 6, padding: '7px 8px',
  },
  smallBtn: {
    background: '#cd924a', color: '#1a130c', border: 'none', borderRadius: 6,
    padding: '8px 10px', cursor: 'pointer',
  },
  ghostBtn: {
    background: 'transparent', color: '#b8aa90', border: '1px solid rgba(221,201,166,0.16)',
    borderRadius: 6, padding: '7px 10px', cursor: 'pointer',
  },
};
