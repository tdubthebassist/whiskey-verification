import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PROMPT = `Analyze this whiskey bottle image and estimate how full the bottle is. Return ONLY valid JSON (no markdown):
{
  "stock_percent": number between 0 and 100 (0 = empty, 100 = full/sealed),
  "confidence": number between 0 and 1
}

Guidelines:
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

async function scanWithClaude(photo: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: photo },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API: ${err}`);
  }

  const result = await response.json();
  return result.content[0]?.text || '';
}

async function scanWithOpenAI(photo: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/jpeg;base64,${photo}` },
            },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API: ${err}`);
  }

  const result = await response.json();
  return result.choices[0]?.message?.content || '';
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

    // Try Claude first, fall back to OpenAI
    let text = '';
    try {
      if (ANTHROPIC_API_KEY) {
        text = await scanWithClaude(photo);
      } else {
        throw new Error('No Anthropic key');
      }
    } catch (claudeErr) {
      console.warn('Claude failed, trying OpenAI:', (claudeErr as Error).message);
      if (OPENAI_API_KEY) {
        text = await scanWithOpenAI(photo);
      } else {
        throw new Error('Both AI providers unavailable. Claude: ' + (claudeErr as Error).message);
      }
    }

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse scan result');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const parsedStockPercent = Number(parsed.stock_percent);
    const parsedConfidence = Number(parsed.confidence);

    if (!Number.isFinite(parsedStockPercent)) {
      throw new Error('Invalid stock percentage returned by AI provider');
    }

    // Clamp stock_percent to 0-100
    const stock_percent = Math.min(100, Math.max(0, Math.round(parsedStockPercent)));
    const confidence = Number.isFinite(parsedConfidence)
      ? Math.min(1, Math.max(0, parsedConfidence))
      : null;

    // Atomic dual-write via RPC
    const { error: rpcError } = await supabase.rpc('record_inventory_scan', {
      p_whiskey_id: whiskey_id,
      p_stock_percent: stock_percent,
      p_confidence: confidence,
      p_source: 'vision_ai',
    });

    if (rpcError) {
      throw new Error(`Failed to record scan: ${rpcError.message}`);
    }

    return new Response(
      JSON.stringify({ whiskey_id, stock_percent, confidence }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
