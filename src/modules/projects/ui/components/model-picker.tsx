"use client";

import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CpuIcon } from "lucide-react";

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
  projectId: string;
}

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

  const selected = data.selected
    ? data.models.find((m) => m.id === data.selected)
    : null;

  return (
    <Select
      value={data.selected ?? DEFAULT_MODEL_VALUE}
      disabled={setModel.isPending}
      onValueChange={(value) =>
        setModel.mutate({
          projectId,
          modelId: value === DEFAULT_MODEL_VALUE ? null : value,
        })
      }
    >
      <SelectTrigger
        size="sm"
        className="composer-model h-7 w-[150px] border-zinc-200 bg-white text-xs dark:border-zinc-700 dark:bg-zinc-900"
        aria-label="Model used to generate code"
      >
        <CpuIcon className="size-3.5 shrink-0 text-muted-foreground" />
        {/* Not <SelectValue/>: it echoes the selected row's full children, and
            these rows are two lines tall. */}
        <span className="composer-model-label truncate">
          {selected?.label ?? "Default"}
        </span>
      </SelectTrigger>

      <SelectContent className="max-h-[26rem] w-72">
        <ModelOptions models={data.models} />
      </SelectContent>
    </Select>
  );
};
