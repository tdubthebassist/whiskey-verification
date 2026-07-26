import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { AuthError, authenticate, resolveBarScope } from '../_shared/auth.ts';
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

    // whiskey_id is required — always parse the body.
    const body = await req.json();

    const barId = resolveBarScope(auth, body.bar_id as string | undefined);

    const whiskeyId = body.whiskey_id;
    if (!Number.isInteger(whiskeyId)) {
      return json({ error: 'whiskey_id must be an integer' }, 400);
    }

    // rpc is NOT wrapped by scopedTenantClient (see auth.ts LIMITS section).
    // The bar scope is passed explicitly as p_bar_id per plan §5 / migration §8b.
    const { data, error } = await serviceClient.rpc('get_inventory_daily_trend', {
      p_bar_id: barId,
      p_whiskey_id: whiskeyId,
    });

    if (error) throw error;

    return json({ trend: data });
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 500;
    return json({ error: (err as Error).message }, status);
  }
});
