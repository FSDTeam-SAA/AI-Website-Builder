import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { generateSlug } from "random-word-slugs";

import { prisma } from "@/lib/db";
import { inngest } from "@/inngest/client";
import { consumeCredits } from "@/lib/usage";
import {
  FilesVersionConflictError,
  getProjectFiles,
  isProtectedPath,
  mergeProjectFiles,
  normalizeFilePath,
} from "@/lib/project-files";
import {
  createCheckpoint,
  listCheckpoints,
  maybeAutoCheckpoint,
  restoreCheckpoint,
} from "@/lib/checkpoints";
import { connectIfAlive, writeFilesToSandbox } from "@/lib/sandbox/manager";
import { protectedProcedure, createTRPCRouter } from "@/trpc/init";
import { listModels, isKnownModel } from "@/lib/ai/providers";
import { frameworkConfig } from "@/lib/framework";

/**
 * Push a file patch into the live sandbox so Fast Refresh repaints.
 *
 * A no-op when the sandbox is asleep — the next rehydrate replays the whole
 * tree from the database, so nothing is lost by skipping it.
 */
async function syncPatchToSandbox(
  projectId: string,
  patch: Record<string, string | null>,
): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { sandboxId: true, sandboxStatus: true },
  });
  if (!project?.sandboxId || project.sandboxStatus !== "RUNNING") return false;

  const sandbox = await connectIfAlive(project.sandboxId);
  if (!sandbox) return false;

  await writeFilesToSandbox(sandbox, patch);
  return true;
}

/** Reject writes to platform-managed paths with a message the user can act on. */
function assertWritablePath(path: string): string {
  const normalized = normalizeFilePath(path);
  if (!normalized) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "File path is required" });
  }
  if (isProtectedPath(normalized)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${normalized} is managed by the platform and can't be edited.`,
    });
  }
  return normalized;
}

/** Block manual edits while an agent run is writing to the same tree. */
async function assertNotGenerating(projectId: string) {
  const running = await prisma.message.count({
    where: { projectId, status: { in: ["PENDING", "RUNNING"] } },
  });
  if (running > 0) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Wait for the current generation to finish before editing files.",
    });
  }
}

/** Ownership check that returns the project or throws NOT_FOUND. */
async function requireProject(projectId: string, userId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId, userId },
  });
  if (!project) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
  }
  return project;
}

