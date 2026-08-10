import { createAgent, createNetwork, createState } from "@inngest/agent-kit";

import { prisma } from "@/lib/db";
import { getModel, resolveModelSpec } from "@/lib/ai/providers";
import { UsageAccumulator } from "@/lib/ai/usage-meter";
import { createCheckpoint } from "@/lib/checkpoints";
import { reconcileSandboxFiles } from "@/lib/sandbox/reconcile";
import { getProjectFiles } from "@/lib/project-files";
import { frameworkConfig } from "@/lib/framework";
import { connectIfAlive, ensureSandbox } from "@/lib/sandbox/manager";
import { resolveLocator } from "@/modules/preview/server/resolve-locator";
import type { VibeElementLocator } from "@/modules/preview/protocol";
import {
  FIX_ERROR_PROMPT,
  RESPONSE_PROMPT,
  STATIC_SURGICAL_EDIT_PROMPT,
  SURGICAL_EDIT_PROMPT,
} from "@/prompts";

import { inngest } from "../client";
import { withoutStepTools } from "../als";
import {
  createAgentEventEmitter,
  surgicalAgentTools,
  syncManifests,
  type ToolContext,
} from "../tools";
import {
  lastAssistantTextMessageContent,
  parseAgentOutput,
  resolveCompletion,
} from "../utils";

interface AgentState {
  summary: string;
}

/** Escape text destined for an XML-ish prompt block. */
function xml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Build the `<selected_element>` context block.
 *
 * Resolving the source server-side and embedding the excerpt typically saves
 * two or three tool round-trips and markedly improves first-try accuracy — the
 * model starts already looking at the right lines.
 */
function buildSelectionContext(
  locator: VibeElementLocator,
  files: Record<string, string>,
): string {
  const resolved = resolveLocator(locator, files);
  const parts: string[] = ["<selected_element>"];

  if (resolved.exact) {
    parts.push(
      `  <source_hint>${xml(resolved.exact.path)}:${resolved.exact.line}:${resolved.exact.column}</source_hint>`,
    );
  }
  parts.push(`  <route>${xml(locator.route)}</route>`);
  parts.push(`  <tag>${xml(locator.tag)}</tag>`);
  if (locator.componentChain.length) {
    parts.push(`  <component_chain>${xml(locator.componentChain.join(" > "))}</component_chain>`);
  }
  if (locator.text) parts.push(`  <text>${xml(locator.text)}</text>`);
  if (locator.className) parts.push(`  <class_list>${xml(locator.className)}</class_list>`);
  if (Object.keys(locator.attributes).length) {
    parts.push(`  <attributes>${xml(JSON.stringify(locator.attributes))}</attributes>`);
  }
  parts.push(`  <dom_path>${xml(locator.domPath)}</dom_path>`);
  parts.push(`  <outer_html><![CDATA[${locator.outerHTML.replace(/]]>/g, "]]&gt;")}]]></outer_html>`);

  const best = resolved.best;
  if (best) {
    parts.push(
      `  <resolved_source path="${xml(best.path)}"${best.line ? ` line="${best.line}"` : ""}>` +
        `<![CDATA[\n${best.snippet.replace(/]]>/g, "]]&gt;")}\n]]></resolved_source>`,
    );
  }
  if (resolved.candidates.length > 1) {
    parts.push(
      `  <other_candidate_files>${xml(
        resolved.candidates.slice(1).map((c) => c.path).join(", "),
      )}</other_candidate_files>`,
    );
  }

  parts.push("</selected_element>");
  return parts.join("\n");
}

