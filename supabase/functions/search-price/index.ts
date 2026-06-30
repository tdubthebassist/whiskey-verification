import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

function buildPrompt(query: string): string {
  return `"${query}" 위스키의 한국 시장 소매 가격을 알려주세요.

데일리샷, 와인앤모어, 이마트 트레이더스 등 한국 온라인/오프라인 주류 매장의 일반적인 판매 가격을 기준으로 알려주세요.
700ml 기준으로 가격을 알려주세요. 다른 용량(예: 750ml, 1000ml)이 일반적인 경우 해당 용량도 포함해주세요.

JSON 형식으로만 답변해주세요 (마크다운 없이):
{
  "prices": [
    {
      "name": "제품명",
      "price": 숫자 (원화 정수, 예: 89000),
      "volume_ml": 숫자 (용량, 예: 700),
      "source": "참고 출처 (예: 데일리샷 기준, 시중 평균가)"
    }
  ]
}

가격을 모르면 {"prices": []}를 반환하세요.
주의: 실제 한국 시장에서 판매되는 합리적인 가격대를 제시해주세요.`;
}

async function searchWithClaude(prompt: string): Promise<string> {
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
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API: ${err}`);
  }

  const result = await response.json();
  return result.content[0]?.text || '';
}

async function searchWithOpenAI(prompt: string): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
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
    const { pin, brand, expression } = await req.json();

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

    const query = `${brand} ${expression}`.trim();
    const prompt = buildPrompt(query);

    // Try Claude first, fall back to OpenAI
    let text = '';
    try {
      if (ANTHROPIC_API_KEY) {
        text = await searchWithClaude(prompt);
      } else {
        throw new Error('No Anthropic key');
      }
    } catch (claudeErr) {
      console.warn('Claude failed, trying OpenAI:', (claudeErr as Error).message);
      if (OPENAI_API_KEY) {
        text = await searchWithOpenAI(prompt);
      } else {
        throw new Error('Both AI providers unavailable. Claude: ' + (claudeErr as Error).message);
      }
    }

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return new Response(
        JSON.stringify({ prices: [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message, prices: [] }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
