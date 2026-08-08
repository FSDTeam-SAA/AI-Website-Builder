"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2Icon,
  ChevronRightIcon,
  FileCodeIcon,
  Loader2Icon,
  SearchIcon,
  SparklesIcon,
  TerminalIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { CodeView } from "@/components/code-view";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ActivityEvent } from "@/modules/preview/hooks/use-project-stream";

interface Props {
  events: ActivityEvent[];
  isRunning: boolean;
}

interface FileWriteDetail {
  path?: string;
  content?: string;
  lines?: number;
  linesBefore?: number;
  isNew?: boolean;
  truncated?: boolean;
}

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

function languageFor(path: string): string {
  return path.split(".").pop()?.toLowerCase() ?? "tsx";
}

/**
 * Live view of what the agent is doing, including the code as it is written.
 *
 * The chat only ever showed a one-line status, so a three-minute build looked
 * like a spinner. File writes now carry their content on the event stream, and
 * this follows the newest one automatically.
 */
export const ActivityPanel = ({ events, isRunning }: Props) => {
  const [selected, setSelected] = useState<number | null>(null);
  const [follow, setFollow] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fileWrites = useMemo(
    () => events.filter((e) => e.type === "FILE_WRITE"),
    [events],
  );

  const latestWrite = fileWrites[fileWrites.length - 1] ?? null;
  const shown =
    selected !== null
      ? (events.find((e) => e.seq === selected) ?? latestWrite)
      : latestWrite;

  const detail = (shown?.detail ?? {}) as FileWriteDetail;

  // Follow the newest write while a run is in flight, unless the user has
  // deliberately clicked back to an earlier one.
  useEffect(() => {
    if (follow) setSelected(null);
  }, [fileWrites.length, follow]);

  useEffect(() => {
    if (follow) bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [events.length, follow]);

  if (events.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-8 text-center">
        <p className="max-w-sm text-sm text-muted-foreground">
          {isRunning
            ? "Starting…"
            : "When the agent builds or edits your app, you'll see each step and the code it writes here."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-64 shrink-0 flex-col border-r bg-sidebar">
        <div className="flex items-center gap-2 border-b px-3 py-1.5">
          <span className="text-xs font-medium">Activity</span>
          {isRunning && <Loader2Icon className="size-3 animate-spin text-muted-foreground" />}
          <button
            type="button"
            onClick={() => setFollow((v) => !v)}
            className={cn(
              "ml-auto rounded px-1.5 py-0.5 text-[10px] transition-colors",
              follow
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-accent",
            )}
          >
            {follow ? "Following" : "Paused"}
          </button>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <ul className="p-1">
            {events.map((event) => {
              const Icon = ICONS[event.type] ?? SparklesIcon;
              const isFileWrite = event.type === "FILE_WRITE";
              const isSelected = shown?.seq === event.seq;

              return (
                <li key={event.seq}>
                  <button
                    type="button"
                    disabled={!isFileWrite}
                    onClick={() => {
                      setFollow(false);
                      setSelected(event.seq);
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      isFileWrite && "hover:bg-accent",
                      isSelected && isFileWrite && "bg-accent",
                      !isFileWrite && "cursor-default",
                      event.type === "ERROR" && "text-red-600",
                    )}
                  >
                    <Icon className="mt-0.5 size-3 shrink-0" />
                    <span className="min-w-0 flex-1 truncate font-mono">
                      {event.label}
                    </span>
                    {isFileWrite && (
                      <ChevronRightIcon className="mt-0.5 size-3 shrink-0 opacity-40" />
                    )}
                  </button>
                </li>
              );
            })}
            <div ref={bottomRef} />
          </ul>
        </ScrollArea>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        {shown && detail.path ? (
          <>
            <div className="flex items-center gap-2 border-b bg-sidebar px-3 py-1.5">
              <FileCodeIcon className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-mono text-xs">{detail.path}</span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                {detail.isNew
                  ? `new · ${detail.lines ?? 0} lines`
                  : `${detail.linesBefore ?? 0} → ${detail.lines ?? 0} lines`}
              </span>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <CodeView
                code={detail.content ?? ""}
                lang={languageFor(detail.path)}
              />
              {detail.truncated && (
                <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
                  Truncated for display — open the Code tab for the full file.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <p className="max-w-xs text-sm text-muted-foreground">
              {isRunning
                ? "Working… code will appear here as files are written."
                : "Select a file write on the left to see the code."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