/** Shared driver for both surgical modes. */
async function runSurgicalAgent(opts: {
  projectId: string;
  messageId: string;
  systemPrompt?: string;
  userPrompt: string;
  emitLabel: string;
}) {
  const { projectId, messageId } = opts;
  const emit = createAgentEventEmitter(projectId, messageId);

  await emit("STATUS", opts.emitLabel);

  const session = await ensureSandbox(projectId);
  if (session.status !== "RUNNING") {
    throw new Error(
      session.status === "FAILED"
        ? `Could not start the preview: ${session.error}`
        : `Preview is ${session.status.toLowerCase()}`,
    );
  }

  const sandbox = await connectIfAlive(session.sandboxId);
  if (!sandbox) throw new Error("Lost connection to the preview sandbox");

  const { files } = await getProjectFiles(projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { modelId: true, framework: true },
  });

  const fw = frameworkConfig(project?.framework);

  const ctx: ToolContext = {
    projectId,
    messageId,
    sandbox,
    files: { ...files },
    touched: {},
    previewUrl: session.url,
    settleMs: fw.usesNpm ? undefined : 0,
    usesNpm: fw.usesNpm,
    fileRoot: fw.fileRoot || undefined,
    emit,
  };
  const editSpec = resolveModelSpec("edit", project?.modelId);
  const usage = new UsageAccumulator();

  const agent = createAgent<AgentState>({
    name: "surgical-edit-agent",
    description: "Makes precise, minimal edits to existing code",
    system:
      opts.systemPrompt ??
      (fw.id === "STATIC_HTML" ? STATIC_SURGICAL_EDIT_PROMPT : SURGICAL_EDIT_PROMPT),
    model: getModel("edit", { override: project?.modelId }),
    tools: surgicalAgentTools(ctx),
    lifecycle: {
      onResponse: async ({ result, network }) => {
        usage.recordRaw("Edit agent", editSpec, result.raw);
        const text = lastAssistantTextMessageContent(result);
        const summary = resolveCompletion(text, result, ctx.touched);
        if (summary && network) network.state.data.summary = summary;
        return result;
      },
    },
  });

  const network = createNetwork<AgentState>({
    name: "surgical-edit-network",
    agents: [agent],
    // Tight cap: a targeted edit that needs 20 turns has lost the plot, and
    // letting it wander is how unrelated code gets rewritten.
    maxIter: 8,
    defaultState: createState<AgentState>({ summary: "" }),
    router: ({ network }) => (network.state.data.summary ? undefined : agent),
  });

  const result = await network.run(opts.userPrompt);

  // Capture anything produced outside the write tools before the sandbox can be
  // recycled — otherwise a package installed or file scaffolded during this edit
  // is destroyed on the next rehydrate.
  await syncManifests(ctx, { usesNpm: fw.usesNpm });
  await reconcileSandboxFiles(sandbox, projectId, ctx.files, { fileRoot: fw.fileRoot }).catch(() => null);

  return {
    summary: result.state.data.summary ?? "",
    touched: ctx.touched,
    sandboxUrl: session.url,
    usage: {
      ...usage.totals(),
      peakPromptTokens: usage.peakPromptTokens(),
      modelId: editSpec.id,
      detail: usage.detail(),
    },
  };
}

async function finish(opts: {
  projectId: string;
  messageId: string;
  summary: string;
  touched: Record<string, string>;
  sandboxUrl: string;
  fallbackReply: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    costUsd: number;
    peakPromptTokens: number;
    modelId: string;
    detail: Record<string, unknown>;
  };
}) {
  const { projectId, messageId } = opts;
  const emit = createAgentEventEmitter(projectId, messageId);
  const changed = Object.keys(opts.touched).length > 0;

  if (!opts.summary || !changed) {
    await emit("ERROR", "No changes were made");
    await prisma.message.create({
      data: {
        projectId,
        content:
          opts.summary ||
          "I couldn't find the code behind that element. Try describing the change in the chat instead.",
        role: "ASSISTANT",
        type: "ERROR",
        status: "ERROR",
      },
    });
    await prisma.message
      .update({ where: { id: messageId }, data: { status: "COMPLETE" } })
      .catch(() => {});
    return { ok: false as const };
  }

  const replyAgent = createAgent({
    name: "response-generator",
    description: "Writes the user-facing reply",
    system: RESPONSE_PROMPT,
    model: getModel("fast"),
  });
  const replyOut = await replyAgent.run(opts.summary);
  const reply = parseAgentOutput(replyOut.output, opts.fallbackReply);

  const { filesVersion } = await getProjectFiles(projectId);

  const u = opts.usage;

  const assistantMessage = await prisma.message.create({
    data: {
      projectId,
      content: reply,
      role: "ASSISTANT",
      type: "RESULT",
      status: "COMPLETE",
      promptTokens: u?.promptTokens,
      completionTokens: u?.completionTokens,
      costUsd: u?.costUsd,
      usageModelId: u?.modelId,
      usageDetail: u ? { ...u.detail, peakPromptTokens: u.peakPromptTokens } : undefined,
      fragment: {
        create: {
          sandboxUrl: opts.sandboxUrl,
          title: "Edit",
          files: opts.touched,
          filesVersion,
        },
      },
    },
  });

  // Linked to the reply, not the prompt: that is the row the chat hangs the
  // "restore this version" control off.
  await createCheckpoint(projectId, {
    kind: "TURN",
    label: opts.summary.split("\n")[0].slice(0, 80) || "Edit",
    messageId: assistantMessage.id,
  }).catch(() => null);

  if (u) {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        totalPromptTokens: { increment: u.promptTokens },
        totalCompletionTokens: { increment: u.completionTokens },
        totalCostUsd: { increment: u.costUsd },
      },
    });
  }

  await prisma.message
    .update({ where: { id: messageId }, data: { status: "COMPLETE" } })
    .catch(() => {});
  await emit("DONE", "Edit applied");

  return { ok: true as const };
}

