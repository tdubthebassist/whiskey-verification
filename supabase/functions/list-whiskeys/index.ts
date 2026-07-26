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
      // Empty or non-JSON body is fine for a read endpoint.
    }

    const barId = resolveBarScope(auth, body.bar_id as string | undefined);
    const sc = scopedTenantClient(serviceClient, barId);

    const { data, error } = await sc.from('whiskeys').select(
      'id, brand, expression, region, abv, age, notes, glass_price, bottle_price, cost_price, photo_url, bottle_volume_ml, created_at, updated_at, stock_percent',
    );

    if (error) throw error;

    return json({ whiskeys: data });
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 500;
    return json({ error: (err as Error).message }, status);
  }
});
