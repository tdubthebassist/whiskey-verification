// Shared CORS/preflight helpers for the Edge Functions.
//
// Extracted from the boilerplate that was inlined in each function. The only
// intentional addition over the historical inline copy is `x-session-token`
// in Access-Control-Allow-Headers, so browsers may send the opaque session
// token (Decision B, plan §3) on cross-origin function calls.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-session-token',
};

// Returns a preflight response when the request is a CORS preflight (OPTIONS),
// or null when the request should be handled normally by the caller.
export function handlePreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  return null;
}
