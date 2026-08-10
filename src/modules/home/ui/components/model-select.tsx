"use client";

import { useQuery } from "@tanstack/react-query";
import { SparklesIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import {
  DEFAULT_MODEL_VALUE,
  ModelOptions,
} from "@/components/model-options";
import {
  Select,
  SelectContent,
  SelectTrigger,
} from "@/components/ui/select";

interface Props {
  value: string | null;
  onChange: (modelId: string | null) => void;
  className?: string;
  disabled?: boolean;
}

/**
 * Model picker for the home composer, where a model is chosen before a project
 * exists. Rows come from the shared list so this reads identically to the
 * picker inside a project.
 *
 * The trigger renders its own short label rather than <SelectValue/>: that
 * component echoes the selected item's full children, and the two-line rows
 * here blew the composer layout apart.
 */
export const ModelSelect = ({ value, onChange, className, disabled }: Props) => {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.projects.getModelCatalog.queryOptions());

  if (!data) return null;

  const selected = value ? data.models.find((m) => m.id === value) : null;

  return (
    <Select
      value={value ?? DEFAULT_MODEL_VALUE}
      disabled={disabled}
      onValueChange={(v) => onChange(v === DEFAULT_MODEL_VALUE ? null : v)}
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
        <span className="truncate">{selected?.label ?? "Default"}</span>
      </SelectTrigger>

      <SelectContent align="start" className="max-h-[26rem] w-72">
        <ModelOptions models={data.models} />
      </SelectContent>
    </Select>
  );
};
