import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { AuthError, authenticate, requireOwner } from '../_shared/auth.ts';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    requireOwner(auth);

    // Owner is cross-bar, so this reads with the raw service client rather than
    // scopedTenantClient (which pins a single bar).
    const { data: bars, error: barsError } = await serviceClient
      .from('bars')
      .select('id, name')
      .order('name', { ascending: true });
    if (barsError) throw barsError;

    const { data: whiskeys, error: whiskeysError } = await serviceClient
      .from('whiskeys')
      .select('bar_id');
    if (whiskeysError) throw whiskeysError;

    const { data: logs, error: logsError } = await serviceClient
      .from('inventory_logs')
      .select('bar_id, scanned_at');
    if (logsError) throw logsError;

    const countByBar = new Map<string, number>();
    for (const row of (whiskeys ?? []) as { bar_id: string }[]) {
      countByBar.set(row.bar_id, (countByBar.get(row.bar_id) ?? 0) + 1);
    }

    const lastScanByBar = new Map<string, string>();
    for (const row of (logs ?? []) as { bar_id: string; scanned_at: string }[]) {
      const current = lastScanByBar.get(row.bar_id);
      if (!current || row.scanned_at > current) {
        lastScanByBar.set(row.bar_id, row.scanned_at);
      }
    }

    const summary = ((bars ?? []) as { id: string; name: string }[]).map((bar) => ({
      bar_id: bar.id,
      name: bar.name,
      whiskey_count: countByBar.get(bar.id) ?? 0,
      last_scan_date: lastScanByBar.get(bar.id) ?? null,
    }));

    return json({ bars: summary });
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 500;
    return json({ error: (err as Error).message }, status);
  }
});
