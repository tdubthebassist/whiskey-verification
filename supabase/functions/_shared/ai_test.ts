import {
  parseImageInput,
  parseJsonObject,
  withProviderFallback,
} from './ai.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('parseImageInput preserves a supported data URL media type', () => {
  const image = parseImageInput('data:image/png;base64,iVBORw0KGgo=');

  assert(image.mediaType === 'image/png', 'PNG media type was not preserved');
  assert(image.data === 'iVBORw0KGgo=', 'Base64 payload was changed');
  assert(image.dataUrl.startsWith('data:image/png;base64,'), 'PNG data URL was not preserved');
});

Deno.test('parseImageInput keeps legacy raw base64 compatible as JPEG', () => {
  const image = parseImageInput('/9j/4AAQSkZJRg==');

  assert(image.mediaType === 'image/jpeg', 'Legacy image did not default to JPEG');
});

Deno.test('parseImageInput rejects unsupported image types', () => {
  let rejected = false;
  try {
    parseImageInput('data:image/heic;base64,AAAA');
  } catch {
    rejected = true;
  }

  assert(rejected, 'Unsupported image type was accepted');
});

Deno.test('parseJsonObject extracts JSON from provider text', () => {
  const parsed = parseJsonObject('Result: {"stock_percent": 50}', 'Test');

  assert(parsed.stock_percent === 50, 'JSON object was not extracted');
});

Deno.test('withProviderFallback uses OpenAI after an Anthropic failure', async () => {
  const result = await withProviderFallback({
    operation: 'Test',
    anthropicApiKey: 'configured',
    openAIApiKey: 'configured',
    anthropic: () => Promise.reject(new Error('retired model')),
    openAI: () => Promise.resolve('fallback-ok'),
  });

  assert(result === 'fallback-ok', 'OpenAI fallback was not used');
});
