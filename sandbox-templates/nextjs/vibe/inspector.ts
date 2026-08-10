import { ALLOWED_PARENT_ORIGINS } from "./allowed-parents";
import {
  VIBE_PROTOCOL_VERSION,
  VIBE_QUERY,
  type VibeConsoleLevel,
  type VibeElementLocator,
  type VibeFrameMessage,
  type VibeMode,
  type VibeParentMessage,
} from "./protocol";
import {
  VIBE_UI_ATTR,
  buildLocator,
  hasFiberDebugInfo,
  isVibeUi,
  lookupNode,
} from "./locator";

/**
 * The in-page agent that powers Vibe's visual editor.
 *
 * Security posture — the sandbox preview URL is public and unauthenticated, so
 * anyone can put this page in an iframe:
 *   - inert unless framed;
 *   - the parent origin must be on a build-time allowlist. The `vibe_parent`
 *     query param is only ever *matched against* that list, never trusted;
 *   - every postMessage targets an explicit origin, never "*".
 */

const SESSION_KEY = "__vibe_session";
const PARENT_KEY = "__vibe_parent";

let sessionId = "";
let parentOrigin = "";
let mode: VibeMode = "off";
let hoveredEl: Element | null = null;
let selectedEl: Element | null = null;
let editingEl: HTMLElement | null = null;
let editingTextNode: Text | null = null;
let editingLocator: VibeElementLocator | null = null;
let editingOriginal = "";
let editingOriginalNodeValue = "";
let started = false;
const optimisticOriginals = new Map<string, string>();

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

/** Omit that distributes across a union — a plain Omit collapses the variants. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type FramePayload = DistributiveOmit<VibeFrameMessage, "v" | "sessionId">;

function post(message: FramePayload) {
  if (!parentOrigin) return;
  try {
    window.parent.postMessage(
      { ...message, v: VIBE_PROTOCOL_VERSION, sessionId } as VibeFrameMessage,
      parentOrigin,
    );
  } catch {
    // Parent went away mid-flight.
  }
}

function resolveBootstrap(): boolean {
  if (window.parent === window) return false;

  const params = new URLSearchParams(window.location.search);
  const paramParent = params.get(VIBE_QUERY.parent);
  const paramSession = params.get(VIBE_QUERY.session);

  // Client-side navigation drops the query string, so persist for the session.
  let storedParent: string | null = null;
  let storedSession: string | null = null;
  try {
    storedParent = window.sessionStorage.getItem(PARENT_KEY);
    storedSession = window.sessionStorage.getItem(SESSION_KEY);
  } catch {
    // sessionStorage can be unavailable; fall back to params only.
  }

  const candidateParent = paramParent ?? storedParent;
  const candidateSession = paramSession ?? storedSession;
  if (!candidateParent || !candidateSession) return false;

  // The allowlist is the authority. A hostile framer supplying its own origin
  // simply fails to match and gets an inert page.
  if (!ALLOWED_PARENT_ORIGINS.includes(candidateParent)) return false;

  parentOrigin = candidateParent;
  sessionId = candidateSession;

  try {
    window.sessionStorage.setItem(PARENT_KEY, parentOrigin);
    window.sessionStorage.setItem(SESSION_KEY, sessionId);
  } catch {
    /* ignore */
  }

  return true;
}

// ---------------------------------------------------------------------------
// Overlay (rendered inside the frame, in a shadow root)
// ---------------------------------------------------------------------------

let overlayHost: HTMLDivElement | null = null;
let hoverBox: HTMLDivElement | null = null;
let selectBox: HTMLDivElement | null = null;
let labelChip: HTMLDivElement | null = null;

function ensureOverlay() {
  if (overlayHost) return;

  overlayHost = document.createElement("div");
  overlayHost.setAttribute(VIBE_UI_ATTR, "");
  overlayHost.style.cssText =
    "position:fixed;inset:0;pointer-events:none;z-index:2147483646";

  const shadow = overlayHost.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = `
    .box { position: fixed; pointer-events: none; border-radius: 3px; transition: all 60ms linear; }
    .hover { border: 2px solid #C96342; background: rgba(201,99,66,.10); }
    .select { border: 2px solid #2563eb; background: rgba(37,99,235,.10); }
    .chip {
      position: fixed; pointer-events: none; font: 500 11px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
      background: #C96342; color: #fff; padding: 2px 6px; border-radius: 4px;
      white-space: nowrap; transform: translateY(-100%); box-shadow: 0 1px 3px rgba(0,0,0,.3);
    }
    .hidden { display: none; }
  `;

  hoverBox = document.createElement("div");
  hoverBox.className = "box hover hidden";
  selectBox = document.createElement("div");
  selectBox.className = "box select hidden";
  labelChip = document.createElement("div");
  labelChip.className = "chip hidden";

  shadow.append(style, hoverBox, selectBox, labelChip);
  document.body.appendChild(overlayHost);
}

