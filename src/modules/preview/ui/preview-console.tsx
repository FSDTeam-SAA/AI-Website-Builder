"use client";

import { AlertCircleIcon, AlertTriangleIcon, SparklesIcon, Trash2Icon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ConsoleEntry } from "@/modules/preview/hooks/use-preview-bridge";

interface Props {
  entries: ConsoleEntry[];
  onClear: () => void;
  onClose: () => void;
  onFix: (entry: ConsoleEntry) => void;
  isFixing: boolean;
}

/**
 * Runtime errors from inside the preview, surfaced with a one-click repair.
 *
 * Previously a generated app could throw on every render and the user would see
 * only a blank iframe — the errors went to the sandbox's own console, which is
 * cross-origin and unreadable from here. The inspector forwards them instead.
 */
export const PreviewConsole = ({ entries, onClear, onClose, onFix, isFixing }: Props) => {
  return (
    <div className="flex h-56 flex-col border-t bg-sidebar">
      <div className="flex items-center gap-2 border-b px-3 py-1.5">
        <span className="text-xs font-medium">Console</span>
        <span className="text-xs text-muted-foreground">
          {entries.length === 0 ? "No output" : `${entries.length} entries`}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={onClear}>
            <Trash2Icon className="size-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2" onClick={onClose}>
            <XIcon className="size-3.5" />
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1">
        {entries.length === 0 ? (
          <p className="p-4 text-center text-xs text-muted-foreground">
            Errors and warnings from your app will appear here.
          </p>
        ) : (
          <ul className="divide-y">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className={cn(
                  "group flex items-start gap-2 px-3 py-2 text-xs",
                  entry.level === "error" && "bg-red-50/60 dark:bg-red-950/20",
                )}
              >
                {entry.level === "error" ? (
                  <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0 text-red-600" />
                ) : (
                  <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                )}

                <div className="min-w-0 flex-1">
                  <p className="whitespace-pre-wrap break-words font-mono leading-relaxed">
                    {entry.message}
                  </p>
                  {entry.stack && (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px] text-muted-foreground">
                        Stack trace
                      </summary>
                      <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                        {entry.stack}
                      </pre>
                    </details>
                  )}
                </div>

                {entry.count > 1 && (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                    {entry.count}
                  </span>
                )}

                {entry.level === "error" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 shrink-0 px-2 text-[11px] opacity-0 transition-opacity group-hover:opacity-100"
                    disabled={isFixing}
                    onClick={() => onFix(entry)}
                  >
                    <SparklesIcon className="size-3" />
                    Fix with AI
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
};
