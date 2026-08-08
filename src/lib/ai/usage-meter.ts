export { formatCost, formatTokens } from "@/lib/ai/format";

import {
  estimateCost,
  getModelSpec,
  type ModelSpec,
  type ProviderId,
} from "@/lib/ai/providers";

/**
 * Token accounting.
 *
 * Every provider reports usage under a different key, and agent-kit hands back
 * the untouched provider response on `AgentResult.raw` (a JSON string). This
 * normalises the four shapes into one so the UI can show what a run actually
 * cost rather than an estimate derived from character counts.
 */

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  /** Prompt tokens served from a provider cache, when reported. */
  cachedTokens: number;
}

export const EMPTY_USAGE: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  cachedTokens: 0,
};

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Pull usage out of a raw provider response.
 *
 * Returns null rather than zeros when nothing is present, so a provider that
 * stops reporting usage shows as "unknown" instead of silently reading as free.
 */
export function extractUsage(raw: unknown, provider: ProviderId): TokenUsage | null {
  let payload: unknown = raw;

  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!payload || typeof payload !== "object") return null;

  const obj = payload as Record<string, unknown>;

  if (provider === "gemini") {
    const meta = obj.usageMetadata as Record<string, unknown> | undefined;
    if (!meta) return null;
    return {
      promptTokens: num(meta.promptTokenCount),
      completionTokens: num(meta.candidatesTokenCount),
      cachedTokens: num(meta.cachedContentTokenCount),
    };
  }

  const usage = obj.usage as Record<string, unknown> | undefined;
  if (!usage) return null;

  if (provider === "anthropic") {
    return {
      // Anthropic reports cache reads separately from `input_tokens`; both were
      // sent, so both count toward context.
      promptTokens:
        num(usage.input_tokens) +
        num(usage.cache_read_input_tokens) +
        num(usage.cache_creation_input_tokens),
      completionTokens: num(usage.output_tokens),
      cachedTokens: num(usage.cache_read_input_tokens),
    };
  }

  // OpenAI and Grok (OpenAI-compatible).
  const details = usage.prompt_tokens_details as Record<string, unknown> | undefined;
  return {
    promptTokens: num(usage.prompt_tokens),
    completionTokens: num(usage.completion_tokens),
    cachedTokens: num(details?.cached_tokens),
  };
}

export interface UsageEntry extends TokenUsage {
  modelId: string;
  calls: number;
  costUsd: number;
}

/**
 * Accumulates usage across every model call in one run.
 *
 * A single turn hits several models — the coding agent many times, plus the
 * cheap title/reply pass and possibly a vision pass — and they have very
 * different prices, so totals have to be summed per model rather than in
 * aggregate tokens.
 */
export class UsageAccumulator {
  private byLabel = new Map<string, UsageEntry>();

  /** Record one inference call. `label` groups calls in the breakdown. */
  record(label: string, spec: ModelSpec, usage: TokenUsage | null): void {
    if (!usage) return;
    if (usage.promptTokens === 0 && usage.completionTokens === 0) return;

    const existing = this.byLabel.get(label);
    const cost = estimateCost(spec, usage.promptTokens, usage.completionTokens);

    if (existing) {
      existing.promptTokens += usage.promptTokens;
      existing.completionTokens += usage.completionTokens;
      existing.cachedTokens += usage.cachedTokens;
      existing.costUsd += cost;
      existing.calls += 1;
      return;
    }

    this.byLabel.set(label, {
      modelId: spec.id,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      cachedTokens: usage.cachedTokens,
      costUsd: cost,
      calls: 1,
    });
  }

  /** Convenience for raw provider payloads. */
  recordRaw(label: string, spec: ModelSpec, raw: unknown): void {
    this.record(label, spec, extractUsage(raw, spec.provider));
  }

  get isEmpty(): boolean {
    return this.byLabel.size === 0;
  }

  /**
   * Largest single prompt seen, which is what the context meter should show —
   * the peak is what would overflow the window, not the sum across calls.
   */
  peakPromptTokens(): number {
    let peak = 0;
    for (const entry of this.byLabel.values()) {
      peak = Math.max(peak, entry.promptTokens / Math.max(1, entry.calls));
    }
    return Math.round(peak);
  }

  totals(): { promptTokens: number; completionTokens: number; costUsd: number } {
    let promptTokens = 0;
    let completionTokens = 0;
    let costUsd = 0;
    for (const entry of this.byLabel.values()) {
      promptTokens += entry.promptTokens;
      completionTokens += entry.completionTokens;
      costUsd += entry.costUsd;
    }
    return { promptTokens, completionTokens, costUsd };
  }

  detail(): Record<string, UsageEntry> {
    return Object.fromEntries(this.byLabel);
  }
}

/** Rough token estimate for text we never sent to a provider. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** How full the model's context window is, as a fraction. */
export function contextUsage(
  promptTokens: number,
  modelId: string | null | undefined,
): { used: number; window: number; pct: number } | null {
  const spec = getModelSpec(modelId);
  if (!spec || !promptTokens) return null;
  return {
    used: promptTokens,
    window: spec.contextWindow,
    pct: Math.min(1, promptTokens / spec.contextWindow),
  };
}
