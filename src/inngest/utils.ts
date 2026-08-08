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
