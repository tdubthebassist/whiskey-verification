import type {
  CaptureInventorySnapshotsResult,
  EnrichmentResult,
  InventoryCorrectionRequest,
  InventoryCorrectionResult,
  InventoryDailyTrendPoint,
  ScanResult,
  Settings,
  WhiskeyInput,
} from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

async function callEdgeFunction<T>(
  fnName: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${fnName}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Edge function ${fnName} failed: ${err}`);
  }

  return res.json();
}

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function validatePin(pin: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    // Read pin_hash from settings table (publicly readable via RLS)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/settings?select=pin_hash&id=eq.1`,
      {
        signal: controller.signal,
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
      },
    );
    if (!res.ok) return false;
    const rows = await res.json();
    if (!rows.length) return false;
    const storedHash = rows[0].pin_hash;
    const inputHash = await hashPin(pin);
    return inputHash === storedHash;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function upsertWhiskey(
  pin: string,
  whiskey: WhiskeyInput,
  id?: number,
): Promise<{ id: number }> {
  return callEdgeFunction('upsert-whiskey', { pin, whiskey, id });
}

export async function deleteWhiskey(
  pin: string,
  id: number,
): Promise<{ success: boolean }> {
  return callEdgeFunction('delete-whiskey', { pin, id });
}

export async function updateSettings(
  pin: string,
  settings: Partial<Settings>,
  newPin?: string,
): Promise<{ success: boolean }> {
  return callEdgeFunction('update-settings', { pin, settings, newPin });
}

export async function searchPrice(
  pin: string,
  brand: string,
  expression: string,
): Promise<{
  prices: Array<{
    name: string;
    price: number;
    volume_ml: number | null;
    source: string;
  }>;
}> {
  return callEdgeFunction('search-price', { pin, brand, expression });
}

export async function identifyBottle(
  pin: string,
  photoBase64: string,
): Promise<{
  brand: string;
  expression: string;
  age: number | null;
  region: string;
  abv: number;
  notes: string;
  confidence: number;
}> {
  return callEdgeFunction('identify-bottle', { pin, photo: photoBase64 });
}

export async function scanInventory(
  pin: string,
  photoBase64: string,
  whiskeyId: number,
): Promise<ScanResult> {
  return callEdgeFunction('scan-inventory', {
    pin,
    photo: photoBase64,
    whiskey_id: whiskeyId,
  });
}

export async function getSettings(): Promise<Settings> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/settings?select=*&id=eq.1`, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Settings fetch failed: ${err}`);
  }

  const rows: Settings[] = await res.json();
  if (!rows.length) {
    throw new Error('Settings row not found');
  }

  return rows[0];
}

export async function getInventoryDailyTrend(
  whiskeyId: number,
): Promise<InventoryDailyTrendPoint[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_inventory_daily_trend`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ p_whiskey_id: whiskeyId }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('Inventory trend fetch failed: ' + err);
  }

  return res.json();
}

export async function correctInventoryLog(
  pin: string,
  request: InventoryCorrectionRequest,
): Promise<InventoryCorrectionResult> {
  return callEdgeFunction('correct-inventory-log', { pin, ...request });
}

export async function captureInventorySnapshots(
  pin: string,
): Promise<CaptureInventorySnapshotsResult> {
  return callEdgeFunction('capture-inventory-snapshots', { pin });
}

export async function enrichByName(
  pin: string,
  brand: string,
  expression: string,
): Promise<EnrichmentResult> {
  return callEdgeFunction('enrich-by-name', { pin, brand, expression });
}

export async function checkDuplicateWhiskeys(
  pairs: Array<{ brand: string; expression: string }>,
): Promise<Set<string>> {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/whiskeys?select=brand,expression`,
    {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
    },
  );
  if (!res.ok) return new Set();
  const rows: Array<{ brand: string; expression: string }> = await res.json();
  const existing = new Set(
    rows.map((r) => `${r.brand.toLowerCase().trim()}||${r.expression.toLowerCase().trim()}`),
  );
  const inputKeys = new Set(
    pairs.map((p) => `${p.brand.toLowerCase().trim()}||${p.expression.toLowerCase().trim()}`),
  );
  return new Set([...inputKeys].filter((k) => existing.has(k)));
}
