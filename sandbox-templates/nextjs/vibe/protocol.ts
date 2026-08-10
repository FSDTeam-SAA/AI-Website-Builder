/**
 * MIRROR of src/modules/preview/protocol.ts in the Vibe app.
 *
 * The sandbox is a separate Next application and compiles its own copy. Keep
 * the two in sync — a mismatch shows up as a silently ignored message, not a
 * type error, because they are compiled independently.
 */

export const VIBE_PROTOCOL_VERSION = 2 as const;

export type VibeMode = "off" | "inspect" | "text-edit";

export interface VibeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VibeElementLocator {
  loc: string | null;
  nodeId: string;
  tag: string;
  componentChain: string[];
  domPath: string;
  text: string | null;
  textContent: string | null;
  textIsLiteral: boolean;
  prevSiblingText: string | null;
  nextSiblingText: string | null;
  className: string | null;
  attributes: Record<string, string>;
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

export const VIBE_QUERY = {
  enabled: "vibe",
  parent: "vibe_parent",
  session: "vibe_session",
} as const;
