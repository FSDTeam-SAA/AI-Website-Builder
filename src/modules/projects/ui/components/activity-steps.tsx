"use client";

import { useState } from "react";
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  FileCodeIcon,
  Loader2Icon,
  SearchIcon,
  SparklesIcon,
  TerminalIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { CodeView } from "@/components/code-view";
import type { ActivityEvent } from "@/modules/preview/hooks/use-project-stream";

const ICONS: Record<ActivityEvent["type"], React.ElementType> = {
  STATUS: SparklesIcon,
  THINKING: SparklesIcon,
  TOOL_CALL: SearchIcon,
  TOOL_RESULT: CheckCircle2Icon,
  FILE_WRITE: FileCodeIcon,
  TERMINAL: TerminalIcon,
  ERROR: TriangleAlertIcon,
  DONE: CheckCircle2Icon,
};

interface FileWriteDetail {
  path?: string;
  content?: string;
  lines?: number;
  linesBefore?: number;
  isNew?: boolean;
  truncated?: boolean;
}

function languageFor(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "tsx";
}

interface Props {
  events: ActivityEvent[];
  /** Dims everything but the newest step while a run is in flight. */
  isRunning?: boolean;
}

/**
 * The agent's steps, rendered inline in the conversation.
 *
 * This used to be a separate Activity tab, which meant watching the build and
 * reading the reply were mutually exclusive — and the tab auto-stole focus from
 * the preview on every run. The code each write produced is still here, one
 * click down, so nothing was lost by folding it into the chat.
 */
export const ActivitySteps = ({ events, isRunning = false }: Props) => {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <div className="flex flex-col gap-1">
      {events.map((event, index) => {
        const Icon = ICONS[event.type] ?? SparklesIcon;
        const detail = (event.detail ?? {}) as FileWriteDetail;
        const isFileWrite = event.type === "FILE_WRITE" && !!detail.path;
        const isOpen = expanded === event.seq;
        const isLatest = index === events.length - 1;
        const isError = event.type === "ERROR";

        return (
          <div key={event.seq} className="flex flex-col">
            <button
              type="button"
              disabled={!isFileWrite}
              onClick={() => setExpanded(isOpen ? null : event.seq)}
              className={cn(
                "flex items-center gap-2 rounded-md py-0.5 text-left text-xs transition-colors",
                isFileWrite && "-mx-1 px-1 hover:bg-accent",
                !isFileWrite && "cursor-default",
                isError
                  ? "text-red-600"
                  : isRunning && !isLatest
                    ? "text-muted-foreground/60"
                    : "text-muted-foreground",
              )}
            >
              <Icon
                className={cn(
                  "size-3 shrink-0",
                  isRunning && isLatest && !isError && event.type !== "DONE" && "animate-pulse",
                )}
              />
              <span className="min-w-0 flex-1 truncate font-mono">{event.label}</span>
              {isFileWrite && (
                <ChevronDownIcon
                  className={cn(
                    "size-3 shrink-0 opacity-40 transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              )}
            </button>

            {isFileWrite && isOpen && (
              <div className="mb-1 mt-1 overflow-hidden rounded-md border">
                <div className="flex items-center gap-2 border-b bg-sidebar px-2 py-1">
                  <FileCodeIcon className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate font-mono text-[10px]">{detail.path}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                    {detail.isNew
                      ? `new · ${detail.lines ?? 0} lines`
                      : `${detail.linesBefore ?? 0} → ${detail.lines ?? 0} lines`}
                  </span>
                </div>
                <div className="max-h-72 overflow-auto">
                  <CodeView
                    code={detail.content ?? ""}
                    lang={languageFor(detail.path ?? "")}
                  />
                </div>
                {detail.truncated && (
                  <p className="border-t px-2 py-1 text-[10px] text-muted-foreground">
                    Truncated for display — open the Code tab for the full file.
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {isRunning && events.length === 0 && (
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2Icon className="size-3 animate-spin" />
          Getting started…
        </span>
      )}
    </div>
  );
};
