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

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
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
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { pin, photo, whiskey_id } = await req.json();

    if (
      typeof pin !== 'string'
      || typeof photo !== 'string'
      || photo.length === 0
      || !Number.isInteger(whiskey_id)
    ) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let image: ImageInput;
    try {
      image = parseImageInput(photo);
    } catch (error) {
      return new Response(JSON.stringify({ error: (error as Error).message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Validate PIN
    const { data: settings } = await supabase
      .from('settings')
      .select('pin_hash')
      .eq('id', 1)
      .single();

    if (!settings || (await hashPin(pin)) !== settings.pin_hash) {
      return new Response(JSON.stringify({ error: 'Invalid PIN' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate whiskey_id exists
    const { data: whiskey, error: whiskeyError } = await supabase
      .from('whiskeys')
      .select('id')
      .eq('id', whiskey_id)
      .single();

    if (whiskeyError || !whiskey) {
      return new Response(JSON.stringify({ error: 'Whiskey not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const scanResult = await withProviderFallback({
      operation: 'Inventory scan',
      anthropicApiKey: ANTHROPIC_API_KEY,
      openAIApiKey: OPENAI_API_KEY,
      anthropic: () => scanWithClaude(image),
      openAI: () => scanWithOpenAI(image),
    });

    if (!scanResult.isWhiskeyBottle) {
      return new Response(JSON.stringify({
        error: 'Image does not appear to show a whiskey bottle. Please try another photo.',
        code: 'not_whiskey_bottle',
        rejection_reason: scanResult.rejectionReason,
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const stock_percent = scanResult.stockPercent;
    if (stock_percent === null) {
      throw new Error('Inventory scan returned no stock percentage');
    }

    // Atomic dual-write via RPC
    const { error: rpcError } = await supabase.rpc('record_inventory_scan', {
      p_whiskey_id: whiskey_id,
      p_stock_percent: stock_percent,
      p_confidence: scanResult.confidence,
      p_source: 'vision_ai',
    });

    if (rpcError) {
      throw new Error(`Failed to record scan: ${rpcError.message}`);
    }

    return new Response(
      JSON.stringify({ whiskey_id, stock_percent, confidence: scanResult.confidence }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    console.error('scan-inventory failed', error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
