import {
  parseImageInput,
  parseJsonObject,
  withProviderFallback,
} from './ai.ts';
import { parseInventoryScanResult } from './inventory_scan.ts';

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

Deno.test('parseInventoryScanResult parses a whiskey bottle scan', () => {
  const result = parseInventoryScanResult(JSON.stringify({
    is_whiskey_bottle: true,
    stock_percent: 72.4,
    confidence: 0.84,
    rejection_reason: null,
  }));

  assert(result.isWhiskeyBottle, 'Whiskey bottle classification was not preserved');
  assert(result.stockPercent === 72, 'Stock percent was not rounded');
  assert(result.confidence === 0.84, 'Confidence was not preserved');
  assert(result.rejectionReason === null, 'Whiskey bottle should not have a rejection reason');
});

Deno.test('parseInventoryScanResult clamps numeric stock and confidence', () => {
  const result = parseInventoryScanResult(JSON.stringify({
    is_whiskey_bottle: true,
    stock_percent: 125,
    confidence: 2,
    rejection_reason: null,
  }));

  assert(result.stockPercent === 100, 'Stock percent was not clamped');
  assert(result.confidence === 1, 'Confidence was not clamped');
});

Deno.test('parseInventoryScanResult normalizes missing confidence to null', () => {
  const result = parseInventoryScanResult(JSON.stringify({
    is_whiskey_bottle: true,
    stock_percent: 50,
    rejection_reason: null,
  }));

  assert(result.confidence === null, 'Missing confidence was not normalized to null');
});

Deno.test('parseInventoryScanResult normalizes null confidence to null', () => {
  const result = parseInventoryScanResult(JSON.stringify({
    is_whiskey_bottle: true,
    stock_percent: 50,
    confidence: null,
    rejection_reason: null,
  }));

  assert(result.confidence === null, 'Null confidence was not preserved as null');
});

Deno.test('parseInventoryScanResult returns controlled non-whiskey classification', () => {
  const result = parseInventoryScanResult(JSON.stringify({
    is_whiskey_bottle: false,
    stock_percent: null,
    confidence: 0.91,
    rejection_reason: 'not a bottle',
  }));

  assert(!result.isWhiskeyBottle, 'Non-whiskey classification was not preserved');
  assert(result.stockPercent === null, 'Non-whiskey result should not include stock');
  assert(result.rejectionReason === 'not a bottle', 'Rejection reason was not preserved');
});

Deno.test('parseInventoryScanResult rejects missing classification schema', () => {
  let rejected = false;
  try {
    parseInventoryScanResult(JSON.stringify({ stock_percent: 50, confidence: 0.5 }));
  } catch {
    rejected = true;
  }

  assert(rejected, 'Missing classification was accepted');
});

Deno.test('parseInventoryScanResult rejects invalid stock for whiskey bottles', () => {
  let rejected = false;
  try {
    parseInventoryScanResult(JSON.stringify({
      is_whiskey_bottle: true,
      stock_percent: 'unknown',
      confidence: 0.5,
    }));
  } catch {
    rejected = true;
  }

  assert(rejected, 'Invalid stock was accepted');
});

Deno.test('withProviderFallback does not fallback for a non-whiskey classification', async () => {
  const result = await withProviderFallback({
    operation: 'Inventory scan',
    anthropicApiKey: 'configured',
    openAIApiKey: 'configured',
    anthropic: () => Promise.resolve(parseInventoryScanResult(JSON.stringify({
      is_whiskey_bottle: false,
      stock_percent: null,
      confidence: 0.8,
      rejection_reason: 'not whiskey',
    }))),
    openAI: () => Promise.reject(new Error('OpenAI should not be called')),
  });

  assert(!result.isWhiskeyBottle, 'Non-whiskey classification was not returned directly');
});

Deno.test('withProviderFallback falls back for malformed scan JSON', async () => {
  const result = await withProviderFallback({
    operation: 'Inventory scan',
    anthropicApiKey: 'configured',
    openAIApiKey: 'configured',
    anthropic: () => Promise.resolve(parseInventoryScanResult('not json')),
    openAI: () => Promise.resolve(parseInventoryScanResult(JSON.stringify({
      is_whiskey_bottle: true,
      stock_percent: 65,
      confidence: 0.7,
    }))),
  });

  assert(result.isWhiskeyBottle, 'Fallback whiskey result was not returned');
  assert(result.stockPercent === 65, 'Fallback stock percent was not returned');
});
