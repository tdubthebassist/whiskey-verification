import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InventoryCorrectionRpcRow {
  whiskey_id: number;
  log_id: number;
  stock_percent: number;
  current_stock_percent: number | null;
  scanned_at: string;
  confidence: number | null;
  source: string;
  corrected_at: string | null;
  corrected_from_percent: number | null;
  correction_source: string | null;
}

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { pin, log_id, whiskey_id, stock_percent } = await req.json();

    if (
      typeof pin !== 'string'
      || !Number.isInteger(log_id)
      || !Number.isInteger(whiskey_id)
      || !Number.isInteger(stock_percent)
      || stock_percent < 0
      || stock_percent > 100
    ) {
      return json({ error: 'Invalid request' }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: settings } = await supabase
      .from('settings')
      .select('pin_hash')
      .eq('id', 1)
      .single();

    if (!settings || (await hashPin(pin)) !== settings.pin_hash) {
      return json({ error: 'Invalid PIN' }, 401);
    }

    const { data, error } = await supabase
      .rpc('overwrite_inventory_log', {
        p_log_id: log_id,
        p_whiskey_id: whiskey_id,
        p_stock_percent: stock_percent,
        p_source: 'manual_correction',
      })
      .single();

    if (error) {
      throw new Error(`Failed to correct inventory log: ${error.message}`);
    }

    const row = data as InventoryCorrectionRpcRow;

    return json({
      success: true,
      whiskey_id,
      log_id,
      stock_percent: row.stock_percent,
      current_stock_percent: row.current_stock_percent,
      log: {
        id: row.log_id,
        whiskey_id: row.whiskey_id,
        stock_percent: row.stock_percent,
        scanned_at: row.scanned_at,
        confidence: row.confidence,
        source: row.source,
        corrected_at: row.corrected_at,
        corrected_from_percent: row.corrected_from_percent,
        correction_source: row.correction_source,
      },
    });
  } catch (error) {
    console.error('correct-inventory-log failed', error);
    return json({ error: (error as Error).message }, 500);
  }
});
