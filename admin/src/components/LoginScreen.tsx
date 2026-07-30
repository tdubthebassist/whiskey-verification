import { useState } from 'react';
import { login } from '../lib/session';
import type { Session } from '../types';

interface LoginScreenProps {
  onSuccess: (session: Session) => void;
}

export default function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    if (!loginId.trim() || !password) {
      setError('아이디와 비밀번호를 입력하세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const session = await login(loginId.trim(), password);
      onSuccess(session);
    } catch {
      setError('로그인에 실패했습니다. 아이디 또는 비밀번호를 확인하세요.');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  const handleBack = () => {
    window.location.href = '/';
  };

  return (
    <div className="admin-login" style={styles.container}>
      <form className="admin-login-card" style={styles.card} onSubmit={handleSubmit}>
        <h2 style={styles.title}>ADMIN</h2>
        <p style={styles.subtitle}>로그인</p>

        <input
          style={styles.input}
          type="text"
          placeholder="아이디"
          autoComplete="username"
          value={loginId}
          onChange={(e) => setLoginId(e.target.value)}
          disabled={loading}
        />
        <input
          style={styles.input}
          type="password"
          placeholder="비밀번호"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={loading}
        />

        {error && <p style={styles.error}>{error}</p>}

        <button style={styles.submit} type="submit" disabled={loading}>
          {loading ? '확인 중...' : '로그인'}
        </button>

        <button style={styles.back} type="button" onClick={handleBack}>
          &larr; 메뉴로 돌아가기
        </button>
      </form>
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
    width: 280,
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
    margin: '0 0 8px',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box',
    padding: '14px 16px',
    borderRadius: 8,
    border: '1px solid rgba(221,201,166,0.2)',
    background: 'rgba(29,23,18,0.8)',
    color: '#ece0cd',
    fontSize: 16,
    fontFamily: '"Nanum Myeongjo", serif',
    outline: 'none',
  },
  error: {
    color: '#c2603a',
    fontSize: 14,
    fontFamily: '"Nanum Myeongjo", serif',
    margin: 0,
    textAlign: 'center',
  },
  submit: {
    width: '100%',
    padding: '14px 16px',
    borderRadius: 8,
    border: '1px solid rgba(221,201,166,0.2)',
    background: '#cd924a',
    color: '#17130f',
    fontSize: 16,
    fontFamily: '"Cormorant Garamond", serif',
    fontWeight: 700,
    letterSpacing: '0.1em',
    cursor: 'pointer',
  },
  back: {
    marginTop: 8,
    padding: '12px 24px',
    background: 'none',
    border: 'none',
    color: '#837763',
    fontSize: 14,
    fontFamily: '"Nanum Myeongjo", serif',
    cursor: 'pointer',
  },
};
