import { useEffect, useState } from 'react';
import { listBarsSummary } from '../lib/api';
import type { BarSummary } from '../types';

interface OwnerDashboardProps {
  barName: string | null;
  // Called with the selected bar when the owner drills into a bar's dashboard.
  onSelectBar: (bar: BarSummary) => void;
  onLogout: () => void;
}

function formatDate(value: string | null): string {
  if (!value) return '스캔 기록 없음';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export default function OwnerDashboard({
  barName,
  onSelectBar,
  onLogout,
}: OwnerDashboardProps) {
  const [bars, setBars] = useState<BarSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    listBarsSummary()
      .then((rows) => setBars(rows))
      .catch((err) => setError('바 목록을 불러오지 못했습니다: ' + (err as Error).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{barName ?? 'OWNER'}</h1>
          <p style={styles.subtitle}>전체 바 관리</p>
        </div>
        <button style={styles.logout} onClick={onLogout}>
          로그아웃
        </button>
      </div>

      {loading && <p style={styles.status}>불러오는 중...</p>}
      {error && <p style={styles.error}>{error}</p>}
      {!loading && !error && bars.length === 0 && (
        <p style={styles.status}>등록된 바가 없습니다.</p>
      )}

      <div style={styles.grid}>
        {bars.map((bar) => (
          <button
            key={bar.bar_id}
            style={styles.card}
            onClick={() => onSelectBar(bar)}
          >
            <span style={styles.cardName}>{bar.name}</span>
            <span style={styles.cardMetric}>위스키 {bar.whiskey_count}종</span>
            <span style={styles.cardDate}>
              마지막 스캔: {formatDate(bar.last_scan_date)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: '#17130f',
    padding: '32px 24px',
    fontFamily: '"Cormorant Garamond", "Nanum Myeongjo", serif',
    boxSizing: 'border-box',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 32,
  },
  title: {
    fontFamily: '"Cormorant Garamond", serif',
    fontSize: 32,
    fontWeight: 700,
    color: '#cd924a',
    letterSpacing: '0.1em',
    margin: 0,
  },
  subtitle: {
    fontFamily: '"Nanum Myeongjo", serif',
    fontSize: 14,
    color: '#837763',
    margin: '4px 0 0',
  },
  logout: {
    padding: '10px 20px',
    background: 'none',
    border: '1px solid rgba(221,201,166,0.2)',
    borderRadius: 8,
    color: '#837763',
    fontSize: 14,
    fontFamily: '"Nanum Myeongjo", serif',
    cursor: 'pointer',
  },
  status: {
    color: '#837763',
    fontSize: 15,
    fontFamily: '"Nanum Myeongjo", serif',
  },
  error: {
    color: '#c2603a',
    fontSize: 15,
    fontFamily: '"Nanum Myeongjo", serif',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: 16,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 8,
    padding: '24px 20px',
    borderRadius: 12,
    border: '1px solid rgba(221,201,166,0.2)',
    background: 'rgba(29,23,18,0.8)',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'all 0.15s',
  },
  cardName: {
    fontFamily: '"Cormorant Garamond", serif',
    fontSize: 22,
    fontWeight: 700,
    color: '#ece0cd',
  },
  cardMetric: {
    fontFamily: '"Nanum Myeongjo", serif',
    fontSize: 15,
    color: '#cd924a',
  },
  cardDate: {
    fontFamily: '"Nanum Myeongjo", serif',
    fontSize: 13,
    color: '#837763',
  },
};
