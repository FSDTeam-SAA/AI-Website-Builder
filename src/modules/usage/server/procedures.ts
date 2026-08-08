import { z } from "zod";
import { TRPCError } from "@trpc/server";

import { prisma } from "@/lib/db";
import { getUsageStatus } from "@/lib/usage";
import { getTokenWindows } from "@/lib/ai/token-windows";
import { getModelSpec } from "@/lib/ai/providers";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";

export const usageRouter = createTRPCRouter({
  status: protectedProcedure.query(async () => {
    try {
      return await getUsageStatus();
    } catch {
      return null;
    }
  }),

  /** Rolling 5h / 24h / 7d token windows across all of the user's projects. */
  tokenWindows: protectedProcedure.query(async ({ ctx }) => {
    return getTokenWindows(ctx.auth.userId!);
  }),

  /**
   * Token burn for one project, plus how full the model's context window was on
   * the most recent run.
   */
  projectTokens: protectedProcedure
    .input(z.object({ projectId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const project = await prisma.project.findUnique({
        where: { id: input.projectId, userId: ctx.auth.userId! },
        select: {
          totalPromptTokens: true,
          totalCompletionTokens: true,
          totalCostUsd: true,
          modelId: true,
        },
      });
      if (!project) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
      }

      const recent = await prisma.message.findMany({
        where: {
          projectId: input.projectId,
          role: "ASSISTANT",
          promptTokens: { not: null },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          createdAt: true,
          promptTokens: true,
          completionTokens: true,
          costUsd: true,
          usageModelId: true,
          usageDetail: true,
        },
      });

      const last = recent[0];
      const spec = getModelSpec(last?.usageModelId ?? project.modelId);

      // The peak single prompt is what would overflow the window — not the sum
      // of every call in the run.
      const detail = (last?.usageDetail ?? {}) as { peakPromptTokens?: number };
      const peak = detail.peakPromptTokens ?? last?.promptTokens ?? 0;

      return {
        total: {
          promptTokens: project.totalPromptTokens,
          completionTokens: project.totalCompletionTokens,
          tokens: project.totalPromptTokens + project.totalCompletionTokens,
          costUsd: project.totalCostUsd,
        },
        context: spec
          ? {
              used: peak,
              window: spec.contextWindow,
              pct: Math.min(1, peak / spec.contextWindow),
              modelLabel: spec.label,
            }
          : null,
        recent,
      };
    }),
});
