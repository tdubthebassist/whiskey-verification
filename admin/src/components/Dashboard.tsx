import { useCallback, useState, useEffect } from 'react';
import { deleteWhiskey, listWhiskeys } from '../lib/api';
import { formatKRW } from '../lib/pricing';
import type { Whiskey } from '../types';

interface DashboardProps {
  activeBarId?: string;
  onAdd: () => void;
  onEdit: (whiskey: Whiskey) => void;
  onSettings: () => void;
  onPricing: () => void;
  onInventory: () => void;
  onBulkUpload: () => void;
  onLogout: () => void;
}

export default function Dashboard({ activeBarId, onAdd, onEdit, onSettings, onPricing, onInventory, onBulkUpload, onLogout }: DashboardProps) {
  const [whiskeys, setWhiskeys] = useState<Whiskey[]>([]);
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState<number | null>(null);

  const loadWhiskeys = useCallback(async () => {
    const rows = await listWhiskeys(activeBarId);
    setWhiskeys(rows);
  }, [activeBarId]);

  useEffect(() => {
    void loadWhiskeys();
  }, [loadWhiskeys]);

  const filtered = query.trim()
    ? whiskeys.filter((w) => {
        const q = query.toLowerCase();
        return w.brand.toLowerCase().includes(q) || w.expression.toLowerCase().includes(q);
      })
    : whiskeys;

  const handleDelete = async (id: number) => {
    if (!confirm('이 위스키를 삭제하시겠습니까?')) return;
    setDeleting(id);
    try {
      await deleteWhiskey(id, activeBarId);
      await loadWhiskeys();
    } catch (e) {
      alert('삭제 실패: ' + (e as Error).message);
    }
    setDeleting(null);
  };

  const handleBack = () => {
    onLogout();
    window.location.href = '../';
  };

  return (
    <div className="admin-page" style={styles.container}>
      <header className="admin-page-header" style={styles.header}>
        <div style={styles.headerLeft}>
          <h1 className="admin-page-title" style={styles.title}>ADMIN</h1>
          <span style={styles.count}>{whiskeys.length}종</span>
        </div>
        <div className="admin-header-actions" style={styles.headerRight}>
          <button style={styles.settingsBtn} onClick={onPricing}>가격 공식</button>
          <button style={styles.settingsBtn} onClick={onInventory}>재고 관리</button>
          <button style={styles.settingsBtn} onClick={onSettings}>설정</button>
          <button style={styles.backBtn} onClick={handleBack}>메뉴로 돌아가기</button>
        </div>
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
        <button style={styles.importBtn} onClick={onBulkUpload}>CSV/엑셀 업로드</button>
        <button style={styles.addBtn} onClick={onAdd}>+ 새 위스키 추가</button>
      </div>

      <div className="admin-list" style={styles.list}>
        <div className="admin-list-header" style={styles.listHeader}>
          <span style={{ ...styles.col, flex: 2 }}>위스키</span>
          <span style={styles.col}>원가</span>
          <span style={styles.col}>잔 가격</span>
          <span style={{ ...styles.col, flex: 0.5, textAlign: 'center' }}>액션</span>
        </div>

        {filtered.map((w) => (
          <div key={w.id} className="admin-list-row" style={styles.row}>
            <div className="admin-list-primary" style={{ ...styles.col, flex: 2 }}>
              <span style={styles.brand}>{w.brand}</span>
              {w.expression && <span style={styles.expr}> {w.expression}</span>}
              <div style={styles.meta}>
                {w.age ? `${w.age}년` : 'NAS'} · {w.abv}% · {w.region}
              </div>
            </div>
            <span className="admin-list-data" style={styles.col}>
              {w.cost_price ? `₩${formatKRW(w.cost_price)}` : <span style={styles.na}>미입력</span>}
            </span>
            <span className="admin-list-data" style={{ ...styles.col, color: '#cd924a', fontWeight: 700 }}>
              ₩{formatKRW(w.glass_price)}
            </span>
            <div className="admin-list-actions" style={{ ...styles.col, flex: 0.5, display: 'flex', gap: 8, justifyContent: 'center' }}>
              <button style={styles.actionBtn} onClick={() => onEdit(w)}>수정</button>
              <button
                style={{ ...styles.actionBtn, color: '#c2603a' }}
                onClick={() => handleDelete(w.id)}
                disabled={deleting === w.id}
              >
                {deleting === w.id ? '...' : '삭제'}
              </button>
            </div>
          </div>
        ))}

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
  headerRight: { display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' },
  title: {
    fontFamily: '"Cormorant Garamond", serif', fontSize: 22, fontWeight: 700,
    color: '#cd924a', letterSpacing: '0.15em', margin: 0,
  },
  count: { color: '#837763', fontSize: 14 },
  settingsBtn: {
    background: '#1d1712', border: '1px solid rgba(221,201,166,0.2)',
    borderRadius: 8, padding: '9px 14px', color: '#b8aa90', fontSize: 13,
    fontFamily: '"Nanum Myeongjo", serif', cursor: 'pointer',
  },
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
  importBtn: {
    background: '#1d1712', border: '1px solid rgba(205,146,74,0.4)',
    borderRadius: 8, padding: '10px 16px', color: '#cd924a', fontSize: 13,
    fontFamily: '"Cormorant Garamond", serif', letterSpacing: '0.05em',
    cursor: 'pointer', whiteSpace: 'nowrap' as const,
  },
  addBtn: {
    background: '#cd924a', color: '#1a130c', border: 'none', borderRadius: 8,
    padding: '10px 20px', fontSize: 14, fontWeight: 600,
    fontFamily: '"Cormorant Garamond", serif', letterSpacing: '0.05em',
    cursor: 'pointer', whiteSpace: 'nowrap',
  },
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
  na: { color: '#837763', fontStyle: 'italic', fontSize: 12 },
  actionBtn: {
    background: 'none', border: '1px solid rgba(221,201,166,0.2)', borderRadius: 6,
    padding: '4px 10px', color: '#b8aa90', fontSize: 12, cursor: 'pointer',
    fontFamily: '"Nanum Myeongjo", serif',
  },
  empty: { textAlign: 'center', color: '#837763', padding: 40 },
};
