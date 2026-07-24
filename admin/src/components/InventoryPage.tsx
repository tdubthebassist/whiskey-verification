import { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { scanInventory } from '../lib/api';
import type { Whiskey } from '../types';

interface InventoryPageProps {
  pin: string;
  onBack: () => void;
}

function stockColor(pct: number | null): string {
  if (pct === null) return '#837763';
  if (pct <= 20) return '#c2603a';
  if (pct <= 50) return '#cd924a';
  return '#4a8c5c';
}

export default function InventoryPage({ pin, onBack }: InventoryPageProps) {
  const [whiskeys, setWhiskeys] = useState<Whiskey[]>([]);
  const [query, setQuery] = useState('');
  const [scanning, setScanning] = useState<number | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from('whiskeys').select('*').order('id');
      if (data) setWhiskeys(data);
    };
    load();

    const channel = supabase
      .channel('inventory-whiskeys')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'whiskeys' }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const filtered = query.trim()
    ? whiskeys.filter((w) => {
        const q = query.toLowerCase();
        return w.brand.toLowerCase().includes(q) || w.expression.toLowerCase().includes(q);
      })
    : whiskeys;

  const handleCameraClick = (id: number) => {
    setScanError(null);
    fileInputRefs.current[id]?.click();
  };

  const handleFileChange = async (w: Whiskey, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanning(w.id);
    setScanError(null);

    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // strip data URL prefix to get pure base64
          resolve(result.split(',')[1] ?? result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const result = await scanInventory(pin, base64, w.id);
      setWhiskeys((prev) =>
        prev.map((item) =>
          item.id === result.whiskey_id
            ? { ...item, stock_percent: result.stock_percent }
            : item,
        ),
      );
    } catch (err) {
      setScanError((err as Error).message);
    } finally {
      setScanning(null);
      // reset input so same file can be re-selected
      if (fileInputRefs.current[w.id]) {
        fileInputRefs.current[w.id]!.value = '';
      }
    }
  };

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 style={styles.title}>재고 관리</h1>
          <span style={styles.count}>{whiskeys.length}종</span>
        </div>
        <button style={styles.backBtn} onClick={onBack}>← 돌아가기</button>
      </header>

      <div style={styles.toolbar}>
        <div style={styles.searchBox}>
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
        <div style={styles.errorBanner}>
          스캔 오류: {scanError}
          <span style={styles.errorClose} onClick={() => setScanError(null)}>&times;</span>
        </div>
      )}

      <div style={styles.list}>
        <div style={styles.listHeader}>
          <span style={{ ...styles.col, flex: 2 }}>위스키</span>
          <span style={{ ...styles.col, flex: 1.5 }}>재고 수준</span>
          <span style={{ ...styles.col, flex: 0.5, textAlign: 'center' }}>스캔</span>
        </div>

        {filtered.map((w) => {
          const pct = w.stock_percent;
          const color = stockColor(pct);
          const isScanning = scanning === w.id;

          return (
            <div key={w.id} style={styles.row}>
              <div style={{ ...styles.col, flex: 2 }}>
                <span style={styles.brand}>{w.brand}</span>
                {w.expression && <span style={styles.expr}> {w.expression}</span>}
                <div style={styles.meta}>
                  {w.age ? `${w.age}년` : 'NAS'} · {w.abv}% · {w.region}
                </div>
              </div>

              <div style={{ ...styles.col, flex: 1.5 }}>
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

              <div style={{ ...styles.col, flex: 0.5, display: 'flex', justifyContent: 'center' }}>
                <button
                  style={{
                    ...styles.cameraBtn,
                    opacity: isScanning ? 0.5 : 1,
                  }}
                  onClick={() => handleCameraClick(w.id)}
                  disabled={isScanning}
                  title="사진으로 재고 스캔"
                >
                  {isScanning ? '...' : '📷'}
                </button>
                <input
                  ref={(el) => { fileInputRefs.current[w.id] = el; }}
                  type="file"
                  accept="image/*"
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
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
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
  list: { flex: 1, overflow: 'auto', padding: '0 32px 32px' },
  listHeader: {
    display: 'flex', gap: 16, padding: '12px 8px',
    borderBottom: '1px solid rgba(221,201,166,0.26)',
    fontFamily: '"Cormorant Garamond", serif', fontSize: 12,
    color: '#837763', letterSpacing: '0.1em', textTransform: 'uppercase',
  },
  row: {
    display: 'flex', gap: 16, padding: '14px 8px', alignItems: 'center',
    borderBottom: '1px solid rgba(221,201,166,0.08)',
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
  empty: { textAlign: 'center', color: '#837763', padding: 40 },
};
