import { anthropic, gemini, grok, openai } from "@inngest/agent-kit";

import { serverEnv } from "@/lib/env";

/**
 * Model registry.
 *
 * The agent pipeline previously hardcoded `openai({ model: "gpt-4.1" })` in
 * three places. Routing every model choice through here means a project can
 * override its model, an operator can switch providers with an env var, and the
 * "no API key configured" case fails with a clear message instead of a 401 from
 * deep inside an SDK.
 */

export type ProviderId = "openai" | "anthropic" | "gemini" | "grok";

/** What a model is used for. A model may serve several roles. */
export type ModelRole = "code" | "edit" | "fast";

/**
 * Capability/price tier, used to group the model picker.
 *
 * - `light`   cheap and fast; good for simple pages and quick edits
 * - `standard` the sensible default for most builds
 * - `ultra`   frontier models for complex, multi-file work
 */
export type ModelTier = "light" | "standard" | "ultra";

export interface ModelSpec {
  id: string;
  provider: ProviderId;
  label: string;
  roles: ModelRole[];
  tier: ModelTier;
  /** Shown in the model picker. */
  description: string;
  maxTokens: number;
  /** Total context window, used for the context-usage meter. */
  contextWindow: number;
  /** Whether the model accepts images — required for the attachment pre-pass. */
  vision: boolean;
  /**
   * Approximate USD per 1M tokens, for the cost estimate shown in the UI.
   *
   * Provider pricing changes and this is not billed against — every surface
   * that shows a figure derived from it labels it an estimate. This table is
   * the single place to correct.
   */
  pricePerMTok: { input: number; output: number };
}

/**
 * Model ids are provider strings and drift over time — verify against provider
 * docs when adding. Availability is filtered at runtime by which API keys are
 * actually configured, so an entry here is an offer, not a promise.
 */
