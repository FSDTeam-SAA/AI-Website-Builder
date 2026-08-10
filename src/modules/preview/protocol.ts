/**
 * postMessage contract between the app (parent) and the inspector running
 * inside the previewed sandbox app (frame).
 *
 * This file is mirrored into `sandbox-templates/nextjs/vibe/protocol.ts`. The
 * two copies must stay byte-compatible — the sandbox compiles its own copy
 * because it is a separate Next application.
 *
 * Security model (the sandbox preview URL is public and unauthenticated, so
 * anyone can frame someone else's sandbox):
 *   - the frame is inert unless it is framed AND the parent origin is on a
 *     compile-time allowlist. The `vibe_parent` query param is only ever
 *     *selected from* that allowlist, never trusted as input.
 *   - both sides post to an explicit origin, never "*".
 *   - the parent additionally checks `event.source === iframe.contentWindow`,
 *     which is the only check that cannot be forged by another page on the
 *     same *.e2b.app apex.
 *   - a per-mount `sessionId` nonce discards traffic from stale frames.
 */

export const VIBE_PROTOCOL_VERSION = 2 as const;

export type VibeMode = "off" | "inspect" | "text-edit";

export interface VibeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Everything known about a clicked element, from both mapping strategies.
 *
 * `loc` is the precise answer (a build-time attribute). The remaining fields are
 * the heuristic fallback, resolved server-side against the project's files. Both
 * are always sent: the fallback costs well under a millisecond to compute, so
 * there is no reason to make it conditional, and the server picks whichever
 * signal it actually has.
 */
export interface VibeElementLocator {
  /** "app/components/hero.tsx:42:7", or null when the loader did not apply. */
  loc: string | null;
  /** Session-scoped handle so the parent can re-address this node later. */
  nodeId: string;
  tag: string;
  /** React owner chain, outermost -> innermost. DEV-only; may be empty. */
  componentChain: string[];
  /** CSS path from <body> using nth-of-type. */
  domPath: string;
  /** Direct child text nodes only, trimmed. Null when the element owns no text. */
  text: string | null;
  /** el.textContent, truncated. */
  textContent: string | null;
  /**
   * True when the host element's React `children` prop is a bare string.
   *
   * This is the ambiguity oracle for deterministic text editing: if it is
   * false, the visible text is composed, interpolated or data-driven, and no
   * exact source string exists to patch.
   */
  textIsLiteral: boolean;
  /** Text of the immediately preceding/following siblings, for disambiguation. */
  prevSiblingText: string | null;
  nextSiblingText: string | null;
  className: string | null;
  /** Whitelisted attributes only. */
  attributes: Record<string, string>;
  /** Truncated; long attribute values elided so any leak is bounded. */
  outerHTML: string;
  rect: VibeRect;
  route: string;
}

interface Base {
  v: typeof VIBE_PROTOCOL_VERSION;
  sessionId: string;
}

export type VibeParentMessage =
  | (Base & { type: "vibe:init"; parentOrigin: string })
  | (Base & { type: "vibe:setMode"; mode: VibeMode })
  | (Base & { type: "vibe:highlight"; nodeId: string | null })
  | (Base & { type: "vibe:clearSelection" })
  | (Base & { type: "vibe:scrollTo"; nodeId: string })
  /** Optimistic in-place swap while the server patch is in flight. */
  | (Base & { type: "vibe:applyOptimisticText"; nodeId: string; text: string })
  | (Base & { type: "vibe:revertOptimistic"; nodeId: string })
  | (Base & { type: "vibe:navigate"; path: string })
  | (Base & { type: "vibe:reload" })
  | (Base & { type: "vibe:ping" });

export type VibeConsoleLevel = "error" | "warn" | "log";

export type VibeFrameMessage =
  | (Base & {
      type: "vibe:ready";
      url: string;
      route: string;
      hasSourceLoc: boolean;
      hasFiberDebug: boolean;
      reactVersion: string | null;
    })
  | (Base & { type: "vibe:pong" })
  | (Base & { type: "vibe:hover"; locator: VibeElementLocator | null })
  | (Base & { type: "vibe:select"; locator: VibeElementLocator })
  | (Base & { type: "vibe:deselect" })
  | (Base & {
      type: "vibe:textEdit";
      locator: VibeElementLocator;
      oldText: string;
      newText: string;
    })
  | (Base & { type: "vibe:textEditCancelled"; nodeId: string })
  | (Base & {
      type: "vibe:console";
      level: VibeConsoleLevel;
      message: string;
      stack?: string;
      source?: string;
      at: number;
    })
  | (Base & { type: "vibe:navigate"; route: string })
  | (Base & { type: "vibe:rects"; nodeId: string; rect: VibeRect });

/**
 * Omit that distributes across a union.
 *
 * A plain `Omit<Union, K>` collapses the union into one object type whose keys
 * are only those common to every variant — which silently rejects every
 * message-specific field.
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;

/** A frame/parent message without the envelope fields the transport adds. */
export type VibeParentPayload = DistributiveOmit<VibeParentMessage, "v" | "sessionId">;
export type VibeFramePayload = DistributiveOmit<VibeFrameMessage, "v" | "sessionId">;

export function isVibeFrameMessage(value: unknown): value is VibeFrameMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<VibeFrameMessage>;
  return (
    m.v === VIBE_PROTOCOL_VERSION &&
    typeof m.sessionId === "string" &&
    typeof m.type === "string" &&
    m.type.startsWith("vibe:")
  );
}

/** Query params the parent appends to the iframe src to bootstrap the frame. */
export const VIBE_QUERY = {
  enabled: "vibe",
  parent: "vibe_parent",
  session: "vibe_session",
} as const;

export function buildPreviewSrc(
  sandboxUrl: string,
  opts: { sessionId: string; parentOrigin: string; route?: string },
): string {
  const url = new URL(opts.route || "/", sandboxUrl);
  url.searchParams.set(VIBE_QUERY.enabled, "1");
  url.searchParams.set(VIBE_QUERY.parent, opts.parentOrigin);
  url.searchParams.set(VIBE_QUERY.session, opts.sessionId);
  return url.toString();
}

/** A short human label for an element, e.g. `<button> "Get started"`. */
export function describeLocator(locator: VibeElementLocator): string {
  const name = locator.componentChain.at(-1);
  const tag = name ? `<${name}>` : `<${locator.tag}>`;
  const text = (locator.text ?? locator.textContent ?? "").trim().slice(0, 40);
  return text ? `${tag} "${text}"` : tag;
}
