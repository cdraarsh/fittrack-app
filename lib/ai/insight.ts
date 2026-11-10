// ─── Daily insight ────────────────────────────────────────────────────────────
// ≤3 lines, at most one model request per user per day (cached in
// daily_insights). Falls back to rule-based text with no key or on failure.

import { generateText } from 'ai';
import { createFallbackModel, type ProviderEntry } from './providers';
import { INSIGHT_SYSTEM_PROMPT, buildInsightPrompt, clampLines } from './prompts';
import { ruleBasedInsight } from './rules';
import type { StatsPack } from './stats';
import type { DailyInsightRow } from './types';

export const RULES_MODEL = 'rules';
export const RULES_AFTER_ERROR_MODEL = 'rules:error';

export interface InsightStore {
  get(userId: string, date: string): Promise<DailyInsightRow | null>;
  /** Insert; an existing (user_id, date) row is kept (first write wins). */
  save(row: DailyInsightRow): Promise<void>;
}

export interface InsightResult {
  date: string;
  text: string;
  model: string;
  source: 'model' | 'rules';
  cached: boolean;
}

export interface InsightDeps {
  userId: string;
  today: string;
  store: InsightStore;
  loadStats: () => Promise<StatsPack>;
  providers: ProviderEntry[];
  log?: (msg: string, data?: unknown) => void;
}

const isRules = (model: string) => model === RULES_MODEL || model.startsWith('rules');

export async function getDailyInsight(deps: InsightDeps): Promise<InsightResult> {
  const { userId, today, store, providers, log = () => {} } = deps;

  let cached: DailyInsightRow | null = null;
  try {
    cached = await store.get(userId, today);
  } catch (err) {
    log('insight cache read failed', err);
  }
  // Any cached row wins, including a rule row written after a model error, so
  // the model is called at most once per user per day. With no key configured
  // nothing is cached (zero requests), so adding a key takes effect same day.
  if (cached) {
    return { date: today, text: cached.text, model: cached.model, source: isRules(cached.model) ? 'rules' : 'model', cached: true };
  }

  const pack = await deps.loadStats();
  const rules = ruleBasedInsight(pack);

  if (providers.length === 0) {
    // No key configured: zero model requests, nothing to cache.
    return { date: today, text: rules, model: RULES_MODEL, source: 'rules', cached: false };
  }

  const model = createFallbackModel(providers, { onFallback: (label, e) => log(`insight: ${label} failed, falling back`, e) });
  let text = '';
  let label = RULES_AFTER_ERROR_MODEL;
  try {
    const res = await generateText({
      model,
      system: INSIGHT_SYSTEM_PROMPT,
      prompt: buildInsightPrompt(pack),
      maxOutputTokens: 600, // reasoning models spend part of this before the text
      maxRetries: 0,
    });
    text = clampLines(res.text);
    if (text) label = model.lastUsed ?? model.modelId;
  } catch (err) {
    log('insight generation failed', err);
  }

  const source: InsightResult['source'] = text ? 'model' : 'rules';
  const finalText = text || rules;
  try {
    await store.save({ user_id: userId, date: today, text: finalText, stats_pack: pack, model: label });
  } catch (err) {
    log('insight cache write failed', err);
  }
  return { date: today, text: finalText, model: label, source, cached: false };
}
