import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Slug must be lowercase alphanumeric + hyphens only. Reject anything else to
// prevent injection into the .eq() filter (defence in depth on top of the
// slug-only lookup — the client never supplies a raw bar_id).
const SLUG_RE = /^[a-z0-9-]+$/;

serve(async (req: Request) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    // 1. Resolve slug from query param (?bar=<slug>) or JSON body ({ slug }).
    //    Query param is the primary path used by index.html. Body is accepted
    //    for completeness but slug always wins over any body-supplied bar_id —
    //    clients may never bypass slug resolution with a raw id.
    const reqUrl = new URL(req.url);
    let slug = reqUrl.searchParams.get('bar') || 'main';

    if (req.method === 'POST') {
      const ct = req.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        try {
          const body = await req.json();
          if (body.slug && typeof body.slug === 'string') {
            slug = body.slug;
          }
        } catch {
          // JSON parse error — fall back to query-param slug already set above.
        }
      }
    }

    // 2. Validate slug format before touching the DB.
    if (!SLUG_RE.test(slug)) {
      return new Response(JSON.stringify({ error: 'Invalid bar slug' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 3. Use service-role client so RLS deny-all on whiskeys is bypassed
    //    correctly. The isolation guarantee comes from the slug → bar_id
    //    mapping below — only that bar's rows are ever returned.
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 4. Resolve slug → bars.id. The client never supplies a bar_id directly;
    //    cross-bar access is therefore structurally impossible via this path.
    const { data: bar, error: barError } = await serviceClient
      .from('bars')
      .select('id')
      .eq('slug', slug)
      .single();

    if (barError || !bar) {
      return new Response(JSON.stringify({ error: 'Bar not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Fetch only the columns the public menu renders; filter strictly by the
    //    resolved bar_id — no other bar's rows can appear.
    const { data: whiskeys, error: whiskeysError } = await serviceClient
      .from('whiskeys')
      .select('id, brand, expression, region, abv, age, notes, glass_price, bottle_price, photo_url')
      .eq('bar_id', bar.id)
      .order('id');

    if (whiskeysError) throw whiskeysError;

    return new Response(JSON.stringify({ whiskeys: whiskeys ?? [] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
