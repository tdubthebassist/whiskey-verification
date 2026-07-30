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
  "stock_percent": number between 0 and 100 or null (0 = empty, 100 = full/sealed),
  "confidence": number between 0 and 1,
  "rejection_reason": string or null,
  "needs_more_photos": boolean,
  "photo_guidance": string or null,
  "geometry": {
    "neck_boundary": { "x": number, "y": number },
    "bottom_boundary": { "x": number, "y": number },
    "liquid_level": { "x": number, "y": number },
    "bottle_angle_degrees": number
  } or null
}

Guidelines:
- Set is_whiskey_bottle to true when the image visually shows a whiskey bottle, even if label text is unreadable.
- Set is_whiskey_bottle to false for non-whiskey images, non-bottle objects, people, menus, receipts, or unrelated scenes.
- If is_whiskey_bottle is false, set stock_percent to null and explain briefly in rejection_reason.
- All geometry coordinates must use the original image dimensions normalized to 0..1000, with (0, 0) at the top-left. Do not use coordinates from a crop.
- neck_boundary is the center point of the upper liquid-containing boundary at the bottle neck/cap line. bottom_boundary is the center point of the bottom of the bottle's liquid-containing interior. Ignore image margins, table/shadow, label edges, and background objects.
- liquid_level is the center point of the visible liquid surface or meniscus. Do not use the bottom of a label, a reflection, or an arbitrary horizontal image row.
- bottle_angle_degrees is the bottle's axis angle in the image: the angle of the line from bottom_boundary to neck_boundary relative to the image's upward vertical axis.
- Correct for camera roll, a tilted bottle, perspective, and image magnification by measuring along the line from bottom_boundary to neck_boundary, not along the image's vertical axis. Compute stock_percent as the liquid_level's projected position on that bottle axis: 0 at bottom_boundary and 100 at neck_boundary.
- Use the bottle's neck and bottom as the measurement limits even when there is empty space above or below the bottle in the photo.
- 100: bottle is sealed, unopened, or completely full. 0: bottle is empty. Otherwise estimate the visible liquid position and round to the nearest whole percent.
- Always provide geometry for a whiskey bottle when the three landmarks are visible. Use geometry: null when the bottle is not measurable.
- Set needs_more_photos to true and provide short photo_guidance when the neck, bottom, liquid level, or bottle axis is obscured, cropped, too distorted by perspective, or otherwise not reliable enough to correct the angle. Do not guess a stock percentage in that case; set stock_percent to null.
- When needs_more_photos is true, ask for one or two additional photos showing the entire bottle, including its neck and bottom, from a straighter or slightly different angle. Set needs_more_photos to false only when the current photo is sufficient.`;

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

    if (scanResult.needsMorePhotos || !scanResult.geometry) {
      return json({
        error: scanResult.photoGuidance
          ?? 'Please take one or two more photos showing the entire bottle, including the neck and bottom, from a straighter angle.',
        code: 'needs_more_photos',
        retryable: true,
      }, 422);
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
