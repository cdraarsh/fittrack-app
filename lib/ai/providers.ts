// ─── Provider chain ───────────────────────────────────────────────────────────
// Groq (default) → OpenRouter free model → Gemini (only if AI_ENABLE_GEMINI=true).
// Providers without a key are skipped. A call that fails with a rate limit /
// auth / overload error before any output moves on to the next provider.
// Server-only: keys are read from process.env and never reach the browser.

import { APICallError, LoadAPIKeyError } from 'ai';
import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
  LanguageModelV3StreamResult,
} from '@ai-sdk/provider';
import { createGroq } from '@ai-sdk/groq';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createGoogleGenerativeAI } from '@ai-sdk/google';

export type ProviderId = 'groq' | 'openrouter' | 'gemini';

export interface ProviderEntry {
  id: ProviderId;
  /** 'provider:modelId', stored in daily_insights.model */
  label: string;
  model: LanguageModelV3;
}

export const DEFAULT_MODELS: Record<ProviderId, string> = {
  groq: 'openai/gpt-oss-120b',
  openrouter: 'google/gemma-4-31b-it:free',
  gemini: 'gemini-2.5-flash-lite',
};

type Env = Record<string, string | undefined>;

export type ProviderFactories = Record<ProviderId, (apiKey: string, modelId: string) => LanguageModelV3>;

export const defaultFactories: ProviderFactories = {
  groq: (apiKey, modelId) => createGroq({ apiKey })(modelId),
  openrouter: (apiKey, modelId) =>
    createOpenAICompatible({
      name: 'openrouter',
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
      headers: { 'X-Title': 'FitTrack' },
    }).chatModel(modelId),
  gemini: (apiKey, modelId) => createGoogleGenerativeAI({ apiKey })(modelId),
};

/** Ordered list of configured providers. Empty → callers use rule-based output. */
export function getProviderChain(env: Env = process.env, factories: ProviderFactories = defaultFactories): ProviderEntry[] {
  const specs: { id: ProviderId; key: string | undefined; model: string; enabled: boolean }[] = [
    { id: 'groq', key: env.GROQ_API_KEY, model: env.GROQ_MODEL || DEFAULT_MODELS.groq, enabled: true },
    {
      id: 'openrouter',
      key: env.OPENROUTER_API_KEY,
      model: env.OPENROUTER_MODEL || DEFAULT_MODELS.openrouter,
      enabled: true,
    },
    {
      id: 'gemini',
      key: env.GOOGLE_GENERATIVE_AI_API_KEY,
      model: env.GEMINI_MODEL || DEFAULT_MODELS.gemini,
      // Off by default: free-tier prompts may be used to improve Google products.
      enabled: env.AI_ENABLE_GEMINI === 'true',
    },
  ];
  return specs
    .filter(s => s.enabled && !!s.key?.trim())
    .map(s => ({ id: s.id, label: `${s.id}:${s.model}`, model: factories[s.id](s.key!.trim(), s.model) }));
}

/** Errors that mean "try the next provider" rather than "give up". */
export function isFallbackError(err: unknown): boolean {
  if (LoadAPIKeyError.isInstance(err)) return true;
  if (APICallError.isInstance(err)) {
    const code = err.statusCode;
    if (code === 429 || code === 401 || code === 403 || code === 408 || code === 413) return true;
    if (code !== undefined && code >= 500) return true;
    if (err.isRetryable) return true;
  }
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : '';
  return /rate.?limit|too many requests|quota|overloaded|api key/i.test(msg);
}

export class AllProvidersFailedError extends Error {
  constructor(readonly errors: { label: string; error: unknown }[]) {
    super(`All AI providers failed: ${errors.map(e => e.label).join(', ') || 'none configured'}`);
    this.name = 'AllProvidersFailedError';
  }
}

export interface FallbackModel extends LanguageModelV3 {
  /** Label of the provider that served the most recent call (null until one succeeds). */
  readonly lastUsed: string | null;
}

/**
 * Wrap the chain in one LanguageModelV3. Use one instance per request
 * (lastUsed is per-instance). Pair with maxRetries: 0 in generateText/streamText
 * so a 429 switches provider immediately instead of retrying the same one.
 */
export function createFallbackModel(
  entries: ProviderEntry[],
  opts: { onFallback?: (label: string, error: unknown) => void } = {},
): FallbackModel {
  if (entries.length === 0) throw new AllProvidersFailedError([]);
  let lastUsed: string | null = null;

  async function run<T>(call: (e: ProviderEntry) => Promise<T>): Promise<T> {
    const errors: { label: string; error: unknown }[] = [];
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      try {
        const result = await call(entry);
        lastUsed = entry.label;
        return result;
      } catch (error) {
        errors.push({ label: entry.label, error });
        const last = i === entries.length - 1;
        if (!isFallbackError(error)) throw error;
        if (last) break;
        opts.onFallback?.(entry.label, error);
      }
    }
    throw new AllProvidersFailedError(errors);
  }

  return {
    specificationVersion: 'v3',
    provider: 'fittrack-fallback',
    modelId: entries.map(e => e.label).join('>'),
    supportedUrls: {},
    get lastUsed() {
      return lastUsed;
    },
    doGenerate: (options: LanguageModelV3CallOptions) => run(e => Promise.resolve(e.model.doGenerate(options))),
    doStream: (options: LanguageModelV3CallOptions) =>
      run(async e => peekStream(await e.model.doStream(options))),
  };
}

/**
 * Some providers report a 429 as the first stream part instead of an HTTP
 * error. Read leading metadata parts; if an error arrives before any content,
 * throw it so the chain can move on. Otherwise replay what was read.
 */
async function peekStream(result: LanguageModelV3StreamResult): Promise<LanguageModelV3StreamResult> {
  const reader = result.stream.getReader();
  const buffered: LanguageModelV3StreamPart[] = [];
  let finished = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      finished = true;
      break;
    }
    if (value.type === 'error') {
      reader.cancel().catch(() => {});
      throw value.error;
    }
    buffered.push(value);
    if (value.type !== 'stream-start' && value.type !== 'response-metadata') break;
  }
  const stream = new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      for (const p of buffered) controller.enqueue(p);
      if (finished) controller.close();
    },
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return { ...result, stream };
}
