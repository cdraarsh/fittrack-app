// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { APICallError, generateText, streamText } from 'ai';
import { MockLanguageModelV3, convertArrayToReadableStream } from 'ai/test';
import {
  AllProvidersFailedError,
  createFallbackModel,
  getProviderChain,
  isFallbackError,
  type ProviderEntry,
  type ProviderFactories,
} from '@/lib/ai/providers';
import { rateLimitError, textResult, textStream } from './fixtures';

const fakeFactories: ProviderFactories = {
  groq: (_k, id) => new MockLanguageModelV3({ provider: 'groq', modelId: id }),
  openrouter: (_k, id) => new MockLanguageModelV3({ provider: 'openrouter', modelId: id }),
  gemini: (_k, id) => new MockLanguageModelV3({ provider: 'gemini', modelId: id }),
};

describe('getProviderChain', () => {
  it('is empty with no keys', () => {
    expect(getProviderChain({}, fakeFactories)).toEqual([]);
  });

  it('orders Groq then OpenRouter and skips missing/blank keys', () => {
    expect(getProviderChain({ GROQ_API_KEY: 'g', OPENROUTER_API_KEY: 'o' }, fakeFactories).map(e => e.label)).toEqual([
      'groq:openai/gpt-oss-120b',
      'openrouter:nvidia/nemotron-3-ultra-550b-a55b:free',
    ]);
    expect(getProviderChain({ GROQ_API_KEY: '  ', OPENROUTER_API_KEY: 'o' }, fakeFactories).map(e => e.id)).toEqual([
      'openrouter',
    ]);
  });

  it('keeps Gemini off unless AI_ENABLE_GEMINI=true', () => {
    const env = { GROQ_API_KEY: 'g', GOOGLE_GENERATIVE_AI_API_KEY: 'x' };
    expect(getProviderChain(env, fakeFactories).map(e => e.id)).toEqual(['groq']);
    expect(getProviderChain({ ...env, AI_ENABLE_GEMINI: '1' }, fakeFactories).map(e => e.id)).toEqual(['groq']);
    expect(getProviderChain({ ...env, AI_ENABLE_GEMINI: 'true' }, fakeFactories).map(e => e.id)).toEqual([
      'groq',
      'gemini',
    ]);
  });

  it('allows model overrides', () => {
    expect(getProviderChain({ GROQ_API_KEY: 'g', GROQ_MODEL: 'llama-x' }, fakeFactories)[0].label).toBe('groq:llama-x');
  });

  it('builds real provider models with the default factories', () => {
    const chain = getProviderChain({ GROQ_API_KEY: 'g', OPENROUTER_API_KEY: 'o', GOOGLE_GENERATIVE_AI_API_KEY: 'x', AI_ENABLE_GEMINI: 'true' });
    expect(chain.map(e => [e.model.specificationVersion, e.model.modelId])).toEqual([
      ['v3', 'openai/gpt-oss-120b'],
      ['v3', 'nvidia/nemotron-3-ultra-550b-a55b:free'],
      ['v3', 'gemini-2.5-flash-lite'],
    ]);
  });
});

describe('isFallbackError', () => {
  const apiErr = (statusCode: number) =>
    new APICallError({ message: 'x', url: 'u', requestBodyValues: {}, statusCode, isRetryable: false });
  it('falls back on rate limit, auth, overload', () => {
    for (const code of [429, 401, 403, 500, 503]) expect(isFallbackError(apiErr(code))).toBe(true);
    expect(isFallbackError(new Error('Rate limit exceeded for model'))).toBe(true);
  });
  it('does not fall back on a bad request', () => {
    expect(isFallbackError(apiErr(400))).toBe(false);
    expect(isFallbackError(new Error('invalid tool schema'))).toBe(false);
  });
});

function entries(...models: MockLanguageModelV3[]): ProviderEntry[] {
  return models.map((model, i) => ({ id: (['groq', 'openrouter', 'gemini'] as const)[i], label: `p${i}`, model }));
}

