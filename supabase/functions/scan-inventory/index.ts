import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  type ImageInput,
  parseImageInput,
  requestAnthropicText,
  requestOpenAIText,
  withProviderFallback,
} from '../_shared/ai.ts';
import {
  type InventoryScanResult,
  parseInventoryScanResult,
} from '../_shared/inventory_scan.ts';
import {
  AuthError,
  authenticate,
  resolveBarScope,
  scopedTenantClient,
} from '../_shared/auth.ts';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PROMPT = `Analyze this image for whiskey inventory. Return ONLY valid JSON (no markdown):
{
  "is_whiskey_bottle": boolean,
  "stock_percent": number between 0 and 100 (0 = empty, 100 = full/sealed),
  "confidence": number between 0 and 1,
  "rejection_reason": string or null
}

Guidelines:
- Set is_whiskey_bottle to true when the image visually shows a whiskey bottle, even if label text is unreadable.
- Set is_whiskey_bottle to false for non-whiskey images, non-bottle objects, people, menus, receipts, or unrelated scenes.
- If is_whiskey_bottle is false, set stock_percent to null and explain briefly in rejection_reason.
- 100: bottle is sealed or completely full
- 75: bottle is about three-quarters full
- 50: bottle is half full
- 25: bottle is about one-quarter full
- 0: bottle is empty
- Estimate based on the visible liquid level relative to the bottle height
- If the bottle is sealed/unopened, return 100`;

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function scanWithClaude(image: ImageInput): Promise<InventoryScanResult> {
  return parseInventoryScanResult(
    await requestAnthropicText(ANTHROPIC_API_KEY, PROMPT, 512, image),
  );
}

async function scanWithOpenAI(image: ImageInput): Promise<InventoryScanResult> {
  return parseInventoryScanResult(
    await requestOpenAIText(OPENAI_API_KEY, PROMPT, 512, image),
  );
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const auth = await authenticate(req, serviceClient);

    const body = await req.json() as Record<string, unknown>;
    const { photo, whiskey_id, bar_id } = body;

    if (
      typeof photo !== 'string'
      || photo.length === 0
      || !Number.isInteger(whiskey_id)
    ) {
      return json({ error: 'Invalid request' }, 400);
    }

    let image: ImageInput;
    try {
      image = parseImageInput(photo as string);
    } catch (error) {
      return json({ error: (error as Error).message }, 400);
    }

    const barId = resolveBarScope(auth, bar_id as string | undefined);
    const sc = scopedTenantClient(serviceClient, barId);

    // Validate whiskey_id exists and belongs to this bar
    const { data: whiskey, error: whiskeyError } = await sc.from('whiskeys')
      .select('id')
      .eq('id', whiskey_id)
      .single();

    if (whiskeyError || !whiskey) {
      return json({ error: 'Whiskey not found' }, 404);
    }

    const scanResult = await withProviderFallback({
      operation: 'Inventory scan',
      anthropicApiKey: ANTHROPIC_API_KEY,
      openAIApiKey: OPENAI_API_KEY,
      anthropic: () => scanWithClaude(image),
      openAI: () => scanWithOpenAI(image),
    });

    if (!scanResult.isWhiskeyBottle) {
      return json({
        error: 'Image does not appear to show a whiskey bottle. Please try another photo.',
        code: 'not_whiskey_bottle',
        rejection_reason: scanResult.rejectionReason,
      }, 400);
    }

    const stock_percent = scanResult.stockPercent;
    if (stock_percent === null) {
      throw new Error('Inventory scan returned no stock percentage');
    }

    // Atomic dual-write via RPC; p_bar_id scopes the write to this bar.
    const { error: rpcError } = await serviceClient.rpc('record_inventory_scan', {
      p_bar_id: barId,
      p_whiskey_id: whiskey_id,
      p_stock_percent: stock_percent,
      p_confidence: scanResult.confidence,
      p_source: 'vision_ai',
    });

    if (rpcError) {
      throw new Error(`Failed to record scan: ${rpcError.message}`);
    }

    return json({ whiskey_id, stock_percent, confidence: scanResult.confidence });
  } catch (err) {
    console.error('scan-inventory failed', err);
    const status = err instanceof AuthError ? err.status : 500;
    return json({ error: (err as Error).message }, status);
  }
});
