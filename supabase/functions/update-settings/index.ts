import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  AuthError,
  authenticate,
  resolveBarScope,
  scopedTenantClient,
} from '../_shared/auth.ts';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MUTABLE_SETTING_KEYS = new Set([
  'pour_size_ml',
  'markup_multiplier',
  'margin_pct',
  'rounding_unit',
  'inventory_snapshot_day',
]);

class ValidationError extends Error {}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function buildSettingsPayload(updates: unknown): Record<string, unknown> {
  if (updates === undefined || updates === null) {
    return {};
  }

  if (typeof updates !== 'object' || Array.isArray(updates)) {
    throw new ValidationError('Invalid settings payload');
  }

  const payload: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updates)) {
    if (!MUTABLE_SETTING_KEYS.has(key)) {
      throw new ValidationError(`Setting is not mutable: ${key}`);
    }

    if (key === 'inventory_snapshot_day') {
      if (
        value !== null
        && (!Number.isInteger(value) || value < 1 || value > 28)
      ) {
        throw new ValidationError('inventory_snapshot_day must be null or an integer from 1 to 28');
      }
      payload[key] = value;
      continue;
    }

    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new ValidationError(`${key} must be a finite number`);
    }

    payload[key] = value;
  }

  return payload;
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const auth = await authenticate(req, serviceClient);

    const { settings: updates, bar_id } = await req.json();

    const barId = resolveBarScope(auth, bar_id as string | undefined);
    const sc = scopedTenantClient(serviceClient, barId);

    const payload: Record<string, unknown> = {
      ...buildSettingsPayload(updates),
      updated_at: new Date().toISOString(),
    };

    // UPSERT keyed by bar_id — creates the row on first save if it doesn't exist yet.
    // scopedTenantClient stamps bar_id onto the row.
    const { error } = await sc.from('settings')
      .upsert(payload, { onConflict: 'bar_id' });

    if (error) throw error;

    return json({ success: true });
  } catch (err) {
    const status = err instanceof AuthError
      ? err.status
      : err instanceof ValidationError
      ? 400
      : 500;
    return json({ error: (err as Error).message }, status);
  }
});
