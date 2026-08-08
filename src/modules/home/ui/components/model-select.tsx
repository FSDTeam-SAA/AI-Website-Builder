"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SparklesIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
} from "@/components/ui/select";

interface Props {
  value: string | null;
  onChange: (modelId: string | null) => void;
  className?: string;
  disabled?: boolean;
}

const DEFAULT_VALUE = "__default__";

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google Gemini",
  grok: "xAI Grok",
};

/** Providers in a stable order, so the list doesn't reshuffle between renders. */
const PROVIDER_ORDER = ["openai", "anthropic", "gemini", "grok"];

const TIER_STYLES: Record<string, string> = {
  light: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  standard: "bg-primary/10 text-primary",
  ultra: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
};

const TierBadge = ({ tier }: { tier: string }) => (
  <span
    className={cn(
      "rounded px-1 py-px text-[9px] font-medium uppercase tracking-wide",
      TIER_STYLES[tier] ?? TIER_STYLES.standard,
    )}
  >
    {tier}
  </span>
);

/**
 * Model picker.
 *
 * Grouped by provider so a provider's models sit together, with the capability
 * tier shown as a badge on each row.
 *
 * The trigger renders its own short label rather than <SelectValue/>: that
 * component echoes the selected item's full children, and the two-line rows
 * here blew the composer layout apart.
 */
export const ModelSelect = ({ value, onChange, className, disabled }: Props) => {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.projects.getModelCatalog.queryOptions());

  const grouped = useMemo(() => {
    if (!data) return [];
    return PROVIDER_ORDER.map((provider) => ({
      provider,
      models: data.models.filter((m) => m.provider === provider && m.usableForCode),
    })).filter((g) => g.models.length > 0);
  }, [data]);

  if (!data) return null;

  const selected = value ? data.models.find((m) => m.id === value) : null;

  return (
    <Select
      value={value ?? DEFAULT_VALUE}
      disabled={disabled}
      onValueChange={(v) => onChange(v === DEFAULT_VALUE ? null : v)}
    >
      <SelectTrigger
        size="sm"
        className={cn(
          "h-7 w-auto max-w-[11rem] gap-1.5 border-none px-2 text-xs shadow-none",
          className,
        )}
        aria-label="Model"
      >
        <SparklesIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{selected?.label ?? "Auto"}</span>
      </SelectTrigger>

      <SelectContent align="start" className="max-h-[26rem] w-72">
        <SelectItem value={DEFAULT_VALUE} className="text-xs">
          <span className="flex flex-col items-start gap-0.5">
            <span>Auto</span>
            <span className="text-[10px] text-muted-foreground">
              Recommended default
            </span>
          </span>
        </SelectItem>

        {grouped.map(({ provider, models }) => (
          <SelectGroup key={provider}>
            <SelectLabel className="text-[11px]">
              {PROVIDER_LABELS[provider] ?? provider}
            </SelectLabel>

            {models.map((model) => (
              <SelectItem
                key={model.id}
                value={model.id}
                disabled={!model.available}
                className="text-xs"
              >
                <span className="flex flex-col items-start gap-0.5">
                  <span className="flex items-center gap-1.5">
                    {model.label}
                    <TierBadge tier={model.tier} />
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {model.available
                      ? `$${model.pricePerMTok.input}/$${model.pricePerMTok.output} per 1M`
                      : `Needs ${PROVIDER_LABELS[provider] ?? provider} API key`}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
};
