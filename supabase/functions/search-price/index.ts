import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  parseJsonObject,
  requestAnthropicText,
  requestOpenAIText,
  withProviderFallback,
} from '../_shared/ai.ts';
import {
  AuthError,
  authenticate,
} from '../_shared/auth.ts';
import { corsHeaders, handlePreflight } from '../_shared/cors.ts';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || '';
const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') || '';
const SERPER_API_KEY = Deno.env.get('SERPER_API_KEY') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface PriceResult {
  name: string;
  price: number;
  volume_ml: number | null;
  source: string;
  url?: string;
}

// Search Google via Serper API
async function searchGoogle(query: string): Promise<string> {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      gl: 'kr',
      hl: 'ko',
      num: 10,
    }),
  });

  if (!response.ok) {
    throw new Error(`Serper API failed: ${await response.text()}`);
  }

  const result = await response.json();

  // Extract relevant info from search results
  const snippets: string[] = [];

  if (result.organic) {
    for (const item of result.organic) {
      snippets.push(`[${item.title}] ${item.snippet || ''} (${item.link})`);
    }
  }

  if (result.shopping) {
    for (const item of result.shopping) {
      snippets.push(`[쇼핑] ${item.title} - ${item.price || '가격 미표시'} (${item.source})`);
    }
  }

  return snippets.join('\n\n');
}

function buildParsePrompt(whiskey: string, searchResults: string): string {
  return `아래는 "${whiskey}" 위스키의 한국 온라인 가격 검색 결과입니다.

검색 결과:
${searchResults}

위 검색 결과에서 실제 판매 가격 정보를 추출해주세요.
- 데일리샷, 와인앤모어, 이마트, 롯데마트 등 신뢰할 수 있는 출처만 포함
- 700ml 또는 750ml 기준 가격 우선
- 가격이 명확히 표시된 것만 포함

JSON 형식으로만 답변 (마크다운 없이):
{
  "prices": [
    {
      "name": "제품명",
      "price": 숫자 (원화 정수),
      "volume_ml": 숫자 또는 null,
      "source": "출처 (예: 데일리샷)"
    }
  ]
}

가격을 찾을 수 없으면 {"prices": []}를 반환하세요.`;
}

// Fallback: AI estimation when no search API available
function buildEstimationPrompt(query: string): string {
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

async function askClaude(prompt: string): Promise<Record<string, unknown>> {
  const text = await requestAnthropicText(ANTHROPIC_API_KEY, prompt, 2048);
  return parseJsonObject(text, 'Price search');
}

async function askOpenAI(prompt: string): Promise<Record<string, unknown>> {
  const text = await requestOpenAIText(OPENAI_API_KEY, prompt, 2048);
  return parseJsonObject(text, 'Price search');
}

async function askAI(prompt: string): Promise<Record<string, unknown>> {
  return await withProviderFallback({
    operation: 'Price search',
    anthropicApiKey: ANTHROPIC_API_KEY,
    openAIApiKey: OPENAI_API_KEY,
    anthropic: () => askClaude(prompt),
    openAI: () => askOpenAI(prompt),
  });
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await authenticate(req, serviceClient);

    const { brand, expression } = await req.json();

    const whiskey = `${brand} ${expression}`.trim();
    let prompt: string;
    let searchMethod = 'estimation';

    // Try real web search first if Serper API key is available
    if (SERPER_API_KEY) {
      try {
        // Search multiple sources
        const searchQueries = [
          `${whiskey} 위스키 가격 데일리샷`,
          `${whiskey} 위스키 가격 와인앤모어`,
        ];

        const searchResults: string[] = [];
        for (const q of searchQueries) {
          try {
            const result = await searchGoogle(q);
            searchResults.push(result);
          } catch (e) {
            console.warn(`Search failed for "${q}":`, e);
          }
        }

        if (searchResults.length > 0) {
          const combinedResults = searchResults.join('\n\n---\n\n');
          prompt = buildParsePrompt(whiskey, combinedResults);
          searchMethod = 'web_search';
        } else {
          prompt = buildEstimationPrompt(whiskey);
        }
      } catch (searchErr) {
        console.warn('Web search failed, falling back to estimation:', searchErr);
        prompt = buildEstimationPrompt(whiskey);
      }
    } else {
      prompt = buildEstimationPrompt(whiskey);
    }

    const parsed = await askAI(prompt);
    const prices = Array.isArray(parsed.prices)
      ? (parsed.prices as PriceResult[]).sort((a, b) => a.price - b.price)
      : [];

    return new Response(JSON.stringify({ ...parsed, prices, method: searchMethod }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('search-price failed', err);
    const status = err instanceof AuthError ? err.status : 500;
    return new Response(
      JSON.stringify({ error: (err as Error).message, prices: [], method: 'error' }),
      {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
