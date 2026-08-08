"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  VIBE_PROTOCOL_VERSION,
  buildPreviewSrc,
  isVibeFrameMessage,
  type VibeConsoleLevel,
  type VibeElementLocator,
  type VibeFrameMessage,
  type VibeMode,
  type VibeParentMessage,
  type VibeParentPayload,
} from "@/modules/preview/protocol";

export interface ConsoleEntry {
  id: string;
  level: VibeConsoleLevel;
  message: string;
  stack?: string;
  at: number;
  count: number;
}

export interface PreviewBridgeState {
  ready: boolean;
  /** True when the build-time source attribute is present in the preview. */
  hasSourceLoc: boolean;
  route: string;
  hovered: VibeElementLocator | null;
  selected: VibeElementLocator | null;
  consoleEntries: ConsoleEntry[];
}

interface UsePreviewBridgeOptions {
  sandboxUrl: string | null;
  onTextEdit?: (payload: {
    locator: VibeElementLocator;
    oldText: string;
    newText: string;
  }) => void;
}

const MAX_CONSOLE_ENTRIES = 200;

/**
 * Owns the postMessage channel with the previewed app.
 *
 * Message acceptance is deliberately strict. E2B preview URLs are public and
 * unauthenticated, so any page on the *.e2b.app apex can forge a matching
 * origin — `event.source === iframe.contentWindow` is the only check that
 * cannot be spoofed, and the per-mount session nonce discards traffic from a
 * stale frame that is still unloading.
 */
export function usePreviewBridge({ sandboxUrl, onTextEdit }: UsePreviewBridgeOptions) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [sessionId] = useState(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );
  const [mode, setModeState] = useState<VibeMode>("off");
  const [state, setState] = useState<PreviewBridgeState>({
    ready: false,
    hasSourceLoc: false,
    route: "/",
    hovered: null,
    selected: null,
    consoleEntries: [],
  });

  const parentOrigin = typeof window !== "undefined" ? window.location.origin : "";

  const sandboxOrigin = useMemo(() => {
    if (!sandboxUrl) return null;
    try {
      return new URL(sandboxUrl).origin;
    } catch {
      return null;
    }
  }, [sandboxUrl]);

  const src = useMemo(() => {
    if (!sandboxUrl || !parentOrigin) return null;
    return buildPreviewSrc(sandboxUrl, { sessionId, parentOrigin });
  }, [sandboxUrl, parentOrigin, sessionId]);

  const send = useCallback(
    (message: VibeParentPayload) => {
      const frame = iframeRef.current?.contentWindow;
      if (!frame || !sandboxOrigin) return;
      frame.postMessage(
        { ...message, v: VIBE_PROTOCOL_VERSION, sessionId } as VibeParentMessage,
        // Never "*": that would broadcast to whatever happens to be loaded.
        sandboxOrigin,
      );
    },
    [sandboxOrigin, sessionId],
  );

  const onTextEditRef = useRef(onTextEdit);
  useEffect(() => {
    onTextEditRef.current = onTextEdit;
  }, [onTextEdit]);

  useEffect(() => {
    if (!sandboxOrigin) return;

    const handler = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      if (event.origin !== sandboxOrigin) return;
      if (!isVibeFrameMessage(event.data)) return;

      const message = event.data as VibeFrameMessage;
      if (message.sessionId !== sessionId) return;

      switch (message.type) {
        case "vibe:ready":
          setState((s) => ({
            ...s,
            ready: true,
            hasSourceLoc: message.hasSourceLoc,
            route: message.route,
          }));
          break;
        case "vibe:hover":
          setState((s) => ({ ...s, hovered: message.locator }));
          break;
        case "vibe:select":
          setState((s) => ({ ...s, selected: message.locator }));
          break;
        case "vibe:deselect":
          setState((s) => ({ ...s, selected: null }));
          break;
        case "vibe:navigate":
          setState((s) => ({ ...s, route: message.route }));
          break;
        case "vibe:textEdit":
          onTextEditRef.current?.({
            locator: message.locator,
            oldText: message.oldText,
            newText: message.newText,
          });
          break;
        case "vibe:console":
          setState((s) => {
            const entries = [...s.consoleEntries];
            const last = entries[entries.length - 1];
            // Collapse repeats — a render loop can emit the same error hundreds
            // of times and would otherwise bury everything else.
            if (last && last.message === message.message && last.level === message.level) {
              entries[entries.length - 1] = { ...last, count: last.count + 1, at: message.at };
              return { ...s, consoleEntries: entries };
            }
            entries.push({
              id: `${message.at}-${entries.length}`,
              level: message.level,
              message: message.message,
              stack: message.stack,
              at: message.at,
              count: 1,
            });
            return {
              ...s,
              consoleEntries: entries.slice(-MAX_CONSOLE_ENTRIES),
            };
          });
          break;
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [sandboxOrigin, sessionId]);

  const setMode = useCallback(
    (next: VibeMode) => {
      setModeState(next);
      send({ type: "vibe:setMode", mode: next });
      if (next === "off") setState((s) => ({ ...s, selected: null, hovered: null }));
    },
    [send],
  );

  // Re-assert mode after a reload — the frame boots in "off".
  useEffect(() => {
    if (state.ready && mode !== "off") send({ type: "vibe:setMode", mode });
  }, [state.ready, mode, send]);

  const clearSelection = useCallback(() => {
    setState((s) => ({ ...s, selected: null }));
    send({ type: "vibe:clearSelection" });
  }, [send]);

  const revertOptimisticText = useCallback(
    (nodeId: string) => send({ type: "vibe:revertOptimistic", nodeId }),
    [send],
  );

  const clearConsole = useCallback(
    () => setState((s) => ({ ...s, consoleEntries: [] })),
    [],
  );

  const reload = useCallback(() => {
    setState((s) => ({ ...s, ready: false, consoleEntries: [] }));
    const frame = iframeRef.current;
    if (frame && src) frame.src = src;
  }, [src]);

  return {
    iframeRef,
    src,
    sessionId,
    mode,
    setMode,
    state,
    send,
    clearSelection,
    clearConsole,
    revertOptimisticText,
    reload,
  };
}
