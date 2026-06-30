import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const PROMPT = `Identify this whiskey bottle from the label. Extract the following information and return ONLY valid JSON (no markdown):
{
  "brand": "distillery/brand name",
  "expression": "variant/expression name (e.g., '12', 'Double Cask', 'Quarter Cask')",
  "age": null or number (age statement in years, null if NAS),
  "region": "one of: islay, highland, speyside, islands, campbeltown, lowland, japanese, irish, american, world",
  "abv": number (alcohol percentage, e.g., 43),
  "notes": "한국어로 간단한 테이스팅 노트 한 문장 (Korean tasting notes, one sentence)",
  "confidence": number between 0 and 1
}`;

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

async function identifyWithClaude(photo: string): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
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

async function identifyWithOpenAI(photo: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1024,
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
    const { pin, photo } = await req.json();

    // Validate PIN
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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

    // Try Claude first, fall back to OpenAI
    let text = '';
    try {
      if (ANTHROPIC_API_KEY) {
        text = await identifyWithClaude(photo);
      } else {
        throw new Error('No Anthropic key');
      }
    } catch (claudeErr) {
      console.warn('Claude failed, trying OpenAI:', (claudeErr as Error).message);
      if (OPENAI_API_KEY) {
        text = await identifyWithOpenAI(photo);
      } else {
        throw new Error('Both AI providers unavailable. Claude: ' + (claudeErr as Error).message);
      }
    }

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Could not parse identification result');
    }

    const identification = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(identification), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
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
