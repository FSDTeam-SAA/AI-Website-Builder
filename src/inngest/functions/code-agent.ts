import {
  createAgent,
  createNetwork,
  createState,
  type Message,
} from "@inngest/agent-kit";

import { prisma } from "@/lib/db";
import { getModel, resolveModelSpec } from "@/lib/ai/providers";
import { UsageAccumulator } from "@/lib/ai/usage-meter";
import { createCheckpoint } from "@/lib/checkpoints";
import { describeAttachments } from "@/lib/ai/vision";
import { reconcileSandboxFiles } from "@/lib/sandbox/reconcile";
import { ensureSandbox, connectIfAlive } from "@/lib/sandbox/manager";
import { getProjectFiles } from "@/lib/project-files";
import { buildCodeMap, renderCodeMap } from "@/lib/code-map";
import {
  CODE_AGENT_PROMPT,
  FRAGMENT_TITLE_PROMPT,
  RESPONSE_PROMPT,
  STATIC_HTML_PROMPT,
} from "@/prompts";
import { frameworkConfig } from "@/lib/framework";

import { inngest } from "../client";
import { verifyAndRepair } from "../repair";
import {
  buildAgentTools,
  createAgentEventEmitter,
  syncManifests,
  type ToolContext,
} from "../tools";
import { extractTaskSummary, lastAssistantTextMessageContent, parseAgentOutput } from "../utils";

interface AgentState {
  summary: string;
}

const MAX_ITERATIONS = 20;
const MEMORY_WINDOW = 8;

async function loadConversation(projectId: string): Promise<Message[]> {
  const rows = await prisma.message.findMany({
    where: { projectId, status: { not: "CANCELLED" } },
    orderBy: { createdAt: "desc" },
    take: MEMORY_WINDOW,
    select: { role: true, content: true },
  });

  return rows
    .reverse()
    .map<Message>((m) => ({
      type: "text",
      role: m.role === "ASSISTANT" ? "assistant" : "user",
      content: m.content,
    }));
}

