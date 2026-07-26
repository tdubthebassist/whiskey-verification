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

    const body = await req.json() as Record<string, unknown>;
    const { confirm, bar_id } = body;

    if (confirm !== 'DELETE_ALL_WHISKEYS') {
      return json({ error: 'Invalid confirmation' }, 400);
    }

    const barId = resolveBarScope(auth, bar_id as string | undefined);
    const sc = scopedTenantClient(serviceClient, barId);

    // scopedTenantClient pre-binds .eq('bar_id', barId) — deletes only this bar's rows.
    const { error, count } = await sc.from('whiskeys').delete();
    if (error) throw error;

    return json({ success: true, deleted: count });
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 500;
    return json({ error: (err as Error).message }, status);
  }
});
