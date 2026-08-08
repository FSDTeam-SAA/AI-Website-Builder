"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { GaugeIcon, InfoIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatCost, formatTokens } from "@/lib/ai/format";

interface Props {
  projectId: string;
}

function barTone(pct: number): string {
  if (pct >= 0.9) return "bg-red-600";
  if (pct >= 0.7) return "bg-amber-500";
  return "bg-primary";
}

/**
 * Token and context burn.
 *
 * Counts come from the providers' own usage objects on each response, not from
 * character estimates, so what this shows is what was actually billed.
 */
export const TokenMeter = ({ projectId }: Props) => {
  const trpc = useTRPC();

  const { data: project } = useQuery({
    ...trpc.usage.projectTokens.queryOptions({ projectId }),
    refetchInterval: 20_000,
  });

  const { data: windows } = useQuery({
    ...trpc.usage.tokenWindows.queryOptions(),
    refetchInterval: 60_000,
  });

  if (!project) return null;

  const context = project.context;
  const contextPct = context?.pct ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 gap-1.5 px-2 font-mono text-xs"
          aria-label="Token usage"
        >
          <GaugeIcon className="size-3.5 text-muted-foreground" />
          <span>{formatTokens(project.total.tokens)}</span>
          <span className="text-muted-foreground">
            {formatCost(project.total.costUsd)}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="space-y-3 p-4">
          <div>
            <p className="text-sm font-medium">This project</p>
            <p className="mt-0.5 font-mono text-xs text-muted-foreground">
              {formatTokens(project.total.promptTokens)} in ·{" "}
              {formatTokens(project.total.completionTokens)} out ·{" "}
              {formatCost(project.total.costUsd)} est.
            </p>
          </div>

          {context && (
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs font-medium">Context used</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {formatTokens(context.used)} / {formatTokens(context.window)}
                </span>
              </div>
              <Progress
                value={contextPct * 100}
                className="h-1.5"
                indicatorClassName={barTone(contextPct)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Largest prompt on the last run, against {context.modelLabel}&apos;s
                window.
              </p>
            </div>
          )}
        </div>

        {windows && (
          <>
            <Separator />
            <div className="space-y-3 p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Your usage</p>
                {!windows.enforced && (
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    Not enforced
                  </span>
                )}
              </div>

              {windows.windows.map((w) => (
                <div key={w.id}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-xs">{w.label}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {formatTokens(w.tokens)} · {formatCost(w.costUsd)}
                    </span>
                  </div>
                  <Progress
                    value={w.pct * 100}
                    className="h-1.5"
                    indicatorClassName={barTone(w.pct)}
                  />
                  {w.runs > 0 && (
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {w.runs} run{w.runs === 1 ? "" : "s"} · frees up{" "}
                      {formatDistanceToNow(w.resetsAt, { addSuffix: true })}
                    </p>
                  )}
                </div>
              ))}

              <p
                className={cn(
                  "flex items-start gap-1.5 rounded-md bg-muted p-2 text-[11px] leading-relaxed text-muted-foreground",
                )}
              >
                <InfoIcon className="mt-0.5 size-3 shrink-0" />
                <span>
                  Limits are shown but not applied. Costs are estimates from a
                  local price table, not provider billing.
                </span>
              </p>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};