export const projectsRouter = createTRPCRouter({
  getOne: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1, { message: "Id is required" }),
      }),
    )
    .query(async ({ input, ctx }) => {
      return requireProject(input.id, ctx.auth.userId!);
    }),

  getMany: protectedProcedure.query(async ({ ctx }) => {
    return prisma.project.findMany({
      where: { userId: ctx.auth.userId! },
      orderBy: { updatedAt: "desc" },
    });
  }),

  create: protectedProcedure
    .input(
      z.object({
        value: z
          .string()
          .min(1, { message: "Value is required" })
          .max(10000, { message: "Value is too long" }),
        modelId: z.string().nullable().optional(),
        framework: z.enum(["NEXTJS", "STATIC_HTML"]).default("NEXTJS"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await consumeCredits("GENERATION");

      if (input.modelId && !isKnownModel(input.modelId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown model" });
      }

      const createdProject = await prisma.project.create({
        data: {
          userId: ctx.auth.userId!,
          name: generateSlug(2, { format: "kebab" }),
          framework: input.framework,
          // Seeded so a static project has something to serve before the
          // first build finishes, instead of a 404.
          files: frameworkConfig(input.framework).seedFiles ?? {},
          modelId: input.modelId ?? null,
          messages: {
            create: {
              content: input.value,
              role: "USER",
              type: "RESULT",
              kind: "CHAT",
            },
          },
        },
        include: { messages: { select: { id: true } } },
      });

      await inngest.send({
        name: "code-agent/run",
        data: {
          value: input.value,
          projectId: createdProject.id,
          messageId: createdProject.messages[0]?.id,
        },
      });

      return createdProject;
    }),

  /**
   * The canonical file tree. Fetched on demand by the Code tab and the ZIP
   * export rather than being carried on the 2-second chat poll.
   */
  getFiles: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      await requireProject(input.projectId, ctx.auth.userId!);
      const { files, filesVersion } = await getProjectFiles(input.projectId);
      return { files, filesVersion };
    }),

  /** A single file, for lazy loading large trees in the explorer. */
  getFile: protectedProcedure
    .input(z.object({ projectId: z.string().min(1), path: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      await requireProject(input.projectId, ctx.auth.userId!);
      const { files } = await getProjectFiles(input.projectId);
      const content = files[input.path];
      if (content === undefined) {
        throw new TRPCError({ code: "NOT_FOUND", message: "File not found" });
      }
      return { path: input.path, content };
    }),

  rename: protectedProcedure
    .input(z.object({ projectId: z.string().min(1), name: z.string().min(1).max(80) }))
    .mutation(async ({ input, ctx }) => {
      await requireProject(input.projectId, ctx.auth.userId!);
      return prisma.project.update({
        where: { id: input.projectId },
        data: { name: input.name.trim() },
      });
    }),

  delete: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requireProject(input.projectId, ctx.auth.userId!);
      await prisma.project.delete({ where: { id: input.projectId } });
      return { ok: true };
    }),

  /**
   * The model catalog, independent of any project.
   *
   * Used by the home composer, where a model is chosen before a project exists.
   */
  getModelCatalog: protectedProcedure.query(async () => {
    return {
      models: listModels().map((m) => ({
        id: m.id,
        label: m.label,
        provider: m.provider,
        tier: m.tier,
        description: m.description,
        available: m.available,
        contextWindow: m.contextWindow,
        pricePerMTok: m.pricePerMTok,
        usableForCode: m.roles.includes("code"),
      })),
    };
  }),

  /** Model catalog + the project's current selection. */
  getModels: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const project = await requireProject(input.projectId, ctx.auth.userId!);
      return { models: listModels(), selected: project.modelId };
    }),

  setModel: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        modelId: z.string().nullable(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await requireProject(input.projectId, ctx.auth.userId!);
      if (input.modelId && !isKnownModel(input.modelId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Unknown model" });
      }
      return prisma.project.update({
        where: { id: input.projectId },
        data: { modelId: input.modelId },
      });
    }),

  // -------------------------------------------------------------------------
  // History
  // -------------------------------------------------------------------------

  listCheckpoints: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      await requireProject(input.projectId, ctx.auth.userId!);
      return listCheckpoints(input.projectId);
    }),

  createCheckpoint: protectedProcedure
    .input(z.object({ projectId: z.string().min(1), label: z.string().max(200).optional() }))
    .mutation(async ({ input, ctx }) => {
      await requireProject(input.projectId, ctx.auth.userId!);
      const checkpoint = await createCheckpoint(input.projectId, {
        kind: "MANUAL",
        label: input.label?.trim() || "Manual save",
      });
      if (!checkpoint) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "There's nothing to save yet.",
        });
      }
      return checkpoint;
    }),

  restoreCheckpoint: protectedProcedure
    .input(z.object({ projectId: z.string().min(1), checkpointId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      await requireProject(input.projectId, ctx.auth.userId!);
      await assertNotGenerating(input.projectId);

      const result = await restoreCheckpoint(input.projectId, input.checkpointId);

      // Recorded in the conversation so the history stays honest about what
      // happened to the code.
      await prisma.message.create({
        data: {
          projectId: input.projectId,
          content: `Restored an earlier version — ${result.updated} file(s) changed, ${result.deleted} removed.`,
          role: "ASSISTANT",
          type: "RESULT",
          status: "COMPLETE",
        },
      });

      return result;
    }),

  // -------------------------------------------------------------------------
  // Portability
  // -------------------------------------------------------------------------

  duplicate: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const source = await requireProject(input.projectId, ctx.auth.userId!);

      const messages = await prisma.message.findMany({
        where: { projectId: source.id },
        orderBy: { createdAt: "asc" },
        select: { content: true, role: true, type: true, kind: true, createdAt: true },
      });

      // Files and conversation carry over; every sandbox, publish and share
      // field is reset so the copy is genuinely independent of the original.
      return prisma.project.create({
        data: {
          userId: ctx.auth.userId!,
          name: `${source.name}-copy`.slice(0, 80),
          files: source.files ?? {},
          filesVersion: source.filesVersion,
          depsHash: source.depsHash,
          modelId: source.modelId,
          messages: {
            create: messages.map((m) => ({
              content: m.content,
              role: m.role,
              type: m.type,
              kind: m.kind,
              status: "COMPLETE" as const,
              createdAt: m.createdAt,
            })),
          },
        },
      });
    }),

  // -------------------------------------------------------------------------
  // Manual file editing
  // -------------------------------------------------------------------------

  writeFile: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        path: z.string().min(1).max(400),
        content: z.string().max(500_000),
        expectedVersion: z.number().int().optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await requireProject(input.projectId, ctx.auth.userId!);
      await assertNotGenerating(input.projectId);
      const path = assertWritablePath(input.path);

      // Throttled, so a burst of saves doesn't flood the timeline — but the
      // pre-edit state is always recoverable.
      await maybeAutoCheckpoint(input.projectId, "Before manual edits").catch(() => null);

      try {
        const merged = await mergeProjectFiles(
          input.projectId,
          { [path]: input.content },
          { expectedVersion: input.expectedVersion },
        );
        const synced = await syncPatchToSandbox(input.projectId, { [path]: input.content });

        await prisma.edit.create({
          data: {
            projectId: input.projectId,
            kind: "MANUAL",
            filePath: path,
            newString: input.content.slice(0, 10000),
            fromVersion: merged.filesVersion - 1,
            toVersion: merged.filesVersion,
          },
        });

        return { path, filesVersion: merged.filesVersion, syncedToSandbox: synced };
      } catch (e) {
        if (e instanceof FilesVersionConflictError) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This file changed elsewhere. Reload before saving again.",
          });
        }
        throw e;
      }
    }),

  createFile: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        path: z.string().min(1).max(400),
        content: z.string().max(500_000).default(""),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await requireProject(input.projectId, ctx.auth.userId!);
      await assertNotGenerating(input.projectId);
      const path = assertWritablePath(input.path);

      const { files } = await getProjectFiles(input.projectId);
      if (path in files) {
        throw new TRPCError({ code: "CONFLICT", message: `${path} already exists.` });
      }

      const merged = await mergeProjectFiles(input.projectId, { [path]: input.content });
      await syncPatchToSandbox(input.projectId, { [path]: input.content });
      return { path, filesVersion: merged.filesVersion };
    }),

  renameFile: protectedProcedure
    .input(
      z.object({
        projectId: z.string().min(1),
        from: z.string().min(1).max(400),
        to: z.string().min(1).max(400),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      await requireProject(input.projectId, ctx.auth.userId!);
      await assertNotGenerating(input.projectId);
      const from = assertWritablePath(input.from);
      const to = assertWritablePath(input.to);
      if (from === to) return { from, to, filesVersion: 0, unchanged: true };

      const { files } = await getProjectFiles(input.projectId);
      const content = files[from];
      if (content === undefined) {
        throw new TRPCError({ code: "NOT_FOUND", message: `${from} does not exist.` });
      }
      if (to in files) {
        throw new TRPCError({ code: "CONFLICT", message: `${to} already exists.` });
      }

      await maybeAutoCheckpoint(input.projectId, "Before renaming files").catch(() => null);

      const patch: Record<string, string | null> = { [from]: null, [to]: content };
      const merged = await mergeProjectFiles(input.projectId, patch);
      await syncPatchToSandbox(input.projectId, patch);

      return { from, to, filesVersion: merged.filesVersion, unchanged: false };
    }),

  deleteFile: protectedProcedure
    .input(z.object({ projectId: z.string().min(1), path: z.string().min(1).max(400) }))
    .mutation(async ({ input, ctx }) => {
      await requireProject(input.projectId, ctx.auth.userId!);
      await assertNotGenerating(input.projectId);
      const path = assertWritablePath(input.path);

      const { files } = await getProjectFiles(input.projectId);
      if (!(path in files)) {
        throw new TRPCError({ code: "NOT_FOUND", message: `${path} does not exist.` });
      }

      // Deletion is the one manual action with no undo inside the editor, so it
      // always snapshots regardless of the throttle.
      await createCheckpoint(input.projectId, {
        kind: "AUTO",
        label: `Before deleting ${path}`,
      }).catch(() => null);

      const patch: Record<string, string | null> = { [path]: null };
      const merged = await mergeProjectFiles(input.projectId, patch);
      await syncPatchToSandbox(input.projectId, patch);

      return { path, filesVersion: merged.filesVersion };
    }),
});
