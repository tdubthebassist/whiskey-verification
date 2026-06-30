import type { WhiskeyInput, Settings } from '../types';

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
