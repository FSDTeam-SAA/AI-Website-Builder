"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import {
  CheckCircle2Icon,
  FileCodeIcon,
  Loader2Icon,
  SearchIcon,
  SquareIcon,
  TerminalIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { ActivityEvent } from "@/modules/preview/hooks/use-project-stream";

const ICONS: Record<ActivityEvent["type"], React.ElementType> = {
  STATUS: Loader2Icon,
  THINKING: Loader2Icon,
  TOOL_CALL: SearchIcon,
  TOOL_RESULT: SearchIcon,
  FILE_WRITE: FileCodeIcon,
  TERMINAL: TerminalIcon,
  ERROR: TriangleAlertIcon,
  DONE: CheckCircle2Icon,
};

interface Props {
  events: ActivityEvent[];
  onStop?: () => void;
  isStopping?: boolean;
}

/**
 * Live agent activity.
 *
 * This used to cycle nine canned phrases ("Thinking…", "Almost ready…") on a
 * timer, which told the user nothing and kept claiming progress even when a run
 * had stalled. These are the agent's actual steps, streamed from the durable
 * event log — so they also survive a page refresh mid-build.
 */
export const MessageLoading = ({ events, onStop, isStopping }: Props) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const recent = events.slice(-6);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [events.length]);

  return (
    <div className="group flex flex-col px-2 pb-4">
      <div className="mb-2 flex items-center gap-2 pl-2">
        <Image src="/logo.svg" alt="Vibe" width={18} height={18} className="shrink-0" />
        <span className="text-sm font-medium">Vibe</span>
        <Loader2Icon className="size-3 animate-spin text-muted-foreground" />

        {onStop && (
          <button
            type="button"
            onClick={onStop}
            disabled={isStopping}
            className="ml-auto mr-2 flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-50"
          >
            <SquareIcon className="size-2.5 fill-current" />
            {isStopping ? "Stopping…" : "Stop"}
          </button>
        )}
      </div>

      <div className="flex flex-col gap-1.5 pl-8.5">
        {recent.length === 0 ? (
          <span className="animate-pulse text-sm text-muted-foreground">
            Getting started…
          </span>
        ) : (
          recent.map((event, index) => {
            const Icon = ICONS[event.type] ?? Loader2Icon;
            const isLatest = index === recent.length - 1;
            return (
              <div
                key={event.seq}
                className={cn(
                  "flex items-center gap-2 text-xs transition-opacity",
                  isLatest ? "text-foreground" : "text-muted-foreground/60",
                  event.type === "ERROR" && "text-red-600",
                )}
              >
                <Icon
                  className={cn(
                    "size-3 shrink-0",
                    isLatest && event.type !== "ERROR" && event.type !== "DONE"
                      ? "animate-pulse"
                      : "",
                  )}
                />
                <span className="truncate font-mono">{event.label}</span>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
