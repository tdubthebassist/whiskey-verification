import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  requestAnthropicText,
  requestOpenAIText,
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
const MAX_BODY_BYTES = 64 * 1024;
const MAX_NAME_LENGTH = 120;
const MAX_NOTES_LENGTH = 160;
const PROMPT_GARBAGE_RE = /(```|ignore\s+(all\s+)?previous|system\s*prompt|developer\s*message|instructions?:|https?:\/\/)/i;
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

interface ReferenceEntry {
  brand: string;
  expression: string;
  region: string;
  abv: number;
  age: number | null;
  notes: string;
}

function cleanName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[\x01-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length > MAX_NAME_LENGTH) return null;
  return cleaned;
}

function cleanRegion(value: unknown): string | null {
  return typeof value === 'string' && REGION_KEYS.has(value) ? value : null;
}

function cleanAbv(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 100) return null;
  return Math.round(value * 10) / 10;
}

function cleanAge(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0 || value > 100) return null;
  return value;
}

function cleanNotes(value: unknown): string {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/[\x01-\x1f\x7f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length > MAX_NOTES_LENGTH) return '';
  if (/[{}<>]/.test(cleaned)) return '';
  if (PROMPT_GARBAGE_RE.test(cleaned)) return '';
  return cleaned;
}

function isPromptGarbage(value: string): boolean {
  return PROMPT_GARBAGE_RE.test(value);
}

function invalidRequest(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// Inlined from admin/src/data/reference-whiskeys.ts — keep in sync manually if that list changes.
const REFERENCE_WHISKEYS: ReferenceEntry[] = [
  // ---- Islay ----
  { brand: 'Ardbeg', expression: '10', region: 'islay', abv: 46, age: 10, notes: '강렬한 피트와 타르, 레몬 제스트의 긴 여운' },
  { brand: 'Ardbeg', expression: 'Uigeadail', region: 'islay', abv: 54.2, age: null, notes: '피트와 셰리의 조화, 다크초콜릿과 스모크' },
  { brand: 'Ardbeg', expression: 'Corryvreckan', region: 'islay', abv: 57.1, age: null, notes: '깊은 피트, 블랙페퍼와 다크베리' },
  { brand: 'Laphroaig', expression: '10', region: 'islay', abv: 43, age: 10, notes: '요오드와 바다 내음, 스모키한 약재향' },
  { brand: 'Laphroaig', expression: 'Quarter Cask', region: 'islay', abv: 48, age: null, notes: '바닐라와 코코넛, 강렬한 피트' },
  { brand: 'Lagavulin', expression: '16', region: 'islay', abv: 43, age: 16, notes: '짙은 피트와 셰리의 단맛, 오래 남는 스모크' },
  { brand: 'Lagavulin', expression: '8', region: 'islay', abv: 48, age: 8, notes: '가벼운 피트, 시트러스와 바닐라' },
  { brand: 'Bowmore', expression: '12', region: 'islay', abv: 40, age: 12, notes: '부드러운 스모크와 꿀, 은은한 시트러스' },
  { brand: 'Bowmore', expression: '15', region: 'islay', abv: 43, age: 15, notes: '다크초콜릿과 셰리, 깊은 스모크' },
  { brand: 'Caol Ila', expression: '12', region: 'islay', abv: 43, age: 12, notes: '가벼운 피트, 올리브 오일과 레몬의 산뜻함' },
  { brand: 'Bruichladdich', expression: 'Classic Laddie', region: 'islay', abv: 50, age: null, notes: '비피트, 보리향과 해풍의 미네랄' },
  { brand: 'Bruichladdich', expression: 'Port Charlotte 10', region: 'islay', abv: 50, age: 10, notes: '헤비피트, 스모크와 과일의 균형' },
  { brand: 'Octomore', expression: '14.1', region: 'islay', abv: 59.1, age: 5, notes: '압도적인 피트, 다크초콜릿과 검은 후추' },
  { brand: 'Bunnahabhain', expression: '12', region: 'islay', abv: 46.3, age: 12, notes: '비피트, 견과류와 셰리, 바다소금' },
  // ---- Highland ----
  { brand: 'Glenmorangie', expression: '10 Original', region: 'highland', abv: 40, age: 10, notes: '복숭아와 바닐라, 가벼운 꽃향' },
  { brand: 'Glenmorangie', expression: '18', region: 'highland', abv: 43, age: 18, notes: '꽃향과 오크, 풍부한 바닐라' },
  { brand: 'Glenmorangie', expression: 'Signet', region: 'highland', abv: 46, age: null, notes: '진한 초콜릿과 에스프레소, 농밀한 바디' },
  { brand: 'Aberfeldy', expression: '12', region: 'highland', abv: 40, age: 12, notes: '꿀과 바닐라, 부드러운 토피' },
  { brand: 'Old Pulteney', expression: '12', region: 'highland', abv: 40, age: 12, notes: '해풍의 짭짤함과 사과향' },
  { brand: 'GlenDronach', expression: '12', region: 'highland', abv: 43, age: 12, notes: '셰리, 건포도와 다크초콜릿' },
  { brand: 'GlenDronach', expression: '18 Allardice', region: 'highland', abv: 46, age: 18, notes: '풍부한 셰리, 오렌지와 다크카카오' },
  { brand: 'Dalmore', expression: '12', region: 'highland', abv: 40, age: 12, notes: '오렌지 마멀레이드와 초콜릿, 셰리' },
  { brand: 'Dalmore', expression: '15', region: 'highland', abv: 40, age: 15, notes: '만다린과 셰리, 풍부한 과일' },
  { brand: 'Oban', expression: '14', region: 'highland', abv: 43, age: 14, notes: '바다소금과 오렌지, 은은한 스모크' },
  { brand: 'Clynelish', expression: '14', region: 'highland', abv: 46, age: 14, notes: '왁스와 꿀, 해풍의 미네랄' },
  // ---- Speyside ----
  { brand: 'Glenfiddich', expression: '12', region: 'speyside', abv: 40, age: 12, notes: '서양배와 청사과, 산뜻한 마무리' },
  { brand: 'Glenfiddich', expression: '15 Solera', region: 'speyside', abv: 40, age: 15, notes: '셰리와 바닐라, 견과류의 풍미' },
  { brand: 'Glenfiddich', expression: '18', region: 'speyside', abv: 40, age: 18, notes: '오크와 말린 과일, 풍부한 바디' },
  { brand: 'The Glenlivet', expression: '12', region: 'speyside', abv: 40, age: 12, notes: '꽃향과 시트러스, 가벼운 바디' },
  { brand: 'The Glenlivet', expression: '18', region: 'speyside', abv: 40, age: 18, notes: '오렌지와 스파이스, 따뜻한 오크' },
  { brand: 'Aberlour', expression: '12', region: 'speyside', abv: 40, age: 12, notes: '셰리와 스파이스, 고소한 견과류' },
  { brand: 'Aberlour', expression: "A'bunadh", region: 'speyside', abv: 60, age: null, notes: '캐스크 스트렝스, 강렬한 셰리와 다크초콜릿' },
  { brand: 'Balvenie', expression: 'DoubleWood 12', region: 'speyside', abv: 40, age: 12, notes: '꿀과 셰리, 따뜻한 오크' },
  { brand: 'Balvenie', expression: 'Caribbean Cask 14', region: 'speyside', abv: 43, age: 14, notes: '열대과일과 바닐라, 토피' },
  { brand: 'Glenfarclas', expression: '105', region: 'speyside', abv: 60, age: null, notes: '강한 셰리와 크리스마스 케이크' },
  { brand: 'Macallan', expression: '12 Double Cask', region: 'speyside', abv: 40, age: 12, notes: '셰리와 바닐라, 말린 과일' },
  { brand: 'Macallan', expression: '18 Sherry Oak', region: 'speyside', abv: 43, age: 18, notes: '풍부한 셰리, 말린 과일과 스파이스' },
  // ---- Islands ----
  { brand: 'Talisker', expression: '10', region: 'islands', abv: 45.8, age: 10, notes: '검은 후추와 바다소금, 스모키한 피니시' },
  { brand: 'Talisker', expression: 'Distillers Edition', region: 'islands', abv: 45.8, age: null, notes: '아몬티야도 셰리와 후추, 깊은 스모크' },
  { brand: 'Highland Park', expression: '12 Viking Honour', region: 'islands', abv: 40, age: 12, notes: '헤더 꿀과 가벼운 스모크' },
  { brand: 'Highland Park', expression: '18 Viking Pride', region: 'islands', abv: 43, age: 18, notes: '꿀과 셰리, 깊은 오크와 스모크' },
  { brand: 'Jura', expression: '12', region: 'islands', abv: 40, age: 12, notes: '가벼운 스모크와 토피, 견과류' },
  { brand: 'Arran', expression: '10', region: 'islands', abv: 46, age: 10, notes: '시트러스와 바닐라, 산뜻함' },
  // ---- Campbeltown ----
  { brand: 'Springbank', expression: '10', region: 'campbeltown', abv: 46, age: 10, notes: '짭짤한 피트와 과일, 복합적인 바디' },
  { brand: 'Springbank', expression: '15', region: 'campbeltown', abv: 46, age: 15, notes: '깊은 셰리와 가죽, 오일리한 질감' },
  { brand: 'Kilkerran', expression: '12', region: 'campbeltown', abv: 46, age: 12, notes: '가벼운 피트와 시트러스, 좋은 균형' },
  { brand: 'Glen Scotia', expression: 'Double Cask', region: 'campbeltown', abv: 46, age: null, notes: '셰리와 바닐라, 바다소금' },
  // ---- Lowland ----
  { brand: 'Auchentoshan', expression: '12', region: 'lowland', abv: 40, age: 12, notes: '삼중증류의 부드러움, 시트러스와 아몬드' },
  { brand: 'Auchentoshan', expression: 'Three Wood', region: 'lowland', abv: 43, age: null, notes: '셰리와 오렌지, 풍부한 단맛' },
  { brand: 'Glenkinchie', expression: '12', region: 'lowland', abv: 43, age: 12, notes: '풀향과 레몬, 가벼운 바디' },
  // ---- Japanese ----
  { brand: 'Yamazaki', expression: '12', region: 'japanese', abv: 43, age: 12, notes: '미즈나라 오크의 백단향, 잘 익은 과일' },
  { brand: 'Yamazaki', expression: '18', region: 'japanese', abv: 43, age: 18, notes: '깊은 미즈나라, 말린 과일과 초콜릿' },
  { brand: 'Hakushu', expression: '12', region: 'japanese', abv: 43, age: 12, notes: '청량한 민트와 풋사과, 가벼운 스모크' },
  { brand: 'Hibiki', expression: 'Harmony', region: 'japanese', abv: 43, age: null, notes: '꿀과 오렌지, 미즈나라의 여운' },
  { brand: 'Nikka', expression: 'From The Barrel', region: 'japanese', abv: 51.4, age: null, notes: '풍부한 바디와 스파이스, 카라멜' },
  { brand: 'Nikka', expression: 'Coffey Grain', region: 'japanese', abv: 45, age: null, notes: '부드러운 바닐라와 옥수수, 가벼운 결' },
  { brand: 'Chita', expression: 'Single Grain', region: 'japanese', abv: 43, age: null, notes: '부드러운 바닐라와 꿀, 가벼운 결' },
  { brand: 'Suntory', expression: 'Toki', region: 'japanese', abv: 43, age: null, notes: '풋사과와 꿀, 가볍고 산뜻한 블렌드' },
  // ---- Irish ----
  { brand: 'Jameson', expression: 'Original', region: 'irish', abv: 40, age: null, notes: '부드러운 바닐라와 견과류' },
  { brand: 'Jameson', expression: 'Black Barrel', region: 'irish', abv: 40, age: null, notes: '더블 차르드 오크, 토피와 견과류' },
  { brand: 'Bushmills', expression: '10 Single Malt', region: 'irish', abv: 40, age: 10, notes: '꿀과 바닐라, 부드러운 몰트' },
  { brand: 'Green Spot', expression: '', region: 'irish', abv: 40, age: null, notes: '사과와 꿀, 신선한 오크' },
  { brand: 'Redbreast', expression: '12', region: 'irish', abv: 40, age: 12, notes: '셰리와 스파이스, 풍부한 포트스틸' },
  { brand: 'Redbreast', expression: '15', region: 'irish', abv: 46, age: 15, notes: '진한 과일과 오크, 묵직한 바디' },
  // ---- American / Bourbon ----
  { brand: "Maker's Mark", expression: '', region: 'american', abv: 45, age: null, notes: '카라멜과 바닐라, 부드러운 휘티드' },
  { brand: 'Buffalo Trace', expression: '', region: 'american', abv: 45, age: null, notes: '카라멜과 오크, 가벼운 후추' },
  { brand: 'Wild Turkey', expression: '101', region: 'american', abv: 50.5, age: 8, notes: '강한 스파이스와 카라멜, 오크' },
  { brand: 'Woodford Reserve', expression: '', region: 'american', abv: 43.2, age: null, notes: '말린 과일과 바닐라, 스파이스' },
  { brand: "Michter's", expression: 'US★1 Bourbon', region: 'american', abv: 45.7, age: null, notes: '카라멜과 스톤프루트, 부드러움' },
  { brand: "Booker's", expression: 'Small Batch', region: 'american', abv: 62.5, age: null, notes: '진한 바닐라와 오크, 강렬한 캐스크 스트렝스' },
  { brand: 'Four Roses', expression: 'Single Barrel', region: 'american', abv: 50, age: null, notes: '꽃향과 과일, 스파이시한 오크' },
  { brand: 'Elijah Craig', expression: 'Small Batch', region: 'american', abv: 47, age: null, notes: '바닐라와 카라멜, 따뜻한 오크' },
  { brand: 'Knob Creek', expression: '9 Year', region: 'american', abv: 50, age: 9, notes: '강렬한 오크와 카라멜, 풍부한 바디' },
  // ---- World ----
  { brand: 'Kavalan', expression: 'Classic', region: 'world', abv: 40, age: null, notes: '열대과일과 바닐라, 풍부한 단맛 (대만)' },
  { brand: 'Kavalan', expression: 'Solist Vinho Barrique', region: 'world', abv: 57.8, age: null, notes: '열대과일과 셰리, 강렬한 풍미 (대만)' },
  { brand: 'Amrut', expression: 'Fusion', region: 'world', abv: 50, age: null, notes: '피트와 과일, 스파이시한 바디 (인도)' },
  { brand: 'Penderyn', expression: 'Madeira', region: 'world', abv: 46, age: null, notes: '마데이라와 건포도, 크리미한 질감 (웨일스)' },
  { brand: 'Mackmyra', expression: 'Brukswhisky', region: 'world', abv: 41.4, age: null, notes: '가벼운 과일과 오크, 깔끔함 (스웨덴)' },
  { brand: 'Starward', expression: 'Nova', region: 'world', abv: 41, age: null, notes: '레드와인 캐스크, 과일과 스파이스 (호주)' },
];

async function searchGoogle(query: string): Promise<string> {
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: query,
      gl: 'us',
      hl: 'en',
      num: 10,
    }),
  });

  if (!response.ok) {
    throw new Error(`Serper API failed: ${await response.text()}`);
  }

  const result = await response.json();
  const snippets: string[] = [];

  if (result.organic) {
    for (const item of result.organic) {
      snippets.push(`[${item.title}] ${item.snippet || ''} (${item.link})`);
    }
  }

  return snippets.join('\n\n');
}

async function askClaude(prompt: string): Promise<string> {
  return await requestAnthropicText(ANTHROPIC_API_KEY, prompt, 2048);
}

async function askOpenAI(prompt: string): Promise<string> {
  return await requestOpenAIText(OPENAI_API_KEY, prompt, 2048);
}

async function askAI(prompt: string): Promise<string> {
  try {
    if (ANTHROPIC_API_KEY) {
      return await askClaude(prompt);
    }
    throw new Error('No Anthropic key');
  } catch (claudeErr) {
    console.warn('Claude failed, trying OpenAI:', (claudeErr as Error).message);
    if (OPENAI_API_KEY) {
      return await askOpenAI(prompt);
    }
    throw new Error('Both AI providers unavailable. Claude: ' + (claudeErr as Error).message);
  }
}

function findInReference(brand: string, expression: string): ReferenceEntry | null {
  const normBrand = brand.trim().toLowerCase();
  const normExpr = expression.trim().toLowerCase();
  return (
    REFERENCE_WHISKEYS.find(
      (w) =>
        w.brand.toLowerCase() === normBrand &&
        w.expression.toLowerCase() === normExpr,
    ) ?? null
  );
}

function buildExtractPrompt(brand: string, expression: string, snippets: string): string {
  return `You are extracting whiskey facts from web search snippets.

Whiskey: "${brand} ${expression}"

Search snippets:
${snippets}

Rules:
1. Extract ONLY information explicitly and verbatim stated in the snippets above.
2. Do NOT guess, infer, or use prior knowledge for region, abv, or age.
3. Return null for any field not explicitly present in the snippets.
4. Map region to EXACTLY one of these keys: islay, highland, speyside, islands, campbeltown, lowland, japanese, irish, american, world. Return null if the region cannot be clearly mapped to one of these keys.
5. For notes: write one short Korean tasting note sentence. You may draw on general whiskey knowledge for the tasting note only.

Return ONLY valid JSON (no markdown, no code fences):
{
  "region": "one of the region keys above, or null",
  "abv": number or null,
  "age": number or null,
  "notes": "한국어 테이스팅 노트 한 문장"
}`;
}

function buildNotesPrompt(brand: string, expression: string): string {
  return `"${brand} ${expression}" 위스키에 대한 짧은 한국어 테이스팅 노트를 한 문장으로 작성해주세요.

JSON 형식으로만 답변 (마크다운 없이):
{"notes": "한국어 테이스팅 노트 한 문장"}

테이스팅 노트를 모르면 {"notes": ""}를 반환하세요.`;
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    // Quick header-based size guard before any DB round-trip.
    const contentLength = Number(req.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return invalidRequest('Request body is too large', 413);
    }

    // Authenticate (uses req.clone() internally; original body stream remains intact).
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await authenticate(req, serviceClient);

    // Now read the original body.
    const rawBody = await req.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return invalidRequest('Request body is too large', 413);
    }

    let body: unknown;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return invalidRequest('Invalid JSON body');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return invalidRequest('Invalid request');
    }

    const requestBody = body as Record<string, unknown>;
    const brand = cleanName(requestBody.brand);
    const expression = cleanName(requestBody.expression);
    if (!brand || !expression) {
      return invalidRequest('Invalid request');
    }
    if (isPromptGarbage(brand) || isPromptGarbage(expression)) {
      return invalidRequest('Invalid whiskey name');
    }

    // 1. Reference match (case-insensitive, trimmed)
    const ref = findInReference(brand, expression);
    if (ref) {
      return new Response(
        JSON.stringify({
          region: ref.region,
          abv: ref.abv,
          age: ref.age,
          notes: ref.notes,
          source: 'reference',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // 2. Web search + LLM fact extraction
    if (SERPER_API_KEY) {
      try {
        const query = `"${brand} ${expression}" whisky whiskey ABV region age`;
        const snippets = await searchGoogle(query);

        if (snippets) {
          const prompt = buildExtractPrompt(brand, expression, snippets);
          const text = await askAI(prompt);
          const jsonMatch = text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            return new Response(
              JSON.stringify({
                region: cleanRegion(parsed.region),
                abv: cleanAbv(parsed.abv),
                age: cleanAge(parsed.age),
                notes: cleanNotes(parsed.notes),
                source: 'web',
              }),
              { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
            );
          }
        }
      } catch (webErr) {
        console.warn('Web search/LLM failed, falling back to ai_notes_only:', webErr);
      }
    }

    // 3. Fallback: AI-generated notes only, no verified facts
    let notes = '';
    try {
      const prompt = buildNotesPrompt(brand, expression);
      const text = await askAI(prompt);
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        notes = cleanNotes(parsed.notes);
      }
    } catch (notesErr) {
      console.warn('Notes generation failed:', notesErr);
    }

    return new Response(
      JSON.stringify({ region: null, abv: null, age: null, notes, source: 'ai_notes_only' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const status = err instanceof AuthError ? err.status : 500;
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      {
        status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    );
  }
});
