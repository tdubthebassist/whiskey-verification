import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import {
  type ImageInput,
  parseImageInput,
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

async function identifyWithClaude(image: ImageInput): Promise<Record<string, unknown>> {
  const text = await requestAnthropicText(ANTHROPIC_API_KEY, PROMPT, 2048, image);
  return parseJsonObject(text, 'Bottle identification');
}

async function identifyWithOpenAI(image: ImageInput): Promise<Record<string, unknown>> {
  const text = await requestOpenAIText(OPENAI_API_KEY, PROMPT, 2048, image);
  return parseJsonObject(text, 'Bottle identification');
}

serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  try {
    const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    await authenticate(req, serviceClient);

    const { photo } = await req.json();

    if (typeof photo !== 'string' || !photo) {
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

    const identification = await withProviderFallback({
      operation: 'Bottle identification',
      anthropicApiKey: ANTHROPIC_API_KEY,
      openAIApiKey: OPENAI_API_KEY,
      anthropic: () => identifyWithClaude(image),
      openAI: () => identifyWithOpenAI(image),
    });

    return new Response(JSON.stringify(identification), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('identify-bottle failed', err);
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
