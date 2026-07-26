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
      // Empty or non-JSON body is fine.
    }

    const barId = resolveBarScope(auth, body.bar_id as string | undefined);
    const sc = scopedTenantClient(serviceClient, barId);

    // scopedTenantClient.select() already appends .eq('bar_id', barId).
    // Additional optional filters are chained directly on the returned builder.
    // deno-lint-ignore no-explicit-any
    let query: any = sc
      .from('inventory_logs')
      .select(
        'id, whiskey_id, stock_percent, scanned_at, confidence, source, corrected_at, corrected_from_percent, correction_source',
      );

    if (Number.isInteger(body.whiskey_id)) {
      query = query.eq('whiskey_id', body.whiskey_id);
    }
    if (typeof body.from === 'string') {
      query = query.gte('scanned_at', body.from);
    }
    if (typeof body.to === 'string') {
      query = query.lte('scanned_at', body.to);
    }

    const { data, error } = await query.order('scanned_at', { ascending: false });

    if (error) throw error;

    return json({ logs: data });
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 500;
    return json({ error: (err as Error).message }, status);
  }
});