export const codeAgentFunction = inngest.createFunction(
  {
    id: "code-agent",
    // One run at a time per project. Two concurrent runs would fight over the
    // same sandbox and interleave writes into the same file tree.
    concurrency: { key: "event.data.projectId", limit: 1 },
    retries: 1,
    cancelOn: [
      {
        event: "code-agent/cancel",
        if: "event.data.projectId == async.data.projectId",
      },
    ],
    onFailure: async ({ event, error }) => {
      const { projectId, messageId } = event.data.event.data;
      await prisma.message.create({
        data: {
          projectId,
          content:
            "Something went wrong while building. The error has been logged — please try again.",
          role: "ASSISTANT",
          type: "ERROR",
          status: "ERROR",
        },
      });
      if (messageId) {
        await prisma.message
          .update({ where: { id: messageId }, data: { status: "ERROR" } })
          .catch(() => {});
      }
      await prisma.agentEvent
        .create({
          data: {
            projectId,
            messageId,
            type: "ERROR",
            label: "Run failed",
            detail: { error: String(error).slice(0, 4000) },
          },
        })
        .catch(() => {});
    },
  },
  { event: "code-agent/run" },
  async ({ event, step }) => {
    const { projectId, value, messageId, attachmentIds } = event.data;
    const emit = createAgentEventEmitter(projectId, messageId);

    // Attached images are turned into a written spec first. agent-kit's message
    // content type is text-only, so pixels cannot travel through the network —
    // and a spec is more useful to the agent across its many iterations anyway.
    const imageSpec = await step.run("describe-attachments", async () => {
      if (!attachmentIds?.length) return null;
      await emit("STATUS", "Looking at your image");
      return describeAttachments(attachmentIds, value);
    });

    if (messageId) {
      await step.run("mark-running", async () => {
        await prisma.message.update({
          where: { id: messageId },
          data: { status: "RUNNING", runId: event.id ?? null },
        });
        return true;
      });
    }

    // 1. Sandbox — reconnected when alive, rebuilt from Project.files when not.
    const sandboxInfo = await step.run("ensure-sandbox", async () => {
      await emit("STATUS", "Preparing your workspace");
      const session = await ensureSandbox(projectId);
      if (session.status !== "RUNNING") {
        throw new Error(
          session.status === "FAILED"
            ? `Could not start the preview: ${session.error}`
            : `Preview is ${session.status.toLowerCase()}`,
        );
      }
      return { sandboxId: session.sandboxId, url: session.url };
    });

    // 2. The agent loop, as one durable unit. Tools intentionally do not open
    //    nested steps: the previous implementation gave every call of a tool the
    //    same step name, so Inngest replayed the first result for all of them.
    const outcome = await step.run("run-agent", async () => {
      const sandbox = await connectIfAlive(sandboxInfo.sandboxId);
      if (!sandbox) throw new Error("Lost connection to the preview sandbox");

      const { files } = await getProjectFiles(projectId);
      const isExistingApp = Object.keys(files).length > 0;

      const ctx: ToolContext = {
        projectId,
        messageId,
        sandbox,
        files: { ...files },
        touched: {},
        previewUrl: sandboxInfo.url,
        emit,
      };

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { modelId: true, framework: true },
      });

      const fw = frameworkConfig(project?.framework);
      const codeSpec = resolveModelSpec("code", project?.modelId);
      const usage = new UsageAccumulator();

      const codeAgent = createAgent<AgentState>({
        name: "code-agent",
        description: "An expert full-stack engineer",
        system: fw.id === "STATIC_HTML" ? STATIC_HTML_PROMPT : CODE_AGENT_PROMPT,
        model: getModel("code", { override: project?.modelId }),
        tools: buildAgentTools(ctx),
        lifecycle: {
          onResponse: async ({ result, network }) => {
            // agent-kit hands back the untouched provider response here, which
            // is the only place real token counts are available.
            usage.recordRaw("Code agent", codeSpec, result.raw);

            const text = lastAssistantTextMessageContent(result);
            const summary = extractTaskSummary(text);
            if (summary && network) network.state.data.summary = summary;
            return result;
          },
        },
      });

      const network = createNetwork<AgentState>({
        name: "coding-agent-network",
        agents: [codeAgent],
        maxIter: MAX_ITERATIONS,
        defaultState: createState<AgentState>(
          { summary: "" },
          { messages: await loadConversation(projectId) },
        ),
        router: ({ network }) => (network.state.data.summary ? undefined : codeAgent),
      });

      // Telling the model what already exists is what turns a follow-up into an
      // edit instead of a from-scratch regeneration.
      const sections: string[] = [];
      if (isExistingApp) {
        // A code map rather than a bare file list. Listing each file's exports
        // and routes usually lets the model jump straight to the right file,
        // instead of paying for a search -> read -> read-again round trip
        // before it can make a single edit.
        sections.push(
          `<code_map>\n${renderCodeMap(buildCodeMap(ctx.files))}\n</code_map>`,
        );
      }
      if (imageSpec) {
        sections.push(
          `<attached_image_description>\n${imageSpec}\n</attached_image_description>\n` +
            `The user attached image(s); the description above is what they show. ` +
            `Match them closely.`,
        );
      }
      sections.push(`<user_request>\n${value}\n</user_request>`);
      if (isExistingApp) {
        sections.push(
          "This app already exists. Inspect the relevant files and make a targeted change.",
        );
      }

      const prompt =
        sections.length === 1 && !imageSpec ? value : sections.join("\n\n");

      await emit("STATUS", isExistingApp ? "Reading your project" : "Designing your app");

      const result = await network.run(prompt);

      // Verify the agent's own work, and repair it if broken. Without this a
      // run could report success over an app that fails to compile.
      const repair = await verifyAndRepair(ctx, sandbox, sandboxInfo.url, {
        modelOverride: project?.modelId,
      }).catch(() => null);

      if (repair) {
        usage.record("Auto-repair", codeSpec, {
          promptTokens: repair.usage.promptTokens,
          completionTokens: repair.usage.completionTokens,
          cachedTokens: 0,
        });
      }

      // Anything the agent produced outside the write tools — files from
      // `npx shadcn add`, scaffolding CLIs, and the npm manifests — exists only
      // in the sandbox until this runs. Without it the next rehydrate destroys
      // that work.
      await syncManifests(ctx);
      const reconciled = await reconcileSandboxFiles(sandbox, projectId, ctx.files).catch(
        () => null,
      );
      if (reconciled?.imported.length) {
        await emit("FILE_WRITE", `Captured ${reconciled.imported.length} generated file(s)`, {
          paths: reconciled.imported,
        });
      }

      return {
        summary: result.state.data.summary ?? "",
        touched: ctx.touched,
        usage: {
          ...usage.totals(),
          peakPromptTokens: usage.peakPromptTokens(),
          modelId: codeSpec.id,
          detail: usage.detail(),
        },
      };
    });

    const succeeded =
      !!outcome.summary && Object.keys(outcome.touched ?? {}).length > 0;

    if (!succeeded) {
      await step.run("save-error", async () => {
        await emit("ERROR", "No changes were produced");
        await prisma.message.create({
          data: {
            projectId,
            content:
              "I wasn't able to complete that. Try rephrasing your request, or add more detail about what you want.",
            role: "ASSISTANT",
            type: "ERROR",
            status: "ERROR",
          },
        });
        if (messageId) {
          await prisma.message.update({
            where: { id: messageId },
            data: { status: "COMPLETE" },
          });
        }
        return true;
      });
      return { ok: false as const };
    }

    // 3. Title + reply. Only reached on success — the original ran both of these
    //    model calls before checking for failure, paying for them every time.
    const { title, reply, summaryUsage } = await step.run("summarise", async () => {
      const fast = getModel("fast");
      const fastSpec = resolveModelSpec("fast");
      const usage = new UsageAccumulator();

      const titleAgent = createAgent({
        name: "fragment-title-generator",
        description: "Generates a short title for a change",
        system: FRAGMENT_TITLE_PROMPT,
        model: fast,
      });
      const responseAgent = createAgent({
        name: "response-generator",
        description: "Writes the user-facing reply",
        system: RESPONSE_PROMPT,
        model: fast,
      });

      const [titleOut, replyOut] = await Promise.all([
        titleAgent.run(outcome.summary),
        responseAgent.run(outcome.summary),
      ]);

      usage.recordRaw("Title & reply", fastSpec, titleOut.raw);
      usage.recordRaw("Title & reply", fastSpec, replyOut.raw);

      return {
        title: parseAgentOutput(titleOut.output, "Update").slice(0, 60),
        reply: parseAgentOutput(replyOut.output, "Here's what I built for you."),
        summaryUsage: { ...usage.totals(), detail: usage.detail() },
      };
    });

    await step.run("save-result", async () => {
      const { filesVersion } = await getProjectFiles(projectId);

      // Snapshot before the turn is considered done, so this state is always
      // recoverable even if the next turn goes badly.
      await createCheckpoint(projectId, { kind: "TURN", label: title, messageId }).catch(
        () => null,
      );

      const promptTokens = outcome.usage.promptTokens + summaryUsage.promptTokens;
      const completionTokens =
        outcome.usage.completionTokens + summaryUsage.completionTokens;
      const costUsd = outcome.usage.costUsd + summaryUsage.costUsd;

      await prisma.message.create({
        data: {
          projectId,
          content: reply,
          role: "ASSISTANT",
          type: "RESULT",
          status: "COMPLETE",
          promptTokens,
          completionTokens,
          costUsd,
          usageModelId: outcome.usage.modelId,
          usageDetail: {
            ...outcome.usage.detail,
            ...summaryUsage.detail,
            // The peak single prompt, not the sum — that is what would overflow
            // the context window.
            peakPromptTokens: outcome.usage.peakPromptTokens,
          },
          fragment: {
            create: {
              sandboxUrl: sandboxInfo.url,
              title,
              // A per-turn changelog. The reconstructable tree is Project.files.
              files: outcome.touched,
              filesVersion,
            },
          },
        },
      });

      await prisma.project.update({
        where: { id: projectId },
        data: {
          totalPromptTokens: { increment: promptTokens },
          totalCompletionTokens: { increment: completionTokens },
          totalCostUsd: { increment: costUsd },
        },
      });

      if (messageId) {
        await prisma.message.update({
          where: { id: messageId },
          data: { status: "COMPLETE" },
        });
      }

      await emit("DONE", title);
      return true;
    });

    return { ok: true as const, title };
  },
);
