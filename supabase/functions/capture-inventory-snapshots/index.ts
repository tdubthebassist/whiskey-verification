import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CaptureSnapshotsRpcRow {
  inserted: number;
  skipped: number;
  snapshot_month: string;
  snapshot_date: string;
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
    const { pin, run_at } = await req.json();

    if (typeof pin !== 'string') {
      return json({ error: 'Invalid request' }, 400);
    }
    if (run_at !== undefined && (typeof run_at !== 'string' || Number.isNaN(Date.parse(run_at)))) {
      return json({ error: 'Invalid run_at' }, 400);
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
      .rpc('capture_monthly_inventory_snapshots', {
        p_run_at: run_at ?? new Date().toISOString(),
      })
      .single();

    if (error) {
      throw new Error(`Failed to capture inventory snapshots: ${error.message}`);
    }

    const row = data as CaptureSnapshotsRpcRow;

    return json({
      success: true,
      inserted: row.inserted,
      skipped: row.skipped,
      captured: row.inserted,
      snapshot_month: row.snapshot_month,
      snapshot_date: row.snapshot_date,
    });
  } catch (error) {
    console.error('capture-inventory-snapshots failed', error);
    return json({ error: (error as Error).message }, 500);
  }
});