describe('createFallbackModel', () => {
  it('generateText: 429 on Groq falls through to OpenRouter', async () => {
    const groq = new MockLanguageModelV3({ doGenerate: async () => { throw rateLimitError(); } });
    const openrouter = new MockLanguageModelV3({ doGenerate: textResult('from openrouter') });
    const onFallback = vi.fn();
    const model = createFallbackModel(entries(groq, openrouter), { onFallback });

    const res = await generateText({ model, prompt: 'hi', maxRetries: 0 });
    expect(res.text).toBe('from openrouter');
    expect(model.lastUsed).toBe('p1');
    expect(groq.doGenerateCalls).toHaveLength(1);
    expect(openrouter.doGenerateCalls).toHaveLength(1);
    expect(onFallback).toHaveBeenCalledWith('p0', expect.any(APICallError));
  });

  it('uses the first provider when it works', async () => {
    const groq = new MockLanguageModelV3({ doGenerate: textResult('from groq') });
    const openrouter = new MockLanguageModelV3({ doGenerate: textResult('nope') });
    const model = createFallbackModel(entries(groq, openrouter));
    expect((await generateText({ model, prompt: 'hi', maxRetries: 0 })).text).toBe('from groq');
    expect(openrouter.doGenerateCalls).toHaveLength(0);
    expect(model.lastUsed).toBe('p0');
  });

  it('streamText: 429 thrown by doStream falls through', async () => {
    const groq = new MockLanguageModelV3({ doStream: async () => { throw rateLimitError(); } });
    const openrouter = new MockLanguageModelV3({ doStream: textStream('streamed reply') });
    const model = createFallbackModel(entries(groq, openrouter));
    const result = streamText({ model, prompt: 'hi', maxRetries: 0 });
    expect(await result.text).toBe('streamed reply');
    expect(model.lastUsed).toBe('p1');
  });

  it('streamText: 429 reported as the first stream part falls through', async () => {
    const groq = new MockLanguageModelV3({
      doStream: {
        stream: convertArrayToReadableStream([
          { type: 'stream-start', warnings: [] },
          { type: 'error', error: rateLimitError() },
        ]),
      },
    });
    const openrouter = new MockLanguageModelV3({ doStream: textStream('second') });
    const model = createFallbackModel(entries(groq, openrouter));
    expect(await streamText({ model, prompt: 'hi', maxRetries: 0 }).text).toBe('second');
  });

  it('does not switch provider on a non-rate-limit error', async () => {
    const bad = new APICallError({ message: 'bad request', url: 'u', requestBodyValues: {}, statusCode: 400 });
    const groq = new MockLanguageModelV3({ doGenerate: async () => { throw bad; } });
    const openrouter = new MockLanguageModelV3({ doGenerate: textResult('x') });
    const model = createFallbackModel(entries(groq, openrouter));
    await expect(generateText({ model, prompt: 'hi', maxRetries: 0 })).rejects.toThrow('bad request');
    expect(openrouter.doGenerateCalls).toHaveLength(0);
  });

  it('throws AllProvidersFailedError when every provider is rate limited', async () => {
    const a = new MockLanguageModelV3({ doGenerate: async () => { throw rateLimitError(); } });
    const b = new MockLanguageModelV3({ doGenerate: async () => { throw rateLimitError(); } });
    const model = createFallbackModel(entries(a, b));
    const err = await generateText({ model, prompt: 'hi', maxRetries: 0 }).catch(e => e);
    expect(AllProvidersFailedError.prototype.isPrototypeOf(err) || String(err).includes('All AI providers failed')).toBe(true);
    expect(model.lastUsed).toBeNull();
  });

  it('refuses an empty chain', () => {
    expect(() => createFallbackModel([])).toThrow(AllProvidersFailedError);
  });
});
