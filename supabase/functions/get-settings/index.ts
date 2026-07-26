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

// Mirrors the upsert defaults that update-settings would create for a new bar.
const SETTINGS_DEFAULTS = {
  pour_size_ml: 29.5735,
  markup_multiplier: 3.0,
  margin_pct: 15,
  rounding_unit: 1000,
  inventory_snapshot_day: null as number | null,
};

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

    const { data, error } = await sc
      .from('settings')
      .select('bar_id, pour_size_ml, markup_multiplier, margin_pct, rounding_unit, inventory_snapshot_day')
      .maybeSingle();

    if (error) throw error;

    // Return defaults when no settings row exists yet for this bar.
    const settings = data ?? { ...SETTINGS_DEFAULTS, bar_id: barId };

    return json({ settings });
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 500;
    return json({ error: (err as Error).message }, status);
  }
});