/**
 * Targeted edit driven by an element selected in the preview.
 *
 * A separate function rather than a flag on `code-agent/run` so it gets its own
 * concurrency key, iteration cap, retry policy and tool set.
 */
export const surgicalEditFunction = inngest.createFunction(
  {
    id: "surgical-edit",
    concurrency: { key: "event.data.projectId", limit: 1 },
    retries: 1,
    cancelOn: [
      { event: "code-agent/cancel", if: "event.data.projectId == async.data.projectId" },
    ],
    onFailure: async ({ event }) => {
      const { projectId, messageId } = event.data.event.data;
      await prisma.message.create({
        data: {
          projectId,
          content: "That edit failed. Please try again.",
          role: "ASSISTANT",
          type: "ERROR",
          status: "ERROR",
        },
      });
      await prisma.message
        .update({ where: { id: messageId }, data: { status: "ERROR" } })
        .catch(() => {});
    },
  },
  { event: "code-agent/surgical-edit" },
  async ({ event, step }) => {
    const { projectId, messageId, instruction, locator } = event.data;

    await step.run("mark-running", async () => {
      await prisma.message.update({
        where: { id: messageId },
        data: { status: "RUNNING", runId: event.id ?? null },
      });
      return true;
    });

    const outcome = await step.run("run-surgical-edit", () =>
      withoutStepTools(async () => {
        const { files } = await getProjectFiles(projectId);
        const selection = buildSelectionContext(locator, files);
        const userPrompt =
          `${selection}\n\n<user_instruction>\n${instruction}\n</user_instruction>`;

        return runSurgicalAgent({
          projectId,
          messageId,
          userPrompt,
          emitLabel: "Locating the element you selected",
        });
      }),
    );

    // In a step, because it writes the assistant message and a checkpoint. Left
    // bare it re-ran on every replay and posted the reply more than once.
    return step.run("finish-surgical-edit", () =>
      withoutStepTools(() =>
        finish({
          projectId,
          messageId,
          ...outcome,
          fallbackReply: "Done — I've updated that element.",
        }),
      ),
    );
  },
);

/** "Fix with AI" for a runtime console error or a failed export build. */
export const fixErrorFunction = inngest.createFunction(
  {
    id: "fix-error",
    concurrency: { key: "event.data.projectId", limit: 1 },
    retries: 1,
    cancelOn: [
      { event: "code-agent/cancel", if: "event.data.projectId == async.data.projectId" },
    ],
    onFailure: async ({ event }) => {
      const { projectId, messageId } = event.data.event.data;
      await prisma.message.create({
        data: {
          projectId,
          content: "I couldn't fix that automatically. Try describing the problem in the chat.",
          role: "ASSISTANT",
          type: "ERROR",
          status: "ERROR",
        },
      });
      await prisma.message
        .update({ where: { id: messageId }, data: { status: "ERROR" } })
        .catch(() => {});
    },
  },
  { event: "code-agent/fix-error" },
  async ({ event, step }) => {
    const { projectId, messageId, errorText, source } = event.data;

    await step.run("mark-running", async () => {
      await prisma.message.update({
        where: { id: messageId },
        data: { status: "RUNNING", runId: event.id ?? null },
      });
      return true;
    });

    const outcome = await step.run("run-fix", () =>
      withoutStepTools(() =>
        runSurgicalAgent({
          projectId,
          messageId,
          systemPrompt: FIX_ERROR_PROMPT,
          userPrompt:
            `The app produced the following ${source} error. Find the root cause and fix it.\n\n` +
            `<error_output>\n${errorText.slice(0, 16000)}\n</error_output>`,
          emitLabel: "Reading the error",
        }),
      ),
    );

    return step.run("finish-fix", () =>
      withoutStepTools(() =>
        finish({
          projectId,
          messageId,
          ...outcome,
          fallbackReply: "Fixed — the error should be gone now.",
        }),
      ),
    );
  },
);
