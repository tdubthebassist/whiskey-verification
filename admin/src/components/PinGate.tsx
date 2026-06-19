import { useState, useCallback } from 'react';
import { validatePin } from '../lib/api';

interface PinGateProps {
  onSuccess: (pin: string) => void;
}

export default function PinGate({ onSuccess }: PinGateProps) {
  const [digits, setDigits] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  const handleDigit = useCallback(
    (d: string) => {
      if (cooldown > 0 || loading) return;
      setError('');
      const next = digits + d;
      setDigits(next);

      if (next.length === 4) {
        setLoading(true);
        validatePin(next).then((ok) => {
          setLoading(false);
          if (ok) {
            onSuccess(next);
          } else {
            const newAttempts = attempts + 1;
            setAttempts(newAttempts);
            setDigits('');
            if (newAttempts >= 3) {
              setError('3회 실패. 30초 후 다시 시도해주세요.');
              setCooldown(30);
              const timer = setInterval(() => {
                setCooldown((c) => {
                  if (c <= 1) {
                    clearInterval(timer);
                    setAttempts(0);
                    setError('');
                    return 0;
                  }
                  return c - 1;
                });
              }, 1000);
            } else {
              setError('PIN이 올바르지 않습니다.');
            }
          }
        });
      }
    },
    [digits, cooldown, loading, attempts, onSuccess],
  );

  const handleDelete = () => {
    setDigits((d) => d.slice(0, -1));
    setError('');
  };

  const handleBack = () => {
    window.location.href = './Bar Backroom Menu.html';
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>ADMIN</h2>
        <p style={styles.subtitle}>PIN을 입력하세요</p>

        <div style={styles.dots}>
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                ...styles.dot,
                background: i < digits.length ? '#cd924a' : 'rgba(221,201,166,0.2)',
              }}
            />
          ))}
        </div>

        {error && <p style={styles.error}>{error}</p>}
        {cooldown > 0 && <p style={styles.cooldown}>{cooldown}s</p>}

        <div style={styles.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'].map(
            (key) => (
              <button
                key={key || 'empty'}
                style={{
                  ...styles.key,
                  visibility: key === '' ? 'hidden' : 'visible',
                  opacity: cooldown > 0 ? 0.3 : 1,
                }}
                onClick={() => {
                  if (key === 'DEL') handleDelete();
                  else if (key) handleDigit(key);
                }}
                disabled={cooldown > 0 || loading}
              >
                {key}
              </button>
            ),
          )}
        </div>

        <button style={styles.back} onClick={handleBack}>
          &larr; 메뉴로 돌아가기
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'fixed',
    inset: 0,
    background: '#17130f',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: '"Cormorant Garamond", "Nanum Myeongjo", serif',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
  },
  title: {
    fontFamily: '"Cormorant Garamond", serif',
    fontSize: 28,
    fontWeight: 700,
    color: '#cd924a',
    letterSpacing: '0.2em',
    margin: 0,
  },
  subtitle: {
    fontFamily: '"Nanum Myeongjo", serif',
    fontSize: 15,
    color: '#837763',
    margin: 0,
  },
  dots: {
    display: 'flex',
    gap: 16,
    margin: '20px 0',
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: '50%',
    transition: 'background 0.15s',
  },
  error: {
    color: '#c2603a',
    fontSize: 14,
    fontFamily: '"Nanum Myeongjo", serif',
    margin: 0,
  },
  cooldown: {
    color: '#cd924a',
    fontSize: 24,
    fontFamily: '"Cormorant Garamond", serif',
    fontWeight: 700,
    margin: 0,
  },
  keypad: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 72px)',
    gap: 12,
    marginTop: 8,
  },
  key: {
    width: 72,
    height: 72,
    borderRadius: '50%',
    border: '1px solid rgba(221,201,166,0.2)',
    background: 'rgba(29,23,18,0.8)',
    color: '#ece0cd',
    fontSize: 24,
    fontFamily: '"Cormorant Garamond", serif',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'all 0.15s',
  },
  back: {
    marginTop: 24,
    background: 'none',
    border: 'none',
    color: '#837763',
    fontSize: 14,
    fontFamily: '"Nanum Myeongjo", serif',
    cursor: 'pointer',
  },
};
