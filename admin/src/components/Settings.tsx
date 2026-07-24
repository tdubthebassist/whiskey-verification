import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { captureInventorySnapshots, getSettings, updateSettings } from '../lib/api';

interface SettingsProps {
  pin: string;
  onBack: () => void;
}

const ERROR_MESSAGE_MARKERS = ['실패', '일치', '4자리', '입력', '사이', '로딩'];

export default function Settings({ pin, onBack }: SettingsProps) {
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [snapshotDay, setSnapshotDay] = useState<number | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingPin, setSavingPin] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    getSettings()
      .then((settings) => {
        setSnapshotDay(settings.inventory_snapshot_day);
      })
      .catch((err) => {
        setMessage('설정 로딩 실패: ' + (err as Error).message);
      })
      .finally(() => setSettingsLoading(false));
  }, []);

  const validateSnapshotDay = () => {
    if (snapshotDay === null) {
      return true;
    }
    if (!Number.isInteger(snapshotDay) || snapshotDay < 1 || snapshotDay > 28) {
      setMessage('스냅샷 날짜는 1일부터 28일 사이여야 합니다.');
      return false;
    }
    return true;
  };

  const handlePinSave = async () => {
    if (!newPin) {
      setMessage('변경할 PIN을 입력해주세요.');
      return;
    }
    if (newPin.length !== 4) {
      setMessage('PIN은 4자리여야 합니다.');
      return;
    }
    if (newPin !== confirmPin) {
      setMessage('PIN이 일치하지 않습니다.');
      return;
    }

    setSavingPin(true);
    setMessage('');
    try {
      await updateSettings(pin, {}, newPin);
      setMessage('PIN이 변경되었습니다.');
      setNewPin('');
      setConfirmPin('');
    } catch (err) {
      setMessage('저장 실패: ' + (err as Error).message);
    } finally {
      setSavingPin(false);
    }
  };

  const handleSnapshotSave = async () => {
    if (!validateSnapshotDay()) return;

    setSavingSnapshot(true);
    setMessage('');
    try {
      await updateSettings(pin, { inventory_snapshot_day: snapshotDay });
      setMessage(snapshotDay === null
        ? '월간 재고 스냅샷이 서울 시간 월말 기준으로 저장되었습니다.'
        : '월간 재고 스냅샷 날짜가 저장되었습니다.');
    } catch (err) {
      setMessage('저장 실패: ' + (err as Error).message);
    } finally {
      setSavingSnapshot(false);
    }
  };

  const handleCaptureNow = async () => {
    setCapturing(true);
    setMessage('');
    try {
      const result = await captureInventorySnapshots(pin);
      const count = result.inserted ?? result.captured ?? 0;
      setMessage(`재고 스냅샷을 생성했습니다. 신규 ${count}건, 건너뜀 ${result.skipped ?? 0}건.`);
    } catch (err) {
      setMessage('스냅샷 실패: ' + (err as Error).message);
    } finally {
      setCapturing(false);
    }
  };

  const isErrorMessage = ERROR_MESSAGE_MARKERS.some((marker) => message.includes(marker));

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <button style={styles.backBtn} onClick={onBack}>&larr; 돌아가기</button>
        <h2 style={styles.title}>보안 설정 · PIN</h2>
      </header>

      <div style={styles.body}>
        <section style={styles.card}>
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

          <button style={styles.inlineBtn} onClick={handlePinSave} disabled={savingPin}>
            {savingPin ? '저장 중...' : 'PIN 저장'}
          </button>
        </section>

        <section style={styles.card}>
          <h3 style={styles.sectionTitle}>월간 재고 스냅샷</h3>

          <div style={styles.field}>
            <label style={styles.label}>매월 기록 날짜</label>
            <label style={styles.checkboxRow}>
              <input
                type="checkbox"
                checked={snapshotDay === null}
                disabled={settingsLoading}
                onChange={(e) => setSnapshotDay(e.target.checked ? null : 1)}
              />
              <span>Asia/Seoul 월말 기본값 사용</span>
            </label>
            <input
              style={styles.input}
              type="number"
              min="1"
              max="28"
              value={snapshotDay ?? ''}
              disabled={settingsLoading || snapshotDay === null}
              onChange={(e) => setSnapshotDay(e.target.value === '' ? 1 : Number(e.target.value))}
            />
            <span style={styles.hint}>
              월말 기본값은 Asia/Seoul 기준 해당 월의 마지막 날에 실행됩니다. 날짜를 직접 고르면 1-28일만 사용합니다.
            </span>
          </div>

          <div style={styles.actions}>
            <button
              style={styles.inlineBtn}
              onClick={handleSnapshotSave}
              disabled={settingsLoading || savingSnapshot}
            >
              {savingSnapshot ? '저장 중...' : '스냅샷 날짜 저장'}
            </button>
            <button
              style={styles.secondaryBtn}
              onClick={handleCaptureNow}
              disabled={capturing}
            >
              {capturing ? '생성 중...' : '지금 스냅샷 생성'}
            </button>
          </div>
        </section>

        {message && (
          <p style={{
            ...styles.message,
            color: isErrorMessage ? '#c2603a' : '#6fae8e',
          }}>
            {message}
          </p>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
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
    width: '100%', maxWidth: 560, background: '#1d1712',
    border: '1px solid rgba(221,201,166,0.13)', borderRadius: 8, padding: 24,
    boxSizing: 'border-box' as const,
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
  checkboxRow: {
    display: 'flex', alignItems: 'center', gap: 8, color: '#ece0cd',
    fontSize: 14, marginBottom: 4,
  },
  hint: { color: '#837763', fontSize: 11 },
  actions: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  inlineBtn: {
    padding: '12px 18px', background: '#cd924a',
    color: '#1a130c', border: 'none', borderRadius: 8, fontSize: 15, fontWeight: 700,
    fontFamily: '"Cormorant Garamond", serif', cursor: 'pointer',
  },
  secondaryBtn: {
    padding: '12px 18px', background: 'transparent',
    color: '#b8aa90', border: '1px solid rgba(221,201,166,0.18)', borderRadius: 8,
    fontSize: 15, fontFamily: '"Cormorant Garamond", serif', cursor: 'pointer',
  },
  message: { fontSize: 14, textAlign: 'center', maxWidth: 560 },
};
