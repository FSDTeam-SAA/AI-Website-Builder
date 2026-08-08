import { createAgent, createNetwork, createState } from "@inngest/agent-kit";
import type { Sandbox } from "@e2b/code-interpreter";

import { getModel, resolveModelSpec } from "@/lib/ai/providers";
import { UsageAccumulator } from "@/lib/ai/usage-meter";
import { checkAppHealth } from "@/lib/sandbox/health";
import { buildCodeMap, renderCodeMap } from "@/lib/code-map";
import { FIX_ERROR_PROMPT } from "@/prompts";

import { surgicalAgentTools, type ToolContext } from "./tools";
import { extractTaskSummary, lastAssistantTextMessageContent } from "./utils";

/**
 * Verify the app works, and repair it if it does not.
 *
 * Nothing used to check. A run could report success while the app failed to
 * compile, and the user found out by looking at a blank preview and having to
 * describe the breakage back to the agent themselves.
 *
 * Repairs are capped: a model that cannot fix its own output in two attempts is
 * unlikely to fix it in five, and each attempt costs real tokens.
 */

export interface RepairOutcome {
  healthy: boolean;
  attempts: number;
  /** Remaining errors when we gave up. */
  errors: string[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    detail: Record<string, unknown>;
  };
}

const MAX_ATTEMPTS = 2;

export async function verifyAndRepair(
  ctx: ToolContext,
  sandbox: Sandbox,
  previewUrl: string,
  opts: { modelOverride?: string | null } = {},
): Promise<RepairOutcome> {
  const usage = new UsageAccumulator();
  const spec = resolveModelSpec("edit", opts.modelOverride);

  await ctx.emit("STATUS", "Testing the app");
  let report = await checkAppHealth(sandbox, previewUrl);

  if (report.ok) {
    await ctx.emit("TOOL_RESULT", "App compiles and renders");
    return {
      healthy: true,
      attempts: 0,
      errors: [],
      usage: { ...usage.totals(), detail: usage.detail() },
    };
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS && !report.ok; attempt++) {
    await ctx.emit(
      "ERROR",
      `Found ${report.summary} — fixing (attempt ${attempt}/${MAX_ATTEMPTS})`,
      { errors: report.errors.slice(0, 3) },
    );

    const agent = createAgent<{ summary: string }>({
      name: "repair-agent",
      description: "Fixes compile and runtime errors",
      system: FIX_ERROR_PROMPT,
      model: getModel("edit", { override: opts.modelOverride }),
      tools: surgicalAgentTools(ctx),
      lifecycle: {
        onResponse: async ({ result, network }) => {
          usage.recordRaw("Auto-repair", spec, result.raw);
          const summary = extractTaskSummary(lastAssistantTextMessageContent(result));
          if (summary && network) network.state.data.summary = summary;
          return result;
        },
      },
    });

    const network = createNetwork<{ summary: string }>({
      name: "repair-network",
      agents: [agent],
      maxIter: 6,
      defaultState: createState<{ summary: string }>({ summary: "" }),
      router: ({ network }) => (network.state.data.summary ? undefined : agent),
    });

    await network.run(
      `The app you just changed does not work. Fix it.\n\n` +
        `<code_map>\n${renderCodeMap(buildCodeMap(ctx.files))}\n</code_map>\n\n` +
        `<error_output>\n${report.errors.join("\n\n").slice(0, 12000)}\n</error_output>`,
    );

    await ctx.emit("STATUS", "Re-testing");
    report = await checkAppHealth(sandbox, previewUrl);
  }

  if (report.ok) {
    await ctx.emit("TOOL_RESULT", "Fixed — app compiles and renders");
  } else {
    // Reported rather than hidden: an honest "I couldn't fix this" beats a
    // success message over a broken preview.
    await ctx.emit("ERROR", `Could not fix automatically: ${report.summary}`);
  }

  return {
    healthy: report.ok,
    attempts: MAX_ATTEMPTS,
    errors: report.errors,
    usage: { ...usage.totals(), detail: usage.detail() },
  };
}
