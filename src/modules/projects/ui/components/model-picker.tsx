"use client";

import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CpuIcon } from "lucide-react";

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
  projectId: string;
}

const PROVIDER_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  gemini: "Google",
  grok: "xAI",
};

const DEFAULT_VALUE = "__default__";

/**
 * Per-project model selection.
 *
 * The registry, resolution order and availability check were already built
 * server-side (`projects.getModels` / `setModel`); nothing was calling them.
 * Models whose provider has no API key configured render disabled rather than
 * being hidden, so it's obvious what's available and why.
 */
export const ModelPicker = ({ projectId }: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data } = useQuery(trpc.projects.getModels.queryOptions({ projectId }));

  const setModel = useMutation({
    ...trpc.projects.setModel.mutationOptions(),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.projects.getModels.queryKey({ projectId }),
      });
      const label = data?.models.find((m) => m.id === variables.modelId)?.label;
      toast.success(label ? `Switched to ${label}` : "Using the default model");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!data) return null;

  const grouped = data.models.reduce<Record<string, typeof data.models>>((acc, model) => {
    (acc[model.provider] ??= []).push(model);
    return acc;
  }, {});

  return (
    <Select
      value={data.selected ?? DEFAULT_VALUE}
      disabled={setModel.isPending}
      onValueChange={(value) =>
        setModel.mutate({
          projectId,
          modelId: value === DEFAULT_VALUE ? null : value,
        })
      }
    >
      <SelectTrigger
        size="sm"
        className="h-7 w-[168px] text-xs"
        aria-label="Model used to generate code"
      >
        <CpuIcon className="size-3.5 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="Model" />
      </SelectTrigger>

      <SelectContent>
        <SelectItem value={DEFAULT_VALUE} className="text-xs">
          Default
        </SelectItem>

        {Object.entries(grouped).map(([provider, models]) => (
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
                <span className="flex flex-col items-start">
                  <span>{model.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {model.available ? model.description : "Needs an API key"}
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
