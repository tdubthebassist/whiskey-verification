import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { AuthError, authenticate } from '../_shared/auth.ts';
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

    let barName: string | null = null;
    if (auth.barId) {
      const { data: bar } = await serviceClient
        .from('bars')
        .select('name')
        .eq('id', auth.barId)
        .maybeSingle();
      barName = bar?.name ?? null;
    }

    return json({
      role: auth.role,
      bar_id: auth.barId,
      bar_name: barName,
    });
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 500;
    return json({ error: (err as Error).message }, status);
  }
});
