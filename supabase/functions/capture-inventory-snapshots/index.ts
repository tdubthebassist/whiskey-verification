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

interface CaptureSnapshotsRpcRow {
  inserted: number;
  skipped: number;
  snapshot_month: string;
  snapshot_date: string;
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

    let body: Record<string, unknown> = {};
    try {
      body = await req.clone().json();
    } catch {
      // run_at and bar_id are optional
    }

    const { run_at, bar_id } = body;

    if (run_at !== undefined && (typeof run_at !== 'string' || Number.isNaN(Date.parse(run_at as string)))) {
      return json({ error: 'Invalid run_at' }, 400);
    }

    const barId = resolveBarScope(auth, bar_id as string | undefined);

    // RPC is not a table-level call so we pass p_bar_id explicitly.
    const { data, error } = await serviceClient
      .rpc('capture_monthly_inventory_snapshots', {
        p_bar_id: barId,
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
  } catch (err) {
    console.error('capture-inventory-snapshots failed', err);
    const status = err instanceof AuthError ? err.status : 500;
    return json({ error: (err as Error).message }, status);
  }
});
