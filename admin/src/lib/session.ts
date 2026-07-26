import {
  clearSessionToken,
  getSessionToken,
  login as apiLogin,
  logout as apiLogout,
  sessionInfo,
  setSessionToken,
} from './api';
import type { Session } from '../types';

// In-memory copy of the current session. `null` when logged out.
let current: Session | null = null;

// For owner drill-in: which bar is currently being viewed. For a bar-role
// account this is always its own barId; for an owner it is the selected bar
// (or null when viewing the all-bars dashboard).
let activeBarId: string | null = null;

function fromInfo(
  token: string,
  role: Session['role'],
  barId: string | null,
  barName: string | null,
): Session {
  const session: Session = { token, role, barId, barName };
  current = session;
  // Bar accounts view their own bar; owners start with no bar selected.
  activeBarId = role === 'owner' ? null : barId;
  return session;
}

export function getSession(): Session | null {
  return current;
}

export function getActiveBarId(): string | null {
  return activeBarId;
}

export function setActiveBarId(barId: string | null): void {
  activeBarId = barId;
}

export async function login(
  loginId: string,
  password: string,
): Promise<Session> {
  const res = await apiLogin(loginId, password);
  setSessionToken(res.token);
  return fromInfo(res.token, res.role, res.bar_id, res.bar_name);
}

export async function logout(): Promise<void> {
  try {
    await apiLogout();
  } catch {
    // Best-effort server revocation; always clear locally.
  }
  clearSessionToken();
  current = null;
  activeBarId = null;
}

// Restore the session on app load using the persisted token. Returns null and
// clears the stored token when the token is missing/expired/invalid.
export async function restore(): Promise<Session | null> {
  try {
    const info = await sessionInfo();
    const token = getPersistedToken();
    if (!token) return null;
    return fromInfo(token, info.role, info.bar_id, info.bar_name);
  } catch {
    clearSessionToken();
    current = null;
    activeBarId = null;
    return null;
  }
}

// Expose the persisted token read so callers can check presence before
// attempting a restore (avoids a doomed network round-trip).
export function getPersistedToken(): string | null {
  return getSessionToken();
}
