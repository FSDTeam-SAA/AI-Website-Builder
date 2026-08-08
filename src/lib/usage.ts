import { auth } from "@clerk/nextjs/server";
import { RateLimiterPrisma } from "rate-limiter-flexible";
import { TRPCError } from "@trpc/server";

import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";

/**
 * Credit accounting.
 *
 * The full limiter is wired and always records consumption, but enforcement is
 * gated behind USAGE_ENFORCEMENT (default false) so limits can be exercised and
 * observed before they start rejecting anyone. Flipping the env var to "true"
 * is the only change needed to enforce.
 *
 * Note the plan check runs on the SERVER. Prior to this, `has({ plan: "pro" })`
 * was only ever called from client components, which meant the Pro plan gated
 * nothing at all.
 */

export const FREE_POINTS = 10;
export const PRO_POINTS = 500;
export const DURATION_SECONDS = 30 * 24 * 60 * 60; // 30 days

export type UsageOperation =
  | "GENERATION"
  | "TARGETED_EDIT"
  | "TEXT_EDIT"
  | "PUBLISH";

/** Deterministic edits are free — they cost us no model tokens. */
export const OPERATION_COST: Record<UsageOperation, number> = {
  GENERATION: 1,
  TARGETED_EDIT: 1,
  TEXT_EDIT: 0,
  PUBLISH: 2,
};

export interface UsageStatus {
  consumedPoints: number;
  remainingPoints: number;
  msBeforeNext: number;
  points: number;
  unlimited: boolean;
  enforced: boolean;
  pro: boolean;
}

async function hasProAccess(): Promise<boolean> {
  const { has } = await auth();
  try {
    return has?.({ plan: "pro" }) ?? false;
  } catch {
    return false;
  }
}

function getUsageTracker(points: number) {
  return new RateLimiterPrisma({
    storeClient: prisma,
    tableName: "Usage",
    points,
    duration: DURATION_SECONDS,
  });
}

async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Not authenticated" });
  }
  return userId;
}

export async function getUsageStatus(): Promise<UsageStatus> {
  const userId = await requireUserId();
  const enforced = serverEnv().USAGE_ENFORCEMENT;
  const pro = await hasProAccess();
  const points = pro ? PRO_POINTS : FREE_POINTS;

  const result = await getUsageTracker(points).get(userId);
  const consumedPoints = result ? points - result.remainingPoints : 0;

  return {
    consumedPoints,
    remainingPoints: result?.remainingPoints ?? points,
    msBeforeNext: result?.msBeforeNext ?? 0,
    points,
    // While enforcement is off the UI shows real consumption but never a wall.
    unlimited: !enforced,
    enforced,
    pro,
  };
}

/**
 * Record consumption for an operation.
 *
 * Throws TOO_MANY_REQUESTS only when enforcement is enabled; otherwise the
 * overage is recorded and the caller proceeds.
 */
export async function consumeCredits(
  operation: UsageOperation,
): Promise<UsageStatus> {
  const userId = await requireUserId();
  const enforced = serverEnv().USAGE_ENFORCEMENT;
  const cost = OPERATION_COST[operation];

  if (cost === 0) return getUsageStatus();

  const pro = await hasProAccess();
  const points = pro ? PRO_POINTS : FREE_POINTS;

  try {
    const result = await getUsageTracker(points).consume(userId, cost);
    return {
      consumedPoints: points - result.remainingPoints,
      remainingPoints: result.remainingPoints,
      msBeforeNext: result.msBeforeNext,
      points,
      unlimited: !enforced,
      enforced,
      pro,
    };
  } catch (error) {
    // rate-limiter-flexible rejects with a RateLimiterRes (not an Error) when
    // the budget is exhausted; anything else is a real failure.
    const isBudgetExhausted =
      typeof error === "object" &&
      error !== null &&
      "msBeforeNext" in error &&
      !(error instanceof Error);

    if (!isBudgetExhausted) throw error;

    if (enforced) {
      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: "You have run out of credits.",
      });
    }

    const res = error as { msBeforeNext: number; consumedPoints?: number };
    return {
      consumedPoints: res.consumedPoints ?? points,
      remainingPoints: 0,
      msBeforeNext: res.msBeforeNext,
      points,
      unlimited: true,
      enforced,
      pro,
    };
  }
}
