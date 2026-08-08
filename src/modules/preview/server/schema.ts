import { z } from "zod";

import type { VibeElementLocator } from "@/modules/preview/protocol";

/**
 * Runtime validation for locators.
 *
 * The locator arrives from a script running inside a sandbox we do not fully
 * control (the code agent can write to that app), so every field is bounded
 * here rather than trusted. Caps mirror the ones the inspector applies, so a
 * well-behaved frame never trips them.
 */
export const locatorSchema = z.object({
  loc: z.string().max(400).nullable(),
  nodeId: z.string().max(120),
  tag: z.string().max(60),
  componentChain: z.array(z.string().max(120)).max(12),
  domPath: z.string().max(2000),
  text: z.string().max(2000).nullable(),
  textContent: z.string().max(2000).nullable(),
  textIsLiteral: z.boolean(),
  prevSiblingText: z.string().max(500).nullable(),
  nextSiblingText: z.string().max(500).nullable(),
  className: z.string().max(2000).nullable(),
  attributes: z.record(z.string().max(80), z.string().max(500)),
  outerHTML: z.string().max(4000),
  rect: z.object({
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
  }),
  route: z.string().max(500),
}) satisfies z.ZodType<VibeElementLocator>;

export type LocatorInput = z.infer<typeof locatorSchema>;
