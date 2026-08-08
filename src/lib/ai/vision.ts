import "server-only";

import { prisma } from "@/lib/db";
import { resolveVisionModel, type ProviderId } from "@/lib/ai/providers";

/**
 * Turn attached images into a precise textual spec for the coding agent.
 *
 * agent-kit's message content type is text-only (`{ type: "text"; text }`), so
 * images cannot be threaded through the agent network. Instead we make one
 * direct call to a vision model and inject its description into the prompt.
 *
 * This is better than passing pixels through anyway: the coding agent gets an
 * explicit spec rather than re-interpreting the screenshot on every one of its
 * ~20 tool-calling iterations, and it works no matter which model the user
 * picked to code with.
 *
 * Provider REST is called with `fetch` rather than adding an SDK — it is a
 * single request per provider shape.
 */

const VISION_PROMPT = `You are looking at reference image(s) a user attached to a request for a website.

Describe them as a precise implementation spec for a frontend engineer who cannot see the image. Cover:
- Overall layout and structure (sections, grid/flex arrangement, ordering)
- Every piece of visible text, quoted exactly
- Colours (approximate hex), typography (weight, relative size, casing)
- Spacing, alignment, borders, radius, shadows
- Components present (nav, hero, cards, table, form, footer, modal…) and their variants
- Interactive elements and their apparent states
- Anything notable about responsive behaviour you can infer

If the image is a screenshot of a bug or an error, describe exactly what is wrong instead.

Be specific and factual. Do not add commentary, and do not invent details that are not visible.`;

const TIMEOUT_MS = 60_000;
const MAX_IMAGES = 4;

interface ImageInput {
  mime: string;
  base64: string;
}

async function describeWithOpenAICompatible(
  baseUrl: string,
  model: string,
  apiKey: string,
  images: ImageInput[],
  instruction: string,
): Promise<string> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      messages: [
        { role: "system", content: VISION_PROMPT },
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            ...images.map((img) => ({
              type: "image_url",
              image_url: { url: `data:${img.mime};base64,${img.base64}` },
            })),
          ],
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Vision request failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
}

async function describeWithAnthropic(
  model: string,
  apiKey: string,
  images: ImageInput[],
  instruction: string,
): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    body: JSON.stringify({
      model,
      max_tokens: 2000,
      system: VISION_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            ...images.map((img) => ({
              type: "image",
              source: { type: "base64", media_type: img.mime, data: img.base64 },
            })),
            { type: "text", text: instruction },
          ],
        },
      ],
    }),
  });

  if (!res.ok) throw new Error(`Vision request failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (json.content ?? [])
    .filter((c) => c.type === "text")
    .map((c) => c.text ?? "")
    .join("");
}

async function describeWithGemini(
  model: string,
  apiKey: string,
  images: ImageInput[],
  instruction: string,
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: VISION_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [
              { text: instruction },
              ...images.map((img) => ({
                inlineData: { mimeType: img.mime, data: img.base64 },
              })),
            ],
          },
        ],
        generationConfig: { maxOutputTokens: 2000 },
      }),
    },
  );

  if (!res.ok) throw new Error(`Vision request failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (json.candidates?.[0]?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("");
}

function dispatch(
  provider: ProviderId,
  model: string,
  apiKey: string,
  images: ImageInput[],
  instruction: string,
): Promise<string> {
  switch (provider) {
    case "openai":
      return describeWithOpenAICompatible(
        "https://api.openai.com/v1",
        model,
        apiKey,
        images,
        instruction,
      );
    case "grok":
      return describeWithOpenAICompatible(
        "https://api.x.ai/v1",
        model,
        apiKey,
        images,
        instruction,
      );
    case "anthropic":
      return describeWithAnthropic(model, apiKey, images, instruction);
    case "gemini":
      return describeWithGemini(model, apiKey, images, instruction);
  }
}

/**
 * Describe a message's attachments, caching the result on each row.
 *
 * Cached so a retried Inngest run — or a follow-up turn that replays history —
 * does not re-pay for the same description.
 */
export async function describeAttachments(
  attachmentIds: string[],
  instruction: string,
): Promise<string | null> {
  if (attachmentIds.length === 0) return null;

  const rows = await prisma.attachment.findMany({
    where: { id: { in: attachmentIds } },
    orderBy: { createdAt: "asc" },
    take: MAX_IMAGES,
  });
  if (rows.length === 0) return null;

  // Every attachment already described — reuse and skip the model call.
  if (rows.every((r) => r.description)) {
    return rows.map((r) => r.description).join("\n\n");
  }

  const resolved = resolveVisionModel();
  if (!resolved) return null;

  const images: ImageInput[] = rows.map((r) => ({
    mime: r.mime,
    base64: Buffer.from(r.data).toString("base64"),
  }));

  let description: string;
  try {
    description = await dispatch(
      resolved.spec.provider,
      resolved.spec.id,
      resolved.apiKey,
      images,
      instruction || "Describe these images.",
    );
  } catch (e) {
    console.error("[vision] description failed", e);
    return null;
  }

  if (!description.trim()) return null;

  // Cached against the whole set; a per-image split would need separate calls.
  await prisma.attachment
    .updateMany({
      where: { id: { in: rows.map((r) => r.id) } },
      data: { description },
    })
    .catch(() => {});

  return description;
}
