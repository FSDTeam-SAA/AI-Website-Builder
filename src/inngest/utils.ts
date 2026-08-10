import type { AgentResult, Message, TextMessage } from "@inngest/agent-kit";

export function lastAssistantTextMessageContent(result: AgentResult): string | undefined {
  const index = result.output.findLastIndex((message) => message.role === "assistant");
  const message = result.output[index] as TextMessage | undefined;
  if (!message?.content) return undefined;
  return typeof message.content === "string"
    ? message.content
    : message.content.map((c) => c.text).join("");
}

/**
 * Extract plain text from an agent's output.
 *
 * The previous implementation indexed `value[0]` with no guard (throwing a
 * TypeError whenever an agent returned nothing) and mapped array content with
 * `.map((txt) => txt)`, which stringified structured content to
 * "[object Object]" instead of reading `.text`.
 */
export function parseAgentOutput(value: Message[], fallback = ""): string {
  const output = value?.[0];
  if (!output || output.type !== "text") return fallback;

  const content = (output as TextMessage).content;
  const text =
    typeof content === "string" ? content : content.map((part) => part.text).join("");

  return text.trim() || fallback;
}

/** Strip the <task_summary> wrapper, returning the summary body. */
export function extractTaskSummary(text: string | undefined): string | null {
  if (!text) return null;
  const match = text.match(/<task_summary>([\s\S]*?)<\/task_summary>/i);
  return match ? match[1].trim() : null;
}

/**
 * Decide whether the agent is finished.
 *
 * The documented protocol is a `<task_summary>` block, but relying on it alone
 * is fragile: when a model answers in prose instead, the router keeps handing
 * control back and the agent rebuilds the whole app on every iteration until it
 * hits maxIter — burning tokens and rewriting files that were already correct.
 *
 * So a response that calls no tools and carries text is also treated as
 * completion, provided the run actually changed something. That is the standard
 * "the agent stopped working" signal and does not depend on output formatting.
 */
export function resolveCompletion(
  text: string | undefined,
  result: AgentResult,
  touched: Record<string, string>,
): string | null {
  const tagged = extractTaskSummary(text);
  if (tagged) return tagged;

  const calledTools = (result.toolCalls?.length ?? 0) > 0;
  const wroteSomething = Object.keys(touched).length > 0;
  const trimmed = text?.trim();

  if (!calledTools && trimmed && wroteSomething) {
    return trimmed.slice(0, 2000);
  }

  return null;
}
