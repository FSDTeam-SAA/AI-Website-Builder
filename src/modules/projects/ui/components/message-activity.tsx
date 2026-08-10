"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon, Loader2Icon, SparklesIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import type { ActivityEvent } from "@/modules/preview/hooks/use-project-stream";

import { ActivitySteps } from "./activity-steps";

interface Props {
  projectId: string;
  /** The run whose steps these are — the prompt the agent was answering. */
  runMessageId: string;
  stepCount: number;
}

/**
 * Collapsed "what the agent did" block on a finished turn.
 *
 * Collapsed by default and loaded on demand: the steps are worth having, but a
 * long build produces well over a hundred of them and they would otherwise bury
 * the reply the user actually asked for.
 */
export const MessageActivity = ({ projectId, runMessageId, stepCount }: Props) => {
  const trpc = useTRPC();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    ...trpc.messages.getActivity.queryOptions({ projectId, messageId: runMessageId }),
    enabled: open,
    staleTime: Infinity,
  });

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-fit items-center gap-1.5 rounded-md py-0.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <SparklesIcon className="size-3 shrink-0" />
        <span>
          Worked for {stepCount} {stepCount === 1 ? "step" : "steps"}
        </span>
        <ChevronDownIcon
          className={cn("size-3 shrink-0 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="mt-1.5 border-l pl-3">
          {isLoading ? (
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2Icon className="size-3 animate-spin" />
              Loading steps…
            </span>
          ) : data?.length ? (
            <ActivitySteps events={data as ActivityEvent[]} />
          ) : (
            <span className="text-xs text-muted-foreground">
              The steps for this run are no longer available.
            </span>
          )}
        </div>
      )}
    </div>
  );
};
