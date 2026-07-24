import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MUTABLE_SETTING_KEYS = new Set([
  'pour_size_ml',
  'markup_multiplier',
  'margin_pct',
  'rounding_unit',
  'inventory_snapshot_day',
]);

class ValidationError extends Error {}

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { pin, settings: updates, newPin } = await req.json();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: current } = await supabase
      .from('settings')
      .select('pin_hash')
      .eq('id', 1)
      .single();

    if (!current || (await hashPin(pin)) !== current.pin_hash) {
      return new Response(JSON.stringify({ error: 'Invalid PIN' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const payload: Record<string, unknown> = {
      ...buildSettingsPayload(updates),
      updated_at: new Date().toISOString(),
    };

    // Handle PIN change
    if (newPin) {
      payload.pin_hash = await hashPin(newPin);
    }

    const { error } = await supabase
      .from('settings')
      .update(payload)
      .eq('id', 1);

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: error instanceof ValidationError ? 400 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
