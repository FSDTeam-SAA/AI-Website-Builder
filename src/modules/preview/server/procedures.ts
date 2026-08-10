import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { consumeCredits } from "@/lib/usage";
import { describeLocator } from "@/modules/preview/protocol";
import { locatorSchema } from "@/modules/preview/server/schema";
import { applyTextEdit } from "@/modules/preview/server/text-edit";
import { resolveLocator } from "@/modules/preview/server/resolve-locator";
import { getProjectFiles } from "@/lib/project-files";
import {
  CLAIM_STALE_MS,
  ensureSandbox,
  heartbeatSandbox,
  killProjectSandbox,
  peekSandboxSession,
} from "@/lib/sandbox/manager";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";

async function requireOwnedProject(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId, userId },
    select: { id: true, sandboxStatus: true, modelId: true, framework: true },
  });
  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }
  return project;
}

/**
 * Put a boot in the queue without pretending this HTTP request owns it.
 *
 * `sandboxClaimedAt = null` means QUEUED. The Inngest worker atomically turns
 * that into a timestamp when it actually starts booting. Keeping those states
 * distinct avoids the old deadlock where wake() pre-claimed the project and the
 * real worker then refused to touch it.
 */
async function queueSandboxEnsure(projectId: string) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - CLAIM_STALE_MS);
  const queued = await prisma.project.updateMany({
    where: {
      id: projectId,
      OR: [
        { sandboxStatus: { in: ["NONE", "EXPIRED", "FAILED"] } },
        { sandboxStatus: "RUNNING", sandboxExpiresAt: { lt: now } },
        { sandboxStatus: "RUNNING", sandboxExpiresAt: null },
        { sandboxStatus: "RUNNING", sandboxId: null },
        { sandboxStatus: "CREATING", sandboxClaimedAt: { lt: staleBefore } },
        {
          sandboxStatus: "CREATING",
          sandboxClaimedAt: null,
          updatedAt: { lt: staleBefore },
        },
      ],
    },
    data: {
      sandboxStatus: "CREATING",
      // Null is a queued claim; ensureSandbox assigns the active timestamp.
      sandboxClaimedAt: null,
      sandboxError: null,
    },
  });

  // Another request already queued or owns this boot.
  if (queued.count === 0) return peekSandboxSession(projectId);

  try {
    await inngest.send({ name: "sandbox/ensure", data: { projectId } });
  } catch (cause) {
    // Do not strand a queued row when the event broker is unavailable.
    await prisma.project.updateMany({
      where: { id: projectId, sandboxStatus: "CREATING", sandboxClaimedAt: null },
      data: {
        sandboxStatus: "FAILED",
        sandboxError: "Could not queue the preview startup. Try again.",
      },
    });
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not queue the preview startup. Try again.",
      cause,
    });
  }

  return { status: "CREATING" as const, phase: "QUEUED" as const };
}

/** Serialise a session for the wire (Date -> ISO happens via superjson). */
export const previewRouter = createTRPCRouter({
  /** Cheap status read. Polled by the client; never touches E2B. */
  getSession: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      // These are independent reads. Running them in parallel cuts the hot
      // 2-second poll from three remote-DB round trips to one round-trip window.
      const [project, session, running] = await Promise.all([
        requireOwnedProject(input.projectId, ctx.auth.userId!),
        peekSandboxSession(input.projectId),
        prisma.message.count({
          where: {
            projectId: input.projectId,
            status: { in: ["PENDING", "RUNNING"] },
          },
        }),
      ]);

      return { session, isGenerating: running > 0, framework: project.framework };
    }),

  /**
   * Repair/upgrade the platform runtime behind an otherwise-live preview.
   *
   * The client calls this once when the inspector handshake is missing. It is
   * intentionally separate from getSession so normal status polling stays a
   * cheap database read with no E2B round-trip.
   */
  prepareRuntime: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requireOwnedProject(input.projectId, ctx.auth.userId!);
      return ensureSandbox(input.projectId);
    }),

  /** Explicit user action: boot or revive the preview. */
  wake: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requireOwnedProject(input.projectId, ctx.auth.userId!);

      const session = await peekSandboxSession(input.projectId);
      if (session.status === "RUNNING" || session.status === "CREATING") {
        return { session };
      }

      return { session: await queueSandboxEnsure(input.projectId) };
    }),

  /** Keep the sandbox alive while the tab is visible. */
  heartbeat: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requireOwnedProject(input.projectId, ctx.auth.userId!);
      const session = await heartbeatSandbox(input.projectId);
      return { session };
    }),

  restart: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requireOwnedProject(input.projectId, ctx.auth.userId!);
      await killProjectSandbox(input.projectId);
      return { session: await queueSandboxEnsure(input.projectId) };
    }),

  /**
   * Resolve a clicked element to candidate source locations.
   *
   * Used to show the user where an element lives before they commit to an edit.
   */
  resolveElement: protectedProcedure
    .input(z.object({ projectId: z.string().min(1), locator: locatorSchema }))
    .query(async ({ input, ctx }) => {
      await requireOwnedProject(input.projectId, ctx.auth.userId!);
      const { files } = await getProjectFiles(input.projectId);
      return resolveLocator(input.locator, files);
    }),

  /**
   * Deterministic inline text edit — no model call.
   *
   * Returns `needsAi` rather than guessing when the target cannot be pinned
   * down exactly; the client then falls through to the AI path carrying the
   * same locator, so the user never has to re-describe what they clicked.
   */
  applyTextEdit: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        locator: locatorSchema,
        oldText: z.string().min(1),
        newText: z.string().max(5000),
        expectedVersion: z.number().int().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await requireOwnedProject(input.projectId, ctx.auth.userId!);
      await consumeCredits("TEXT_EDIT");
      return applyTextEdit(input);
    }),

  /** Targeted AI edit aimed at one selected element. */
  requestAiEdit: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        instruction: z.string().min(1).max(4000),
        locator: locatorSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await requireOwnedProject(input.projectId, ctx.auth.userId!);
      await consumeCredits("TARGETED_EDIT");

      const message = await prisma.message.create({
        data: {
          projectId: input.projectId,
          content: input.instruction,
          role: "USER",
          type: "RESULT",
          kind: "TARGETED_EDIT",
          metadata: {
            target: describeLocator(input.locator),
            locator: input.locator as unknown as object,
          },
        },
      });

      await inngest.send({
        name: "code-agent/surgical-edit",
        data: {
          projectId: input.projectId,
          messageId: message.id,
          instruction: input.instruction,
          locator: input.locator,
        },
      });

      return message;
    }),

  /** "Fix with AI" on a runtime console error or a failed build. */
  requestErrorFix: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        errorText: z.string().min(1).max(20000),
        source: z.enum(["console", "build"]).default("console"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await requireOwnedProject(input.projectId, ctx.auth.userId!);
      await consumeCredits("TARGETED_EDIT");

      const firstLine = input.errorText.split("\n")[0].slice(0, 160);
      const message = await prisma.message.create({
        data: {
          projectId: input.projectId,
          content: `Fix this ${input.source} error: ${firstLine}`,
          role: "USER",
          type: "RESULT",
          kind: "FIX_ERROR",
          metadata: { source: input.source, errorText: input.errorText.slice(0, 20000) },
        },
      });

      await inngest.send({
        name: "code-agent/fix-error",
        data: {
          projectId: input.projectId,
          messageId: message.id,
          errorText: input.errorText,
          source: input.source,
        },
      });

      return message;
    }),
});
