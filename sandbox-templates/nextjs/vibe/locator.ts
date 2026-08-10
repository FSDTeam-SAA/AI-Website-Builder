import type { VibeElementLocator } from "./protocol";

/**
 * Builds a locator describing a clicked element.
 *
 * Two independent signals are collected on every call:
 *
 *  1. `data-vibe-loc` — spliced onto JSX opening tags at compile time by
 *     vibe/loc-loader.cjs. Exact, but only present when the loader ran.
 *  2. A runtime descriptor read off the React fiber plus the DOM.
 *
 * React 19 removed `fiber._debugSource` and `element._source`, so there is no
 * file/line available at runtime — hence signal 1. Both are always sent and the
 * server picks whichever it can act on.
 */

const ATTR_WHITELIST = [
  "id",
  "name",
  "href",
  "src",
  "alt",
  "title",
  "role",
  "type",
  "value",
  "placeholder",
  "aria-label",
  "data-testid",
];

const MAX_OUTER_HTML = 2000;
const MAX_ATTR_VALUE = 120;
const MAX_TEXT = 300;

/** Elements the inspector renders itself; never selectable. */
export const VIBE_UI_ATTR = "data-vibe-ui";

let nodeCounter = 0;
const nodeIds = new WeakMap<Element, string>();

export function nodeIdFor(el: Element): string {
  let id = nodeIds.get(el);
  if (!id) {
    id = `n${++nodeCounter}`;
    nodeIds.set(el, id);
  }
  return id;
}

const nodesById = new Map<string, WeakRef<Element>>();

export function rememberNode(el: Element): string {
  const id = nodeIdFor(el);
  nodesById.set(id, new WeakRef(el));
  return id;
}

export function lookupNode(id: string): Element | null {
  return nodesById.get(id)?.deref() ?? null;
}

// ---------------------------------------------------------------------------
// React internals
// ---------------------------------------------------------------------------

type AnyFiber = {
  return?: AnyFiber | null;
  type?: unknown;
  elementType?: unknown;
  _debugOwner?: AnyFiber | null;
  memoizedProps?: Record<string, unknown> | null;
};

function getFiber(el: Element): AnyFiber | null {
  for (const key in el) {
    if (key.startsWith("__reactFiber$")) {
      return (el as unknown as Record<string, AnyFiber>)[key] ?? null;
    }
  }
  return null;
}

function getHostProps(el: Element): Record<string, unknown> | null {
  for (const key in el) {
    if (key.startsWith("__reactProps$")) {
      return (el as unknown as Record<string, Record<string, unknown>>)[key] ?? null;
    }
  }
  return null;
}

function componentNameOf(type: unknown): string | null {
  if (typeof type === "function") {
    const fn = type as { displayName?: string; name?: string };
    return fn.displayName || fn.name || null;
  }
  if (type && typeof type === "object") {
    const obj = type as { displayName?: string; render?: { name?: string }; type?: unknown };
    if (obj.displayName) return obj.displayName;
    if (obj.render?.name) return obj.render.name;
    // React.memo / forwardRef wrappers nest the real component.
    if (obj.type) return componentNameOf(obj.type);
  }
  return null;
}

/** Owner components from outermost to innermost, capped. */
export function componentChainFor(el: Element, limit = 6): string[] {
  const chain: string[] = [];
  let fiber = getFiber(el);
  let hops = 0;

  while (fiber && hops < 80 && chain.length < limit) {
    const name = componentNameOf(fiber.elementType ?? fiber.type);
    if (name && /^[A-Z]/.test(name) && chain[0] !== name) {
      chain.unshift(name);
    }
    fiber = fiber.return ?? null;
    hops++;
  }

  return chain.slice(-limit);
}

export function hasFiberDebugInfo(el: Element): boolean {
  const fiber = getFiber(el);
  return !!fiber && "_debugOwner" in fiber;
}

// ---------------------------------------------------------------------------
// DOM descriptors
// ---------------------------------------------------------------------------

export function domPathFor(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;

  while (node && node.nodeType === 1 && parts.length < 12) {
    const tag = node.tagName.toLowerCase();
    if (tag === "body" || tag === "html") {
      parts.unshift(tag);
      break;
    }

    const parent: Element | null = node.parentElement;
    if (!parent) {
      parts.unshift(tag);
      break;
    }

    const sameTag = Array.from(parent.children).filter(
      (c) => c.tagName === node!.tagName,
    );
    parts.unshift(
      sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(node) + 1})` : tag,
    );
    node = parent;
  }

  return parts.join(" > ");
}

/** Text belonging directly to this element, ignoring nested elements. */
export function ownTextOf(el: Element): string | null {
  let text = "";
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) text += child.nodeValue ?? "";
  }
  const trimmed = text.trim();
  return trimmed ? trimmed.slice(0, MAX_TEXT) : null;
}

/**
 * True when the element's React `children` prop is a plain string.
 *
 * This is the deciding signal for whether inline text editing is safe: if the
 * children are an array, a number, or nested elements, the visible text is
 * composed or interpolated and no single source literal exists to patch.
 */
export function textIsLiteralFor(el: Element): boolean {
  const props = getHostProps(el);
  // Plain HTML projects do not have React props. Their direct text nodes are
  // still literal and can be safely offered to the deterministic HTML editor;
  // the server verifies the exact source occurrence before changing anything.
  if (!props) return ownTextOf(el) !== null;
  return typeof props.children === "string" && props.children.trim().length > 0;
}

function siblingText(el: Element, direction: "prev" | "next"): string | null {
  const sibling = direction === "prev" ? el.previousElementSibling : el.nextElementSibling;
  if (!sibling) return null;
  const text = (sibling.textContent ?? "").trim();
  return text ? text.slice(0, 200) : null;
}

function attributesOf(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ATTR_WHITELIST) {
    const value = el.getAttribute(name);
    if (value) out[name] = value.slice(0, MAX_ATTR_VALUE);
  }
  return out;
}

/** Truncated markup with long attribute values elided, so leaks stay bounded. */
function safeOuterHTML(el: Element): string {
  let html = el.outerHTML ?? "";
  html = html.replace(/="([^"]{121,})"/g, (_m, v: string) => `="${v.slice(0, 120)}…"`);
  return html.length > MAX_OUTER_HTML ? `${html.slice(0, MAX_OUTER_HTML)}…` : html;
}

export function isVibeUi(el: Element | null): boolean {
  if (!el) return false;
  return !!el.closest?.(`[${VIBE_UI_ATTR}]`);
}

export function buildLocator(el: Element): VibeElementLocator {
  const rect = el.getBoundingClientRect();

  return {
    loc: el.getAttribute("data-vibe-loc"),
    nodeId: rememberNode(el),
    tag: el.tagName.toLowerCase(),
    componentChain: componentChainFor(el),
    domPath: domPathFor(el),
    text: ownTextOf(el),
    textContent: (el.textContent ?? "").trim().slice(0, MAX_TEXT) || null,
    textIsLiteral: textIsLiteralFor(el),
    prevSiblingText: siblingText(el, "prev"),
    nextSiblingText: siblingText(el, "next"),
    className: typeof el.className === "string" ? el.className.slice(0, 1000) : null,
    attributes: attributesOf(el),
    outerHTML: safeOuterHTML(el),
    rect: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    route: window.location.pathname,
  };
}