export const MODELS: readonly ModelSpec[] = [
  // --- OpenAI -------------------------------------------------------------
  {
    id: "gpt-5.6-sol",
    provider: "openai",
    label: "GPT-5.6 Sol",
    roles: ["code", "edit"],
    tier: "ultra",
    description: "OpenAI's flagship. Best for complex, multi-file builds.",
    maxTokens: 32000,
    contextWindow: 1_050_000,
    vision: true,
    pricePerMTok: { input: 5, output: 30 },
  },
  {
    id: "gpt-5.6-terra",
    provider: "openai",
    label: "GPT-5.6 Terra",
    roles: ["code", "edit"],
    tier: "standard",
    description: "Default. Strong all-round code generation.",
    maxTokens: 32000,
    contextWindow: 1_050_000,
    vision: true,
    pricePerMTok: { input: 2, output: 12 },
  },
  {
    id: "gpt-5.6-luna",
    provider: "openai",
    label: "GPT-5.6 Luna",
    roles: ["fast", "edit"],
    tier: "light",
    description: "Very cheap and quick. Great for small pages and edits.",
    maxTokens: 16000,
    contextWindow: 1_050_000,
    vision: true,
    pricePerMTok: { input: 0.2, output: 1.2 },
  },
  {
    id: "gpt-5.4-mini",
    provider: "openai",
    label: "GPT-5.4 mini",
    roles: ["fast"],
    tier: "light",
    description: "Budget option for titles and summaries.",
    maxTokens: 16000,
    contextWindow: 272_000,
    vision: true,
    pricePerMTok: { input: 0.75, output: 4.5 },
  },

  // --- Anthropic ----------------------------------------------------------
  {
    id: "claude-fable-5",
    provider: "anthropic",
    label: "Claude Fable 5",
    roles: ["code", "edit"],
    tier: "ultra",
    description: "Anthropic's most capable. Best for long agentic runs.",
    maxTokens: 32000,
    contextWindow: 1_000_000,
    vision: true,
    pricePerMTok: { input: 10, output: 50 },
  },
  {
    id: "claude-opus-5",
    provider: "anthropic",
    label: "Claude Opus 5",
    roles: ["code", "edit"],
    tier: "ultra",
    description: "Excellent at complex agentic coding.",
    maxTokens: 32000,
    contextWindow: 1_000_000,
    vision: true,
    pricePerMTok: { input: 5, output: 25 },
  },
  {
    id: "claude-sonnet-5",
    provider: "anthropic",
    label: "Claude Sonnet 5",
    roles: ["code", "edit"],
    tier: "standard",
    description: "Best speed/intelligence balance; precise at search-replace.",
    maxTokens: 32000,
    contextWindow: 1_000_000,
    vision: true,
    // Introductory $2/$10 applies through 2026-08-31; the standard rate is
    // used here so estimates do not understate cost after it lapses.
    pricePerMTok: { input: 3, output: 15 },
  },
  {
    id: "claude-haiku-4-5-20251001",
    provider: "anthropic",
    label: "Claude Haiku 4.5",
    roles: ["fast", "edit"],
    tier: "light",
    description: "Fastest Claude, near-frontier quality.",
    maxTokens: 16000,
    contextWindow: 200_000,
    vision: true,
    pricePerMTok: { input: 1, output: 5 },
  },

  // --- Google -------------------------------------------------------------
  {
    id: "gemini-3.1-pro-preview",
    provider: "gemini",
    label: "Gemini 3.1 Pro",
    roles: ["code", "edit"],
    tier: "ultra",
    description: "Google's strongest reasoning model.",
    maxTokens: 32000,
    contextWindow: 1_000_000,
    vision: true,
    pricePerMTok: { input: 2, output: 12 },
  },
  {
    id: "gemini-3.6-flash",
    provider: "gemini",
    label: "Gemini 3.6 Flash",
    roles: ["code", "edit"],
    tier: "standard",
    description: "Fast with a very large context window.",
    maxTokens: 32000,
    contextWindow: 1_000_000,
    vision: true,
    pricePerMTok: { input: 1.5, output: 7.5 },
  },
  {
    id: "gemini-3.5-flash-lite",
    provider: "gemini",
    label: "Gemini 3.5 Flash-Lite",
    roles: ["fast"],
    tier: "light",
    description: "Cheapest Gemini; high-volume work.",
    maxTokens: 16000,
    contextWindow: 1_000_000,
    vision: true,
    pricePerMTok: { input: 0.3, output: 2.5 },
  },

  // --- xAI ----------------------------------------------------------------
  {
    id: "grok-build-0.1",
    provider: "grok",
    label: "Grok Build 0.1",
    roles: ["code", "edit"],
    tier: "standard",
    description: "Purpose-trained for agentic coding. Very fast, cheap.",
    maxTokens: 32000,
    contextWindow: 256_000,
    vision: true,
    pricePerMTok: { input: 1, output: 2 },
  },
  {
    id: "grok-4.5",
    provider: "grok",
    label: "Grok 4.5",
    roles: ["code", "edit"],
    tier: "ultra",
    description: "xAI's frontier model.",
    maxTokens: 32000,
    contextWindow: 500_000,
    vision: true,
    pricePerMTok: { input: 2, output: 6 },
  },
  {
    id: "grok-4.3",
    provider: "grok",
    label: "Grok 4.3",
    roles: ["code", "edit", "fast"],
    tier: "light",
    description: "Cheap with a 1M context window.",
    maxTokens: 16000,
    contextWindow: 1_000_000,
    vision: true,
    pricePerMTok: { input: 1.25, output: 2.5 },
  },
];

const BY_ID = new Map(MODELS.map((m) => [m.id, m]));

export function isKnownModel(id: string): boolean {
  return BY_ID.has(id);
}

function apiKeyFor(provider: ProviderId): string {
  const env = serverEnv();
  switch (provider) {
    case "openai":
      return env.OPENAI_API_KEY;
    case "anthropic":
      return env.ANTHROPIC_API_KEY;
    case "gemini":
      return env.GEMINI_API_KEY;
    case "grok":
      return env.GROK_API_KEY;
  }
}

export function isProviderConfigured(provider: ProviderId): boolean {
  return apiKeyFor(provider).length > 0;
}

/**
 * Resolved model plus its key, for callers that talk to a provider's REST API
 * directly instead of going through agent-kit — currently the image
 * description pass, which agent-kit cannot express (its message content type is
 * text-only).
 */
