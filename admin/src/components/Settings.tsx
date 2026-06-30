import { useState } from 'react';
import { updateSettings } from '../lib/api';

interface SettingsProps {
  pin: string;
  onBack: () => void;
}

export default function Settings({ pin, onBack }: SettingsProps) {
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const handleSave = async () => {
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

    setSaving(true);
    setMessage('');
    try {
      await updateSettings(pin, {}, newPin);
      setMessage('PIN이 변경되었습니다.');
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
        <h2 style={styles.title}>보안 설정 · PIN</h2>
      </header>

      <div style={styles.body}>
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
        </div>

        {message && (
          <p style={{
            ...styles.message,
            color: message.includes('실패') || message.includes('일치') || message.includes('4자리') || message.includes('입력')
              ? '#c2603a'
              : '#6fae8e',
          }}>
            {message}
          </p>
        )}

        <button style={styles.saveBtn} onClick={handleSave} disabled={saving}>
          {saving ? '저장 중...' : 'PIN 저장'}
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
  message: { fontSize: 14, textAlign: 'center' },
  saveBtn: {
    width: '100%', maxWidth: 500, padding: '14px 24px', background: '#cd924a',
    color: '#1a130c', border: 'none', borderRadius: 8, fontSize: 16, fontWeight: 700,
    fontFamily: '"Cormorant Garamond", serif', cursor: 'pointer',
  },
};
