"use client";

import {
  SelectGroup,
  SelectItem,
  SelectLabel,
} from "@/components/ui/select";

/**
 * The rows inside a model picker.
 *
 * Shared because the home composer and the project picker are the same choice
 * made at two moments, and rendering them separately let them drift: one said
 * "Auto" and the other "Default", one showed prices and the other descriptions,
 * one grouped under "Google Gemini" and the other "Google", and only one
 * filtered out the models that cannot write code.
 */

export const DEFAULT_MODEL_VALUE = "__default__";

export const MODEL_PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google",
  grok: "xAI",
};

/** Stable order, so the list doesn't reshuffle between renders. */
const PROVIDER_ORDER = ["openai", "anthropic", "gemini", "grok"];

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  description: string;
  available: boolean;
  usableForCode: boolean;
}

/**
 * Every model, grouped by provider.
 *
 * Deliberately unfiltered. The cheap "fast" models are legitimate choices for
 * small pages and quick edits, and each row's description already says what it
 * is good for — hiding them just removed options without explaining why.
 */
export function buildModelGroups(models: ModelOption[]) {
  return PROVIDER_ORDER.map((provider) => ({
    provider,
    models: models.filter((model) => model.provider === provider),
  })).filter((group) => group.models.length > 0);
}

interface Props {
  models: ModelOption[];
}

export const ModelOptions = ({ models }: Props) => (
  <>
    <SelectItem value={DEFAULT_MODEL_VALUE} className="text-xs">
      <span className="flex flex-col items-start gap-0.5">
        <span>Default</span>
        <span className="text-[10px] text-muted-foreground">
          Recommended for most builds
        </span>
      </span>
    </SelectItem>

    {buildModelGroups(models).map(({ provider, models: group }) => (
      <SelectGroup key={provider}>
        <SelectLabel className="text-[11px]">
          {MODEL_PROVIDER_LABELS[provider] ?? provider}
        </SelectLabel>

        {group.map((model) => (
          <SelectItem
            key={model.id}
            value={model.id}
            disabled={!model.available}
            className="text-xs"
          >
            <span className="flex flex-col items-start gap-0.5">
              <span>{model.label}</span>
              <span className="text-[10px] text-muted-foreground">
                {model.available ? model.description : "Needs an API key"}
              </span>
            </span>
          </SelectItem>
        ))}
      </SelectGroup>
    ))}
  </>
);
