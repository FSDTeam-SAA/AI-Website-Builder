"use client";

import { useQuery } from "@tanstack/react-query";
import { GaugeIcon, RocketIcon, SparklesIcon, ZapIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface Props {
  value: string | null;
  onChange: (modelId: string | null) => void;
  className?: string;
  disabled?: boolean;
}

const DEFAULT_VALUE = "__default__";

const TIERS = [
  {
    id: "light" as const,
    label: "Light",
    icon: ZapIcon,
    hint: "Fast and cheap",
    tone: "text-emerald-600",
  },
  {
    id: "standard" as const,
    label: "Standard",
    icon: GaugeIcon,
    hint: "Balanced",
    tone: "text-primary",
  },
  {
    id: "ultra" as const,
    label: "Ultra",
    icon: RocketIcon,
    hint: "Most capable",
    tone: "text-violet-600",
  },
];

/**
 * Model picker for the home composer, grouped by capability tier.
 *
 * Grouped by tier rather than by provider because the choice a user is actually
 * making is "how much capability do I want to pay for", not "whose model".
 * Models whose provider has no API key configured are shown disabled rather
 * than hidden, so it is obvious what exists and why it is unavailable.
 */
export const ModelSelect = ({ value, onChange, className, disabled }: Props) => {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.projects.getModelCatalog.queryOptions());

  if (!data) return null;

  return (
    <Select
      value={value ?? DEFAULT_VALUE}
      disabled={disabled}
      onValueChange={(v) => onChange(v === DEFAULT_VALUE ? null : v)}
    >
      <SelectTrigger
        size="sm"
        className={cn("h-7 w-auto gap-1.5 border-none text-xs shadow-none", className)}
        aria-label="Model"
      >
        <SparklesIcon className="size-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>

      <SelectContent align="start" className="max-h-[24rem]">
        <SelectItem value={DEFAULT_VALUE} className="text-xs">
          <span className="flex flex-col items-start">
            <span>Auto</span>
            <span className="text-[10px] text-muted-foreground">
              Recommended default
            </span>
          </span>
        </SelectItem>

        {TIERS.map((tier) => {
          const models = data.models.filter((m) => m.tier === tier.id && m.usableForCode);
          if (models.length === 0) return null;
          const Icon = tier.icon;

          return (
            <SelectGroup key={tier.id}>
              <SelectLabel className="flex items-center gap-1.5 text-[11px]">
                <Icon className={cn("size-3", tier.tone)} />
                {tier.label}
                <span className="font-normal text-muted-foreground">· {tier.hint}</span>
              </SelectLabel>

              {models.map((model) => (
                <SelectItem
                  key={model.id}
                  value={model.id}
                  disabled={!model.available}
                  className="text-xs"
                >
                  <span className="flex flex-col items-start">
                    <span>{model.label}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {model.available
                        ? `${model.description} · $${model.pricePerMTok.input}/$${model.pricePerMTok.output} per 1M`
                        : `Needs ${model.provider.toUpperCase()} API key`}
                    </span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
};
