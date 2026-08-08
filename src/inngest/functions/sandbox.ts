import { Sandbox } from "@e2b/code-interpreter";

import { prisma } from "@/lib/db";
import { ensureSandbox } from "@/lib/sandbox/manager";
import { pruneCheckpoints } from "@/lib/checkpoints";

import { inngest } from "../client";

/**
 * Boot or revive a project's sandbox.
 *
 * This lives in Inngest rather than in a tRPC mutation because a cold boot —
 * create, npm install, replay the file tree, restart the dev server, wait for a
 * healthy response — routinely takes 60-120s, which is well beyond any
 * serverless HTTP budget. The client fires this and polls `preview.getSession`.
 */
export const ensureSandboxFunction = inngest.createFunction(
  {
    id: "sandbox-ensure",
    // One boot at a time per project. Without this, opening two tabs races two
    // sandbox creations, leaking one and stranding the other's rehydration.
    concurrency: { key: "event.data.projectId", limit: 1 },
    retries: 1,
  },
  { event: "sandbox/ensure" },
  async ({ event, step }) => {
    const { projectId } = event.data;

    const session = await step.run("ensure-sandbox", async () => {
      const result = await ensureSandbox(projectId);
      return {
        ...result,
        expiresAt:
          "expiresAt" in result ? result.expiresAt.toISOString() : undefined,
      };
    });

    return session;
  },
);

/**
 * Reap expired sandboxes.
 *
 * E2B kills the container on its own timeout, but the database keeps claiming
 * RUNNING with a URL that no longer resolves — which is precisely the state
 * that used to render a dead iframe with a green light. This reconciles the two
 * and releases stuck CREATING claims from workers that died mid-boot.
 */
export const sandboxReaperFunction = inngest.createFunction(
  { id: "sandbox-reaper", retries: 0 },
  { cron: "*/5 * * * *" },
  async ({ step }) => {
    const expired = await step.run("expire-timed-out", async () => {
      const result = await prisma.project.updateMany({
        where: {
          sandboxStatus: "RUNNING",
          sandboxExpiresAt: { lt: new Date() },
        },
        data: {
          sandboxStatus: "EXPIRED",
          sandboxId: null,
          sandboxUrl: null,
          sandboxExpiresAt: null,
        },
      });
      return result.count;
    });

    const unstuck = await step.run("release-stale-claims", async () => {
      const staleBefore = new Date(Date.now() - 10 * 60 * 1000);
      const result = await prisma.project.updateMany({
        where: {
          sandboxStatus: "CREATING",
          sandboxClaimedAt: { lt: staleBefore },
        },
        data: {
          sandboxStatus: "FAILED",
          sandboxClaimedAt: null,
          sandboxError: "Preview boot timed out. Try waking it again.",
        },
      });
      return result.count;
    });

    // Checkpoints are written on every turn, so history has to be trimmed
    // somewhere or it grows without bound.
    const pruned = await step.run("prune-checkpoints", async () => {
      const projects = await prisma.project.findMany({
        where: { checkpoints: { some: {} } },
        select: { id: true },
        orderBy: { lastActiveAt: "desc" },
        take: 200,
      });

      let total = 0;
      for (const project of projects) {
        total += await pruneCheckpoints(project.id).catch(() => 0);
      }
      return total;
    });

    return { expired, unstuck, pruned };
  },
);

/**
 * Free sandboxes belonging to projects nobody has looked at recently.
 *
 * Sandbox time is billed; an abandoned tab should not hold one open through
 * heartbeat renewals indefinitely.
 */
export const sandboxIdleSweepFunction = inngest.createFunction(
  { id: "sandbox-idle-sweep", retries: 0 },
  { cron: "17 * * * *" },
  async ({ step }) => {
    const candidates = await step.run("find-idle", async () => {
      const idleBefore = new Date(Date.now() - 60 * 60 * 1000);
      return prisma.project.findMany({
        where: {
          sandboxStatus: "RUNNING",
          lastActiveAt: { lt: idleBefore },
          sandboxId: { not: null },
        },
        select: { id: true, sandboxId: true },
        take: 50,
      });
    });

    for (const project of candidates) {
      await step.run(`kill-${project.id}`, async () => {
        if (project.sandboxId) {
          await Sandbox.kill(project.sandboxId).catch(() => {});
        }
        await prisma.project.update({
          where: { id: project.id },
          data: {
            sandboxStatus: "EXPIRED",
            sandboxId: null,
            sandboxUrl: null,
            sandboxExpiresAt: null,
          },
        });
        return true;
      });
    }

    return { killed: candidates.length };
  },
);