function paintBox(box: HTMLDivElement | null, el: Element | null) {
  if (!box) return;
  if (!el || !el.isConnected) {
    box.classList.add("hidden");
    return;
  }
  const r = el.getBoundingClientRect();
  box.classList.remove("hidden");
  box.style.left = `${r.left}px`;
  box.style.top = `${r.top}px`;
  box.style.width = `${r.width}px`;
  box.style.height = `${r.height}px`;
}

function paintChip(el: Element | null, text: string) {
  if (!labelChip) return;
  if (!el || !el.isConnected) {
    labelChip.classList.add("hidden");
    return;
  }
  const r = el.getBoundingClientRect();
  labelChip.textContent = text;
  labelChip.classList.remove("hidden");
  labelChip.style.left = `${Math.max(4, r.left)}px`;
  labelChip.style.top = `${Math.max(14, r.top - 4)}px`;
}

function repaint() {
  paintBox(hoverBox, mode === "off" ? null : hoveredEl);
  paintBox(selectBox, selectedEl);
  if (hoveredEl && mode !== "off") {
    paintChip(hoveredEl, labelFor(hoveredEl));
  } else if (labelChip) {
    labelChip.classList.add("hidden");
  }
}

function labelFor(el: Element): string {
  const loc = el.getAttribute("data-vibe-loc");
  if (loc) {
    const [file, line] = loc.split(":");
    return `${file.split("/").pop()}:${line}`;
  }
  return el.tagName.toLowerCase();
}

// ---------------------------------------------------------------------------
// Interaction
// ---------------------------------------------------------------------------

/** The most specific non-overlay element under the pointer. */
function targetFrom(event: Event): Element | null {
  const path = (event.composedPath?.() ?? []) as EventTarget[];
  for (const node of path) {
    if (node instanceof Element && !isVibeUi(node)) {
      if (node.tagName === "HTML" || node.tagName === "BODY") continue;
      return node;
    }
  }
  const target = event.target;
  return target instanceof Element &&
    target.tagName !== "HTML" &&
    target.tagName !== "BODY" &&
    !isVibeUi(target)
    ? target
    : null;
}

type CaretDocument = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  caretRangeFromPoint?: (x: number, y: number) => Range | null;
};

/**
 * Return the element owning the actual text glyph under the pointer.
 *
 * Event targeting can report <body> when generated CSS uses pointer-events or
 * decorative layers. Caret hit-testing resolves the rendered character instead
 * and prevents a direct edit from accidentally targeting the whole document.
 */
function textTargetFromPoint(event: MouseEvent | PointerEvent): HTMLElement | null {
  const doc = document as CaretDocument;
  let node: Node | null = null;
  let offset = 0;

  const position = doc.caretPositionFromPoint?.(event.clientX, event.clientY);
  if (position) {
    node = position.offsetNode;
    offset = position.offset;
  } else {
    const range = doc.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (range) {
      node = range.startContainer;
      offset = range.startOffset;
    }
  }

  if (!node || node.nodeType !== Node.TEXT_NODE || !node.nodeValue?.trim()) return null;

  // A caret API may return the nearest character even over empty space. Require
  // the pointer to be on that character's painted box (with a tiny touch margin).
  const length = node.nodeValue.length;
  const charOffset = Math.max(0, Math.min(offset, length - 1));
  const charRange = document.createRange();
  charRange.setStart(node, charOffset);
  charRange.setEnd(node, Math.min(charOffset + 1, length));
  const onGlyph = Array.from(charRange.getClientRects()).some(
    (rect) =>
      event.clientX >= rect.left - 3 &&
      event.clientX <= rect.right + 3 &&
      event.clientY >= rect.top - 3 &&
      event.clientY <= rect.bottom + 3,
  );
  if (!onGlyph) return null;

  const el = node.parentElement;
  if (!el || isVibeUi(el) || el.tagName === "HTML" || el.tagName === "BODY") return null;
  return el;
}

function onPointerMove(event: PointerEvent) {
  if (mode === "off" || editingEl) return;
  const el = mode === "text-edit" ? textTargetFromPoint(event) : targetFrom(event);
  if (el === hoveredEl) return;
  hoveredEl = el;
  repaint();
  post({ type: "vibe:hover", locator: el ? buildLocator(el) : null });
}

