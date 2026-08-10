import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";
import { consumeCredits } from "@/lib/usage";
import type { CheckpointKind } from "@/generated/prisma";

/**
 * Fragment fields safe to ship on the chat poll.
 *
 * `files` is deliberately excluded: this query is polled continuously while a
 * generation runs, and including the file map re-sent every generated source
 * file on every tick. The Code tab reads the canonical tree via
 * `projects.getFiles` instead.
 */
const fragmentSummarySelect = {
  id: true,
  title: true,
  sandboxUrl: true,
  filesVersion: true,
  createdAt: true,
} as const;

/** A checkpoint without its `snapshot` — the bytes never belong on a poll. */
interface TurnCheckpoint {
  id: string;
  kind: CheckpointKind;
  label: string;
  messageId: string | null;
  filesVersion: number;
  fileCount: number;
  createdAt: Date;
}

export const messagesRouter = createTRPCRouter({
  getMany: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1, { message: "Project ID is required" }),
      }),
    )
    .query(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId! },
        select: { id: true, filesVersion: true },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const [messages, checkpoints, stepCounts] = await Promise.all([
        prisma.message.findMany({
          where: { projectId: project.id },
          include: {
            fragment: { select: fragmentSummarySelect },
            // Metadata only — the bytes are served separately so the chat poll
            // never carries image payloads.
            attachments: {
              select: { id: true, name: true, width: true, height: true },
            },
          },
          // createdAt, not updatedAt: a message whose status flips to COMPLETE
          // must not jump to the bottom of the conversation.
          orderBy: { createdAt: "asc" },
        }),
        prisma.checkpoint.findMany({
          where: { projectId: project.id, messageId: { not: null } },
          select: {
            id: true,
            kind: true,
            label: true,
            messageId: true,
            filesVersion: true,
            fileCount: true,
            createdAt: true,
          },
          orderBy: { createdAt: "asc" },
        }) as Promise<TurnCheckpoint[]>,
        // Counts only. The labels — and especially the file contents on a
        // FILE_WRITE — are fetched per turn, on expand, so the chat poll stays
        // small however long the build was.
        prisma.agentEvent.groupBy({
          by: ["messageId"],
          where: { projectId: project.id, messageId: { not: null } },
          _count: { _all: true },
        }),
      ]);

      const stepsByRun = new Map<string, number>();
      for (const row of stepCounts) {
        if (row.messageId) stepsByRun.set(row.messageId, row._count._all);
      }

      const byMessageId = new Map<string, TurnCheckpoint>();
      for (const checkpoint of checkpoints) {
        if (checkpoint.messageId) byMessageId.set(checkpoint.messageId, checkpoint);
      }

      /**
       * Number the turns and hand each one the snapshot it produced, so the chat
       * can revert without the user hunting through the History dialog.
       *
       * Versions count *turns*, not checkpoints: rolling history is pruned, and
       * numbering off the surviving snapshots would silently renumber every
       * earlier version the moment an old one aged out.
       */
      let version = 0;
      // Snapshots used to be linked to the prompt that triggered the run. Carry
      // those forward to the reply so projects built before that change keep
      // their revert buttons.
      let carried: TurnCheckpoint | null = null;
      // Activity is logged against the prompt that started the run, but the
      // chat hangs the step list off the reply.
      let currentRunId: string | null = null;

      return messages.map((message) => {
        const direct = byMessageId.get(message.id) ?? null;

        if (message.role === "USER") {
          if (direct) carried = direct;
          currentRunId = message.id;
          return {
            ...message,
            version: null,
            checkpoint: null,
            isCurrentVersion: false,
            runMessageId: null,
            activitySteps: 0,
          };
        }

        const runMessageId = currentRunId;
        const activitySteps = runMessageId ? (stepsByRun.get(runMessageId) ?? 0) : 0;
        // One run, one reply. Notes written outside a run — the record a restore
        // leaves behind — must not claim the previous run's steps as their own.
        currentRunId = null;

        // An errored turn changed nothing worth returning to, and the note the
        // restore itself writes has no fragment.
        if (message.type !== "RESULT" || !message.fragment) {
          return {
            ...message,
            version: null,
            checkpoint: null,
            isCurrentVersion: false,
            runMessageId,
            activitySteps,
          };
        }

        const checkpoint = direct ?? carried;
        carried = null;
        version += 1;

        return {
          ...message,
          version,
          checkpoint: checkpoint
            ? {
                id: checkpoint.id,
                label: checkpoint.label,
                kind: checkpoint.kind,
                fileCount: checkpoint.fileCount,
                createdAt: checkpoint.createdAt,
              }
            : null,
          // A restore bumps `filesVersion` past every snapshot, so after one
          // nothing claims to be current — which is the honest answer.
          isCurrentVersion: !!checkpoint && checkpoint.filesVersion === project.filesVersion,
          runMessageId,
          activitySteps,
        };
      });
    }),

  /**
   * The steps of one finished run, fetched when the user expands it.
   *
   * Deliberately not part of `getMany`: a FILE_WRITE event carries the file it
   * wrote, so folding a whole project's activity into the chat poll would
   * re-send every generated source file on every tick — the exact mistake the
   * fragment payload made.
   */
  getActivity: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        messageId: z.string().min(1),
      }),
    )
    .query(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId! },
        select: { id: true },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const events = await prisma.agentEvent.findMany({
        where: { projectId: project.id, messageId: input.messageId },
        orderBy: { seq: "asc" },
        take: 500,
        select: {
          seq: true,
          type: true,
          label: true,
          detail: true,
          messageId: true,
          createdAt: true,
        },
      });

      return events.map((event) => ({
        seq: event.seq,
        type: event.type,
        label: event.label,
        detail: event.detail,
        messageId: event.messageId,
        at: event.createdAt.toISOString(),
      }));
    }),

  create: protectedProcedure
    .input(
      z.object({
        value: z
          .string()
          .min(1, { message: "Value is required" })
          .max(10000, { message: "Value is too long" }),
        projectId: z.string().min(1, { message: "Project ID is required" }),
        attachmentIds: z.array(z.string().min(1)).max(8).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const existingProject = await prisma.project.findUnique({
        where: {
          id: input.projectId,
          userId: ctx.auth.userId,
        },
        select: { id: true },
      });

      if (!existingProject) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      await consumeCredits("GENERATION");

      const createdMessage = await prisma.message.create({
        data: {
          projectId: existingProject.id,
          content: input.value,
          role: "USER",
          type: "RESULT",
          kind: "CHAT",
        },
      });

      // Claim the pending uploads for this message. Scoped to unsent
      // attachments of this project so an id from elsewhere cannot be attached.
      let attachmentIds: string[] = [];
      if (input.attachmentIds?.length) {
        await prisma.attachment.updateMany({
          where: {
            id: { in: input.attachmentIds },
            projectId: existingProject.id,
            messageId: null,
          },
          data: { messageId: createdMessage.id },
        });
        const claimed = await prisma.attachment.findMany({
          where: { messageId: createdMessage.id },
          select: { id: true },
        });
        attachmentIds = claimed.map((a) => a.id);
      }

      await inngest.send({
        name: "code-agent/run",
        data: {
          value: input.value,
          projectId: input.projectId,
          messageId: createdMessage.id,
          attachmentIds,
        },
      });

      return createdMessage;
    }),

  /**
   * Cancel the run a project is currently executing.
   *
   * Inngest cancellation is event-driven: the code agent declares a
   * `cancelOn` matcher for this event keyed by projectId.
   */
  cancel: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId },
        select: { id: true },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      await inngest.send({
        name: "code-agent/cancel",
        data: { projectId: input.projectId },
      });

      await prisma.message.updateMany({
        where: {
          projectId: input.projectId,
          status: { in: ["PENDING", "RUNNING"] },
        },
        data: { status: "CANCELLED" },
      });

      return { ok: true };
    }),
});
