import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Reads the session token from the x-session-token header, falling back to a
// session_token field in the JSON body (mirrors _shared/auth.ts extraction).
async function readToken(req: Request): Promise<string | null> {
  const header = req.headers.get('x-session-token');
  if (header && header.trim()) {
    return header.trim();
  }
  try {
    const body = await req.clone().json();
    if (body && typeof body === 'object' && typeof body.session_token === 'string') {
      const token = body.session_token.trim();
      if (token) return token;
    }
  } catch {
    // No/invalid JSON body — treat as no token.
  }
  return null;
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const token = await readToken(req);

    if (token) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { error } = await supabase.from('sessions').delete().eq('token', token);
      if (error) throw error;
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
