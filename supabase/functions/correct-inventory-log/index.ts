import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  AuthError,
  authenticate,
  resolveBarScope,
} from '../_shared/auth.ts';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const auth = await authenticate(req, serviceClient);

    const body = await req.json() as Record<string, unknown>;
    const { log_id, whiskey_id, stock_percent, bar_id } = body;

    if (
      !Number.isInteger(log_id)
      || !Number.isInteger(whiskey_id)
      || !Number.isInteger(stock_percent)
      || (stock_percent as number) < 0
      || (stock_percent as number) > 100
    ) {
      return json({ error: 'Invalid request' }, 400);
    }

    const barId = resolveBarScope(auth, bar_id as string | undefined);

    // RPC is not a table-level call so we pass p_bar_id explicitly.
    const { data, error } = await serviceClient
      .rpc('overwrite_inventory_log', {
        p_bar_id: barId,
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
  } catch (err) {
    console.error('correct-inventory-log failed', err);
    const status = err instanceof AuthError ? err.status : 500;
    return json({ error: (err as Error).message }, status);
  }
});