export function resolveVisionModel(
  override?: string | null,
): { spec: ModelSpec; apiKey: string } | null {
  const candidates: (ModelSpec | undefined)[] = [
    override ? BY_ID.get(override) : undefined,
    BY_ID.get(defaultModelIdFor("fast")),
    BY_ID.get(defaultModelIdFor("code")),
  ];

  for (const spec of candidates) {
    if (spec?.vision && isProviderConfigured(spec.provider)) {
      return { spec, apiKey: apiKeyFor(spec.provider) };
    }
  }

  // Prefer a cheap vision model — this pass only produces a description.
  const fallback =
    MODELS.find((m) => m.vision && m.roles.includes("fast") && isProviderConfigured(m.provider)) ??
    MODELS.find((m) => m.vision && isProviderConfigured(m.provider));

  return fallback ? { spec: fallback, apiKey: apiKeyFor(fallback.provider) } : null;
}

export function getModelSpec(id: string | null | undefined): ModelSpec | null {
  return id ? (BY_ID.get(id) ?? null) : null;
}

/** Estimated USD cost. Labelled as an estimate everywhere it is displayed. */
export function estimateCost(
  spec: ModelSpec,
  promptTokens: number,
  completionTokens: number,
): number {
  return (
    (promptTokens / 1_000_000) * spec.pricePerMTok.input +
    (completionTokens / 1_000_000) * spec.pricePerMTok.output
  );
}

/** Models whose provider actually has a key configured. */
export function listModels(): (ModelSpec & { available: boolean })[] {
  return MODELS.map((m) => ({ ...m, available: isProviderConfigured(m.provider) }));
}

function defaultModelIdFor(role: ModelRole): string {
  const env = serverEnv();
  switch (role) {
    case "code":
      return env.AI_MODEL_CODE;
    case "edit":
      return env.AI_MODEL_EDIT;
    case "fast":
      return env.AI_MODEL_FAST;
  }
}

/**
 * Resolve a model for a role.
 *
 * Precedence: explicit override (per-project) -> env default for the role ->
 * first configured model that serves the role. The final fallback matters: it
 * keeps the app working when someone sets ANTHROPIC_API_KEY only, without also
 * having to remember to change three AI_MODEL_* variables.
 */
export function resolveModelSpec(role: ModelRole, override?: string | null): ModelSpec {
  const candidates = [override, defaultModelIdFor(role)].filter(
    (id): id is string => !!id,
  );

  for (const id of candidates) {
    const spec = BY_ID.get(id);
    if (spec && isProviderConfigured(spec.provider)) return spec;
  }

  const fallback = MODELS.find(
    (m) => m.roles.includes(role) && isProviderConfigured(m.provider),
  );
  if (fallback) return fallback;

  const tried = candidates.join(", ") || "(none)";
  throw new Error(
    `No AI model available for role "${role}". Tried: ${tried}. ` +
      `Set one of OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY / GROK_API_KEY ` +
      `and a matching AI_MODEL_${role.toUpperCase()}.`,
  );
}

/** Build the agent-kit adapter for a role. */
export function getModel(
  role: ModelRole,
  opts: { override?: string | null; temperature?: number } = {},
) {
  const spec = resolveModelSpec(role, opts.override);
  const apiKey = apiKeyFor(spec.provider);
  const temperature = opts.temperature ?? (role === "fast" ? 0.3 : 0.1);

  switch (spec.provider) {
    case "openai":
      return openai({
        model: spec.id,
        apiKey,
        defaultParameters: { temperature },
      });
    case "anthropic":
      return anthropic({
        model: spec.id,
        apiKey,
        // Anthropic requires max_tokens explicitly.
        defaultParameters: { max_tokens: spec.maxTokens, temperature },
      });
    case "gemini":
      return gemini({
        model: spec.id,
        apiKey,
        defaultParameters: { generationConfig: { temperature } },
      });
    case "grok":
      return grok({
        model: spec.id,
        apiKey,
        defaultParameters: { temperature },
      });
  }
}
