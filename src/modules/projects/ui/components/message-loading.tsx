"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Loader2Icon, SquareIcon } from "lucide-react";

import type { ActivityEvent } from "@/modules/preview/hooks/use-project-stream";

import { ActivitySteps } from "./activity-steps";

interface Props {
  events: ActivityEvent[];
  startedAt?: Date;
  onStop?: () => void;
  isStopping?: boolean;
}

function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/**
 * Live agent activity, in the conversation.
 *
 * This used to cycle nine canned phrases ("Thinking…", "Almost ready…") on a
 * timer, which told the user nothing and kept claiming progress even when a run
 * had stalled. These are the agent's actual steps, streamed from the durable
 * event log — so they also survive a page refresh mid-build.
 */
export const MessageLoading = ({ events, startedAt, onStop, isStopping }: Props) => {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());

  // A build can run for minutes; a counter is the difference between "working"
  // and "hung".
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [events.length]);

  return (
    <div className="group flex flex-col px-2 pb-4">
      <div className="mb-2 flex items-center gap-2 pl-2">
        <Image src="/brand/vibe-mark.png" alt="Vibe" width={18} height={18} className="shrink-0" />
        <span className="text-sm font-medium">Vibe</span>
        <Loader2Icon className="size-3 animate-spin text-muted-foreground" />
        {startedAt && (
          <span className="font-mono text-[10px] text-muted-foreground">
            {formatElapsed(now - startedAt.getTime())}
          </span>
        )}

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

      {/* Capped and scrollable: a long build emits well over a hundred steps,
          which would otherwise push the composer off the screen. */}
      <div className="max-h-64 overflow-y-auto pl-8.5">
        <ActivitySteps events={events} isRunning />
        <div ref={bottomRef} />
      </div>
    </div>
  );
};