function onPointerLeave() {
  if (mode === "off") return;
  hoveredEl = null;
  repaint();
  post({ type: "vibe:hover", locator: null });
}

function onClick(event: MouseEvent) {
  if (mode === "off") return;
  if (editingEl && editingEl.contains(event.target as Node)) return;

  const el = mode === "text-edit" ? textTargetFromPoint(event) : targetFrom(event);
  if (!el) return;

  // In inspect/edit mode the page's own click handlers must not fire — the user
  // is pointing at the element, not using the app.
  event.preventDefault();
  event.stopPropagation();

  if (editingEl) commitEdit();

  selectedEl = el;
  repaint();
  post({ type: "vibe:select", locator: buildLocator(el) });
}

function onDoubleClick(event: MouseEvent) {
  if (mode !== "text-edit") return;
  const el = textTargetFromPoint(event);
  if (!el) return;

  event.preventDefault();
  event.stopPropagation();
  beginEdit(el);
}

function beginEdit(el: HTMLElement) {
  if (editingEl) commitEdit();

  // Edit one direct text node, not the element's full textContent. Selecting a
  // button label must not delete its icon or nested markup when the user types.
  const textNodes = Array.from(el.childNodes).filter(
    (node): node is Text => node.nodeType === Node.TEXT_NODE && !!node.nodeValue?.trim(),
  );
  if (textNodes.length !== 1) return;

  editingEl = el;
  editingTextNode = textNodes[0];
  editingLocator = buildLocator(el);
  editingOriginalNodeValue = editingTextNode.nodeValue ?? "";
  editingOriginal = editingOriginalNodeValue.trim();
  el.setAttribute("contenteditable", "plaintext-only");
  el.setAttribute("spellcheck", "false");
  el.focus();

  // Select only the label so nested icons and elements survive the edit.
  const range = document.createRange();
  range.selectNodeContents(editingTextNode);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);

  el.addEventListener("keydown", onEditKeyDown);
  el.addEventListener("blur", commitEdit, { once: true });
  el.addEventListener("paste", onEditPaste);
}

function onEditPaste(event: ClipboardEvent) {
  // Keep the DOM clean: a pasted rich fragment would produce markup we cannot
  // map back to a single source string.
  event.preventDefault();
  const text = event.clipboardData?.getData("text/plain") ?? "";
  document.execCommand("insertText", false, text.replace(/\s+/g, " "));
}

function onEditKeyDown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    commitEdit();
  } else if (event.key === "Escape") {
    event.preventDefault();
    cancelEdit();
  }
}

function teardownEdit(el: HTMLElement) {
  el.removeAttribute("contenteditable");
  el.removeAttribute("spellcheck");
  el.removeEventListener("keydown", onEditKeyDown);
  el.removeEventListener("paste", onEditPaste);
}

function commitEdit() {
  const el = editingEl;
  const textNode = editingTextNode;
  const locator = editingLocator;
  if (!el || !textNode || !locator) return;
  editingEl = null;
  editingTextNode = null;
  editingLocator = null;

  const next = (textNode.nodeValue ?? "").trim();
  teardownEdit(el);

  if (next === editingOriginal) {
    post({ type: "vibe:textEditCancelled", nodeId: locator.nodeId });
    return;
  }

  // The DOM already shows the new text; the parent persists it and Fast Refresh
  // makes it authoritative. On failure the parent tells us to revert.
  optimisticOriginals.set(locator.nodeId, editingOriginalNodeValue);
  post({
    type: "vibe:textEdit",
    // This must describe the source as it looked before the user typed. A
    // locator built from the optimistic DOM contains the new text, which does
    // not exist in source yet and makes static HTML impossible to resolve.
    locator,
    oldText: editingOriginal,
    newText: next,
  });
}

function cancelEdit() {
  const el = editingEl;
  const textNode = editingTextNode;
  const locator = editingLocator;
  if (!el || !textNode || !locator) return;
  editingEl = null;
  editingTextNode = null;
  editingLocator = null;
  textNode.nodeValue = editingOriginalNodeValue;
  teardownEdit(el);
  post({ type: "vibe:textEditCancelled", nodeId: locator.nodeId });
}

function setMode(next: VibeMode) {
  if (editingEl) cancelEdit();
  mode = next;
  document.documentElement.style.cursor = next === "off" ? "" : "crosshair";
  if (next === "off") {
    hoveredEl = null;
    selectedEl = null;
  }
  repaint();
}

// ---------------------------------------------------------------------------
// Console + navigation forwarding
// ---------------------------------------------------------------------------

const CONSOLE_BUDGET = 100;
let consoleSent = 0;

