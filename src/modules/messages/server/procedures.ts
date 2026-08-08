import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";
import { consumeCredits } from "@/lib/usage";

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

export const messagesRouter = createTRPCRouter({
  getMany: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1, { message: "Project ID is required" }),
      }),
    )
    .query(async ({ input, ctx }) => {
      const messages = await prisma.message.findMany({
        where: {
          projectId: input.projectId,
          project: {
            userId: ctx.auth.userId,
          },
        },
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
      });

      return messages;
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
