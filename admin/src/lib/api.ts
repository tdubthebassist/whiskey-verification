import type {
  BarSummary,
  CaptureInventorySnapshotsResult,
  EnrichmentResult,
  InventoryCorrectionRequest,
  InventoryCorrectionResult,
  InventoryDailyTrendPoint,
  InventoryLog,
  Role,
  ScanResult,
  Settings,
  Whiskey,
  WhiskeyInput,
} from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// --- Session token storage ---------------------------------------------------
// api.ts owns the token key so session.ts can import these helpers without a
// circular dependency (session.ts -> api.ts only).
const TOKEN_KEY = 'wv_session_token';

export function getSessionToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setSessionToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearSessionToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function callEdgeFunction<T>(
  fnName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const token = getSessionToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
  };
  if (token) {
    headers['x-session-token'] = token;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers,
    // Also carry the token in the body as a fallback in case the gateway
    // strips custom headers (the functions accept either).
    body: JSON.stringify(token ? { session_token: token, ...body } : body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Edge function ${fnName} failed: ${err}`);
  }

  return res.json();
}

// --- Auth --------------------------------------------------------------------

export interface LoginResponse {
  token: string;
  role: Role;
  bar_id: string | null;
  bar_name: string | null;
  expires_at: string;
}

export async function login(
  login_id: string,
  password: string,
): Promise<LoginResponse> {
  return callEdgeFunction('login', { login_id, password });
}

export async function logout(): Promise<void> {
  await callEdgeFunction('logout', {});
}

export interface SessionInfoResponse {
  role: Role;
  bar_id: string | null;
  bar_name: string | null;
}

export async function sessionInfo(): Promise<SessionInfoResponse> {
  return callEdgeFunction('session', {});
}

// --- Owner -------------------------------------------------------------------

export async function listBarsSummary(): Promise<BarSummary[]> {
  const res = await callEdgeFunction<{ bars: BarSummary[] }>('bars-summary', {});
  return res.bars;
}

// --- Reads (replace former raw rest/v1 reads) --------------------------------

export async function listWhiskeys(barId?: string): Promise<Whiskey[]> {
  const res = await callEdgeFunction<{ whiskeys: Whiskey[] }>(
    'list-whiskeys',
    barId ? { bar_id: barId } : {},
  );
  return res.whiskeys;
}

export async function getSettings(barId?: string): Promise<Settings> {
  const res = await callEdgeFunction<{ settings: Settings }>(
    'get-settings',
    barId ? { bar_id: barId } : {},
  );
  return res.settings;
}

export async function listInventoryLogs(params?: {
  whiskeyId?: number;
  from?: string;
  to?: string;
  barId?: string;
}): Promise<InventoryLog[]> {
  const body: Record<string, unknown> = {};
  if (params?.barId) body.bar_id = params.barId;
  if (params?.whiskeyId != null) body.whiskey_id = params.whiskeyId;
  if (params?.from) body.from = params.from;
  if (params?.to) body.to = params.to;
  const res = await callEdgeFunction<{ logs: InventoryLog[] }>(
    'list-inventory-logs',
    body,
  );
  return res.logs;
}

export async function getInventoryDailyTrend(
  whiskeyId: number,
  barId?: string,
): Promise<InventoryDailyTrendPoint[]> {
  const body: Record<string, unknown> = { whiskey_id: whiskeyId };
  if (barId) body.bar_id = barId;
  const res = await callEdgeFunction<{ trend: InventoryDailyTrendPoint[] }>(
    'inventory-daily-trend',
    body,
  );
  return res.trend;
}

// --- Writes ------------------------------------------------------------------

export async function upsertWhiskey(
  whiskey: WhiskeyInput,
  id?: number,
  barId?: string,
): Promise<{ id: number }> {
  return callEdgeFunction('upsert-whiskey', {
    whiskey,
    id,
    ...(barId ? { bar_id: barId } : {}),
  });
}

export async function deleteWhiskey(
  id: number,
  barId?: string,
): Promise<{ success: boolean }> {
  return callEdgeFunction('delete-whiskey', {
    id,
    ...(barId ? { bar_id: barId } : {}),
  });
}

export async function updateSettings(
  settings: Partial<Settings>,
  barId?: string,
): Promise<{ success: boolean }> {
  return callEdgeFunction('update-settings', {
    settings,
    ...(barId ? { bar_id: barId } : {}),
  });
}

export async function searchPrice(
  brand: string,
  expression: string,
  barId?: string,
): Promise<{
  prices: Array<{
    name: string;
    price: number;
    volume_ml: number | null;
    source: string;
  }>;
}> {
  return callEdgeFunction('search-price', {
    brand,
    expression,
    ...(barId ? { bar_id: barId } : {}),
  });
}

export async function identifyBottle(
  photoBase64: string,
  barId?: string,
): Promise<{
  brand: string;
  expression: string;
  age: number | null;
  region: string;
  abv: number;
  notes: string;
  confidence: number;
}> {
  return callEdgeFunction('identify-bottle', {
    photo: photoBase64,
    ...(barId ? { bar_id: barId } : {}),
  });
}

export async function scanInventory(
  photoBase64: string,
  whiskeyId: number,
  barId?: string,
): Promise<ScanResult> {
  return callEdgeFunction('scan-inventory', {
    photo: photoBase64,
    whiskey_id: whiskeyId,
    ...(barId ? { bar_id: barId } : {}),
  });
}

export async function correctInventoryLog(
  request: InventoryCorrectionRequest,
  barId?: string,
): Promise<InventoryCorrectionResult> {
  return callEdgeFunction('correct-inventory-log', {
    ...request,
    ...(barId ? { bar_id: barId } : {}),
  });
}

export async function captureInventorySnapshots(
  barId?: string,
): Promise<CaptureInventorySnapshotsResult> {
  return callEdgeFunction('capture-inventory-snapshots', {
    ...(barId ? { bar_id: barId } : {}),
  });
}

export async function enrichByName(
  brand: string,
  expression: string,
  barId?: string,
): Promise<EnrichmentResult> {
  return callEdgeFunction('enrich-by-name', {
    brand,
    expression,
    ...(barId ? { bar_id: barId } : {}),
  });
}

// Duplicate check now flows through the authenticated list-whiskeys function
// instead of a raw rest/v1 read.
export async function checkDuplicateWhiskeys(
  pairs: Array<{ brand: string; expression: string }>,
  barId?: string,
): Promise<Set<string>> {
  const rows = await listWhiskeys(barId);
  const existing = new Set(
    rows.map(
      (r) => `${r.brand.toLowerCase().trim()}||${r.expression.toLowerCase().trim()}`,
    ),
  );
  const inputKeys = new Set(
    pairs.map(
      (p) => `${p.brand.toLowerCase().trim()}||${p.expression.toLowerCase().trim()}`,
    ),
  );
  return new Set([...inputKeys].filter((k) => existing.has(k)));
}