function forwardConsole(level: VibeConsoleLevel, args: unknown[], stack?: string) {
  if (consoleSent >= CONSOLE_BUDGET) return;
  consoleSent++;

  const message = args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ")
    .slice(0, 4000);

  if (!message.trim()) return;
  post({ type: "vibe:console", level, message, stack: stack?.slice(0, 4000), at: Date.now() });
}

function patchConsole() {
  for (const level of ["error", "warn"] as const) {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      forwardConsole(level, args);
      original(...args);
    };
  }

  window.addEventListener("error", (event) => {
    forwardConsole("error", [event.message], event.error?.stack);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    forwardConsole(
      "error",
      [`Unhandled promise rejection: ${reason instanceof Error ? reason.message : String(reason)}`],
      reason instanceof Error ? reason.stack : undefined,
    );
  });
}

function patchHistory() {
  const announce = () => post({ type: "vibe:navigate", route: window.location.pathname });

  const originalPush = history.pushState.bind(history);
  history.pushState = function (data: unknown, unused: string, url?: string | URL | null) {
    const result = originalPush(data, unused, url);
    queueMicrotask(announce);
    return result;
  };

  const originalReplace = history.replaceState.bind(history);
  history.replaceState = function (data: unknown, unused: string, url?: string | URL | null) {
    const result = originalReplace(data, unused, url);
    queueMicrotask(announce);
    return result;
  };

  window.addEventListener("popstate", announce);
}

// ---------------------------------------------------------------------------
// Parent messages
// ---------------------------------------------------------------------------

function onParentMessage(event: MessageEvent) {
  if (event.origin !== parentOrigin) return;
  if (event.source !== window.parent) return;

  const raw = event.data as { v?: number; sessionId?: string; type?: string } | null;
  if (!raw || raw.v !== VIBE_PROTOCOL_VERSION || raw.sessionId !== sessionId) return;
  if (typeof raw.type !== "string" || !raw.type.startsWith("vibe:")) return;

  const data = raw as VibeParentMessage;

  switch (data.type) {
    case "vibe:setMode":
      setMode(data.mode);
      break;
    case "vibe:highlight": {
      const el = data.nodeId ? lookupNode(data.nodeId) : null;
      hoveredEl = el;
      repaint();
      break;
    }
    case "vibe:clearSelection":
      selectedEl = null;
      repaint();
      break;
    case "vibe:scrollTo": {
      const el = lookupNode(data.nodeId);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      break;
    }
    case "vibe:revertOptimistic": {
      const el = lookupNode(data.nodeId);
      const original = optimisticOriginals.get(data.nodeId);
      if (el && original !== undefined) {
        const textNode = Array.from(el.childNodes).find(
          (node): node is Text => node.nodeType === Node.TEXT_NODE && !!node.nodeValue?.trim(),
        );
        if (textNode) textNode.nodeValue = original;
      }
      optimisticOriginals.delete(data.nodeId);
      break;
    }
    case "vibe:applyOptimisticText": {
      const el = lookupNode(data.nodeId);
      if (el) {
        const textNode = Array.from(el.childNodes).find(
          (node): node is Text => node.nodeType === Node.TEXT_NODE && !!node.nodeValue?.trim(),
        );
        if (textNode) textNode.nodeValue = data.text;
      }
      optimisticOriginals.delete(data.nodeId);
      break;
    }
    case "vibe:navigate":
      window.location.pathname = data.path;
      break;
    case "vibe:reload":
      window.location.reload();
      break;
    case "vibe:ping":
      post({ type: "vibe:pong" });
      break;
  }
}

// ---------------------------------------------------------------------------
// Entry
// ---------------------------------------------------------------------------

export function start() {
  if (started) return;
  if (typeof window === "undefined") return;
  if (!resolveBootstrap()) return;
  started = true;

  const boot = () => {
    ensureOverlay();

    window.addEventListener("message", onParentMessage);
    document.addEventListener("pointermove", onPointerMove, true);
    document.addEventListener("pointerleave", onPointerLeave, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("dblclick", onDoubleClick, true);
    window.addEventListener("scroll", repaint, { passive: true, capture: true });
    window.addEventListener("resize", repaint, { passive: true });

    patchConsole();
    patchHistory();

    const probe = document.querySelector("[data-vibe-loc]");
    post({
      type: "vibe:ready",
      url: window.location.href,
      route: window.location.pathname,
      hasSourceLoc: !!probe,
      hasFiberDebug: !!document.body && hasFiberDebugInfo(document.body),
      reactVersion:
        (window as unknown as { React?: { version?: string } }).React?.version ?? null,
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}
