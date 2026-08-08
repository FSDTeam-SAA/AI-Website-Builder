import "server-only";

import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";

/**
 * Rolling token windows.
 *
 * Answers "how much have I burned in the last 5 hours / day / week", the way a
 * real coding platform surfaces its limits. Aggregated from `Message` rows
 * because those carry the real per-run token counts and a timestamp;
 * `Project.total*` is a lifetime counter with no time dimension.
 *
 * Limits are defined and displayed but NOT enforced while USAGE_ENFORCEMENT is
 * false — the meter fills up and nothing blocks. Flipping that env var to true
 * is the only change needed to start rejecting.
 */

export interface TokenWindow {
  id: string;
  label: string;
  hours: number;
  tokens: number;
  costUsd: number;
  runs: number;
  /** Soft cap for the progress bar. */
  limit: number;
  pct: number;
  /** When the oldest run in this window ages out. */
  resetsAt: Date;
}

/**
 * Soft caps. Deliberately generous — they exist to make the meter meaningful,
 * not to restrict anyone while enforcement is off.
 */
export const WINDOW_DEFINITIONS = [
  { id: "5h", label: "Last 5 hours", hours: 5, limit: 2_000_000 },
  { id: "24h", label: "Last 24 hours", hours: 24, limit: 8_000_000 },
  { id: "7d", label: "Last 7 days", hours: 24 * 7, limit: 40_000_000 },
] as const;

export interface TokenWindowsResult {
  windows: TokenWindow[];
  enforced: boolean;
  /** True when any window is over its cap — surfaced as a warning, not a block. */
  overLimit: boolean;
  lifetime: { tokens: number; costUsd: number };
}

export async function getTokenWindows(userId: string): Promise<TokenWindowsResult> {
  const enforced = serverEnv().USAGE_ENFORCEMENT;
  const now = Date.now();
  const longest = Math.max(...WINDOW_DEFINITIONS.map((w) => w.hours));
  const since = new Date(now - longest * 60 * 60 * 1000);

  // One scan over the longest window; the shorter windows are filtered from the
  // same rows rather than issuing a query each.
  const rows = await prisma.message.findMany({
    where: {
      createdAt: { gte: since },
      role: "ASSISTANT",
      project: { userId },
      OR: [{ promptTokens: { not: null } }, { completionTokens: { not: null } }],
    },
    select: {
      createdAt: true,
      promptTokens: true,
      completionTokens: true,
      costUsd: true,
    },
  });

  const windows = WINDOW_DEFINITIONS.map((definition) => {
    const cutoff = now - definition.hours * 60 * 60 * 1000;
    const inWindow = rows.filter((r) => r.createdAt.getTime() >= cutoff);

    let tokens = 0;
    let costUsd = 0;
    let oldest = now;

    for (const row of inWindow) {
      tokens += (row.promptTokens ?? 0) + (row.completionTokens ?? 0);
      costUsd += row.costUsd ?? 0;
      oldest = Math.min(oldest, row.createdAt.getTime());
    }

    return {
      id: definition.id,
      label: definition.label,
      hours: definition.hours,
      tokens,
      costUsd,
      runs: inWindow.length,
      limit: definition.limit,
      pct: Math.min(1, tokens / definition.limit),
      // A rolling window frees capacity as its oldest entry ages out, rather
      // than resetting all at once on a calendar boundary.
      resetsAt: new Date(
        inWindow.length ? oldest + definition.hours * 60 * 60 * 1000 : now,
      ),
    } satisfies TokenWindow;
  });

  const lifetimeAgg = await prisma.project.aggregate({
    where: { userId },
    _sum: {
      totalPromptTokens: true,
      totalCompletionTokens: true,
      totalCostUsd: true,
    },
  });

  return {
    windows,
    enforced,
    overLimit: windows.some((w) => w.tokens > w.limit),
    lifetime: {
      tokens:
        (lifetimeAgg._sum.totalPromptTokens ?? 0) +
        (lifetimeAgg._sum.totalCompletionTokens ?? 0),
      costUsd: lifetimeAgg._sum.totalCostUsd ?? 0,
    },
  };
}
