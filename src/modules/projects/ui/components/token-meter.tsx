"use client";

import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { GaugeIcon, InfoIcon } from "lucide-react";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatTokens } from "@/lib/ai/format";

interface Props {
  projectId: string;
}

function barTone(pct: number): string {
  if (pct >= 0.9) return "bg-red-600";
  if (pct >= 0.7) return "bg-amber-500";
  return "bg-primary";
}

/** "0%" for genuinely nothing, "<1%" for a real but tiny amount. */
function formatPercent(pct: number): string {
  const percent = Math.min(100, pct * 100);
  if (percent <= 0) return "0%";
  if (percent < 1) return "<1%";
  return `${Math.round(percent)}%`;
}

/**
 * A 0.1% fill is a sub-pixel sliver — indistinguishable from empty. Floor it to
 * a hairline so "a little" never renders as "none".
 */
function barValue(pct: number): number {
  const percent = Math.min(100, pct * 100);
  return percent <= 0 ? 0 : Math.max(1.5, percent);
}

interface MeterProps {
  label: string;
  used: number;
  limit: number;
  pct: number;
  caption?: string;
}

/**
 * One labelled consumption bar.
 *
 * The track is explicitly neutral. The stock `bg-primary/20` is a tint of the
 * brand colour, which at these fill levels made an empty bar look like a full
 * one — every window appeared maxed out when they were all under 2%.
 */
const Meter = ({ label, used, limit, pct, caption }: MeterProps) => (
  <div>
    <div className="mb-1 flex items-baseline justify-between gap-2">
      <span className="text-xs font-medium">{label}</span>
      <span className="font-mono text-[11px] font-medium">{formatPercent(pct)}</span>
    </div>
    <Progress
      value={barValue(pct)}
      className="h-1.5 bg-muted"
      indicatorClassName={barTone(pct)}
    />
    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
      {formatTokens(used)} of {formatTokens(limit)} tokens
    </p>
    {caption && <p className="mt-0.5 text-[11px] text-muted-foreground">{caption}</p>}
  </div>
);

/**
 * Token burn.
 *
 * Counts come from the providers' own usage objects on each response, not from
 * character estimates, so what this shows is what was actually used. Tokens are
 * the only unit here on purpose — a second number in dollars competed with the
 * thing the meter exists to communicate.
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

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="composer-token h-7 gap-1.5 px-2 font-mono text-xs"
          aria-label="Token usage"
        >
          <GaugeIcon className="size-3.5 text-muted-foreground" />
          {/* Labelled: a bare "11k" gave no clue what was being counted. */}
          <span>{formatTokens(project.total.tokens)}</span>
          <span className="text-muted-foreground">tokens</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="space-y-3 p-4">
          <div>
            <p className="text-sm font-medium">This project</p>
            <p className="mt-1 font-mono text-2xl leading-none">
              {formatTokens(project.total.tokens)}
            </p>
            <p className="mt-1.5 font-mono text-xs text-muted-foreground">
              {formatTokens(project.total.promptTokens)} in ·{" "}
              {formatTokens(project.total.completionTokens)} out
            </p>
          </div>

          {context && (
            <Meter
              label="Context used"
              used={context.used}
              limit={context.window}
              pct={context.pct}
              caption={`Largest prompt on the last run, against ${context.modelLabel}'s window.`}
            />
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
                <Meter
                  key={w.id}
                  label={w.label}
                  used={w.tokens}
                  limit={w.limit}
                  pct={w.pct}
                  caption={
                    w.runs > 0
                      ? `${w.runs} run${w.runs === 1 ? "" : "s"} · frees up ${formatDistanceToNow(
                          w.resetsAt,
                          { addSuffix: true },
                        )}`
                      : undefined
                  }
                />
              ))}

              <p className="flex items-start gap-1.5 rounded-md bg-muted p-2 text-[11px] leading-relaxed text-muted-foreground">
                <InfoIcon className="mt-0.5 size-3 shrink-0" />
                <span>Limits are shown but not applied.</span>
              </p>
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
};
