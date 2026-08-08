import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateSlug } from "random-word-slugs";

import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { consumeCredits } from "@/lib/usage";
import { getStorage } from "@/lib/storage";
import { getAppOrigin } from "@/lib/env";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";

async function requireProject(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId, userId },
  });
  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }
  return project;
}

/** Slugs are user-visible and permanent, so collisions must be resolved up front. */
async function allocateSlug(projectName: string): Promise<string> {
  const base =
    projectName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || generateSlug(2, { format: "kebab" });

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const taken = await prisma.project.findUnique({
      where: { shareSlug: candidate },
      select: { id: true },
    });
    if (!taken) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export const publishRouter = createTRPCRouter({
  getStatus: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const project = await requireProject(input.projectId, ctx.auth.userId!);

      const lastAttempt = await prisma.publishAttempt.findFirst({
        where: { projectId: input.projectId },
        orderBy: { createdAt: "desc" },
      });

      const shareUrl = project.shareSlug
        ? `${getAppOrigin()}/p/${project.shareSlug}`
        : null;

      return {
        status: project.publishStatus,
        isPublic: project.isPublic,
        shareSlug: project.shareSlug,
        shareUrl,
        publishedAt: project.publishedAt,
        viewCount: project.viewCount,
        // The published snapshot is frozen; this tells the UI to offer a
        // re-publish rather than silently serving stale code.
        isStale:
          project.publishStatus === "LIVE" &&
          project.publishedFilesVersion !== null &&
          project.publishedFilesVersion !== project.filesVersion,
        lastAttempt: lastAttempt
          ? {
              status: lastAttempt.status,
              log: lastAttempt.log,
              createdAt: lastAttempt.createdAt,
              fileCount: lastAttempt.fileCount,
              bytes: lastAttempt.bytes,
              durationMs: lastAttempt.durationMs,
            }
          : null,
      };
    }),

  publish: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const project = await requireProject(input.projectId, ctx.auth.userId!);

      if (project.publishStatus === "BUILDING") {
        return { status: "BUILDING" as const };
      }
      if (project.filesVersion === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Build something first — there's no code to publish yet.",
        });
      }

      await consumeCredits("PUBLISH");

      const shareSlug = project.shareSlug ?? (await allocateSlug(project.name));

      const attempt = await prisma.publishAttempt.create({
        data: { projectId: input.projectId, status: "BUILDING" },
      });

      await prisma.project.update({
        where: { id: input.projectId },
        data: { publishStatus: "BUILDING", shareSlug },
      });

      await inngest.send({
        name: "project/publish",
        data: { projectId: input.projectId, attemptId: attempt.id },
      });

      return { status: "BUILDING" as const, shareSlug };
    }),

  /** Take a site offline without deleting the build. */
  setVisibility: protectedProcedure
    .input(z.object({ projectId: z.string().min(1), isPublic: z.boolean() }))
    .mutation(async ({ input, ctx }) => {
      await requireProject(input.projectId, ctx.auth.userId!);
      return prisma.project.update({
        where: { id: input.projectId },
        data: { isPublic: input.isPublic },
      });
    }),

  unpublish: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const project = await requireProject(input.projectId, ctx.auth.userId!);

      if (project.publishBlobPrefix) {
        await (await getStorage()).deletePrefix(`${project.publishBlobPrefix}/`);
      }

      return prisma.project.update({
        where: { id: input.projectId },
        data: {
          publishStatus: "NONE",
          isPublic: false,
          publishedAt: null,
          publishedFilesVersion: null,
          publishBlobPrefix: null,
        },
      });
    }),

  /** Hand the failed build log to the fix-error agent. */
  fixBuild: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requireProject(input.projectId, ctx.auth.userId!);

      const attempt = await prisma.publishAttempt.findFirst({
        where: { projectId: input.projectId, status: "EXPORT_FAILED" },
        orderBy: { createdAt: "desc" },
      });
      if (!attempt?.log) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No failed build to fix" });
      }

      await consumeCredits("TARGETED_EDIT");

      const message = await prisma.message.create({
        data: {
          projectId: input.projectId,
          content: "Fix the errors that are blocking my site from publishing.",
          role: "USER",
          type: "RESULT",
          kind: "FIX_ERROR",
          metadata: { source: "build" },
        },
      });

      await inngest.send({
        name: "code-agent/fix-error",
        data: {
          projectId: input.projectId,
          messageId: message.id,
          errorText: attempt.log,
          source: "build",
        },
      });

      return message;
    }),
});
