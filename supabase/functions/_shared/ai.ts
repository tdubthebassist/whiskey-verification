export const ANTHROPIC_MODEL = 'claude-sonnet-5';
export const OPENAI_MODEL = 'gpt-5.6-sol';

const SUPPORTED_IMAGE_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

export interface ImageInput {
  data: string;
  dataUrl: string;
  mediaType: string;
}

interface ProviderFallbackOptions<T> {
  operation: string;
  anthropicApiKey: string;
  openAIApiKey: string;
  anthropic: () => Promise<T>;
  openAI: () => Promise<T>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function providerError(response: Response, provider: string): Promise<Error> {
  const requestId = response.headers.get('request-id')
    ?? response.headers.get('x-request-id');
  const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 800);
  const requestSuffix = requestId ? `, request ${requestId}` : '';
  return new Error(`${provider} API ${response.status}${requestSuffix}: ${detail}`);
}

function extractAnthropicText(result: {
  content?: Array<{ type?: string; text?: string }>;
}): string {
  return result.content
    ?.filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim() ?? '';
}

function extractOpenAIText(result: {
  output_text?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
}): string {
  if (typeof result.output_text === 'string' && result.output_text.trim()) {
    return result.output_text.trim();
  }

  return result.output
    ?.flatMap((item) => item.content ?? [])
    .filter((content) => content.type === 'output_text' && typeof content.text === 'string')
    .map((content) => content.text)
    .join('\n')
    .trim() ?? '';
}

export function parseImageInput(photo: unknown): ImageInput {
  if (typeof photo !== 'string' || !photo.trim()) {
    throw new Error('Image is required');
  }

  const value = photo.trim();
  const dataUrlMatch = /^data:([^;,]+);base64,([\s\S]+)$/i.exec(value);
  const mediaType = (dataUrlMatch?.[1] ?? 'image/jpeg').toLowerCase() === 'image/jpg'
    ? 'image/jpeg'
    : (dataUrlMatch?.[1] ?? 'image/jpeg').toLowerCase();
  const data = (dataUrlMatch?.[2] ?? value).replace(/\s+/g, '');

  if (!SUPPORTED_IMAGE_MEDIA_TYPES.has(mediaType)) {
    throw new Error(`Unsupported image type: ${mediaType}`);
  }
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    throw new Error('Image data is not valid base64');
  }

  return {
    data,
    dataUrl: `data:${mediaType};base64,${data}`,
    mediaType,
  };
}

export function parseJsonObject(text: string, operation: string): Record<string, unknown> {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error(`${operation} returned no JSON object`);
  }

  const parsed = JSON.parse(jsonMatch[0]);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${operation} returned an invalid JSON object`);
  }
  return parsed as Record<string, unknown>;
}

export async function requestAnthropicText(
  apiKey: string,
  prompt: string,
  maxTokens: number,
  image?: ImageInput,
): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      messages: [
        {
          role: 'user',
          content: image
            ? [
                {
                  type: 'image',
                  source: {
                    type: 'base64',
                    media_type: image.mediaType,
                    data: image.data,
                  },
                },
                { type: 'text', text: prompt },
              ]
            : prompt,
        },
      ],
    }),
  });

  if (!response.ok) {
    throw await providerError(response, 'Anthropic');
  }

  const text = extractAnthropicText(await response.json());
  if (!text) {
    throw new Error('Anthropic returned an empty response');
  }
  return text;
}

export async function requestOpenAIText(
  apiKey: string,
  prompt: string,
  maxOutputTokens: number,
  image?: ImageInput,
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: { effort: 'none' },
      max_output_tokens: maxOutputTokens,
      input: image
        ? [
            {
              role: 'user',
              content: [
                { type: 'input_image', image_url: image.dataUrl, detail: 'high' },
                { type: 'input_text', text: prompt },
              ],
            },
          ]
        : prompt,
    }),
  });

  if (!response.ok) {
    throw await providerError(response, 'OpenAI');
  }

  const text = extractOpenAIText(await response.json());
  if (!text) {
    throw new Error('OpenAI returned an empty response');
  }
  return text;
}

export async function withProviderFallback<T>(
  options: ProviderFallbackOptions<T>,
): Promise<T> {
  const failures: string[] = [];

  if (options.anthropicApiKey) {
    try {
      return await options.anthropic();
    } catch (error) {
      const message = errorMessage(error);
      failures.push(`Anthropic: ${message}`);
      console.warn(`${options.operation}: Anthropic failed; trying OpenAI`, message);
    }
  } else {
    failures.push('Anthropic: API key is not configured');
  }

  if (options.openAIApiKey) {
    try {
      return await options.openAI();
    } catch (error) {
      const message = errorMessage(error);
      failures.push(`OpenAI: ${message}`);
      console.warn(`${options.operation}: OpenAI failed`, message);
    }
  } else {
    failures.push('OpenAI: API key is not configured');
  }

  console.error(`${options.operation}: all AI providers failed`, failures);
  throw new Error(`${options.operation} failed because all AI providers were unavailable`);
}
