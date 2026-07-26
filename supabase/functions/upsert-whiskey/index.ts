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
const REGION_KEYS = new Set([
  'islay',
  'highland',
  'speyside',
  'islands',
  'campbeltown',
  'lowland',
  'japanese',
  'irish',
  'american',
  'world',
]);

class ValidationError extends Error {}

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function buildWhiskeyPayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ValidationError('Invalid whiskey payload');
  }

  const whiskey = value as Record<string, unknown>;
  const brand = typeof whiskey.brand === 'string' ? whiskey.brand.trim() : '';
  const expression = typeof whiskey.expression === 'string' ? whiskey.expression.trim() : '';
  const region = whiskey.region;
  const abv = whiskey.abv;
  const age = whiskey.age;
  const notes = whiskey.notes;
  const glassPrice = whiskey.glass_price;
  const bottlePrice = whiskey.bottle_price;
  const costPrice = whiskey.cost_price;
  const photoUrl = whiskey.photo_url;
  const bottleVolume = whiskey.bottle_volume_ml;

  if (!brand || brand.length > 120 || expression.length > 120) {
    throw new ValidationError('Brand and expression are required and must be 120 characters or fewer');
  }
  if (typeof region !== 'string' || !REGION_KEYS.has(region)) {
    throw new ValidationError('Invalid region');
  }
  if (typeof abv !== 'number' || !Number.isFinite(abv) || abv <= 0 || abv > 100) {
    throw new ValidationError('Invalid ABV');
  }
  if (age !== null && (!Number.isInteger(age) || age <= 0 || age > 100)) {
    throw new ValidationError('Invalid age');
  }
  if (typeof notes !== 'string' || notes.length > 2000) {
    throw new ValidationError('Invalid notes');
  }
  for (const [label, price] of [['glass_price', glassPrice], ['bottle_price', bottlePrice]] as const) {
    if (typeof price !== 'number' || !Number.isSafeInteger(price) || price < 0) {
      throw new ValidationError(`Invalid ${label}`);
    }
  }
  if (
    costPrice !== null
    && (typeof costPrice !== 'number' || !Number.isSafeInteger(costPrice) || costPrice < 0)
  ) {
    throw new ValidationError('Invalid cost_price');
  }
  if (photoUrl !== null && (typeof photoUrl !== 'string' || photoUrl.length > 2_000_000)) {
    throw new ValidationError('Invalid photo_url');
  }
  if (
    typeof bottleVolume !== 'number'
    || !Number.isSafeInteger(bottleVolume)
    || bottleVolume <= 0
    || bottleVolume > 10_000
  ) {
    throw new ValidationError('Invalid bottle_volume_ml');
  }

  return {
    brand,
    expression,
    region,
    abv,
    age,
    notes,
    glass_price: glassPrice,
    bottle_price: bottlePrice,
    cost_price: costPrice,
    photo_url: photoUrl,
    bottle_volume_ml: bottleVolume,
  };
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const auth = await authenticate(req, serviceClient);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ValidationError('Invalid JSON body');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ValidationError('Invalid request');
    }

    const { whiskey, id, bar_id } = body as Record<string, unknown>;
    if (id !== undefined && id !== null && (!Number.isSafeInteger(id) || (id as number) <= 0)) {
      throw new ValidationError('Invalid id');
    }
    const payload = buildWhiskeyPayload(whiskey);

    const barId = resolveBarScope(auth, bar_id as string | undefined);
    const sc = scopedTenantClient(serviceClient, barId);

    let result: Record<string, unknown>;
    if (id) {
      // Update existing whiskey, scoped to this bar
      const { data, error } = await sc.from('whiskeys')
        .update({ ...payload, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id')
        .single();
      if (error) throw error;
      result = data as Record<string, unknown>;
    } else {
      // Insert new whiskey; scopedTenantClient stamps bar_id
      const { data, error } = await sc.from('whiskeys')
        .insert(payload)
        .select('id')
        .single();
      if (error) throw error;
      result = data as Record<string, unknown>;
    }

    return json(result);
  } catch (err) {
    const status = err instanceof AuthError
      ? err.status
      : err instanceof ValidationError
      ? 400
      : 500;
    return json({ error: (err as Error).message }, status);
  }
});
