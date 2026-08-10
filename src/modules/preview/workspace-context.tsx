"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type { VibeElementLocator } from "@/modules/preview/protocol";

/**
 * State the preview and the chat both need.
 *
 * They live in sibling panels, so neither can own this: the element is picked
 * inside the preview iframe on the right, but the instruction for it is typed
 * in the composer on the left. Restoring a version has the mirror problem — it
 * happens in the chat and the preview has to be told the app on disk changed.
 */

export interface PreviewSelection {
  locator: VibeElementLocator;
  /** Resolved server-side against `Project.files`; null when it can't be pinned. */
  sourcePath: string | null;
  sourceLine: number | null;
}

interface PreviewWorkspaceValue {
  selection: PreviewSelection | null;
  /** Published by the preview bridge whenever the user clicks an element. */
  setSelection: (selection: PreviewSelection | null) => void;
  /** Drops the chat chip *and* the highlight inside the previewed app. */
  clearSelection: () => void;
  registerSelectionClear: (fn: (() => void) | null) => void;
  /** Bumped to force the iframe to re-read the app. */
  reloadNonce: number;
  reloadPreview: () => void;
}

const PreviewWorkspaceContext = createContext<PreviewWorkspaceValue | null>(null);

export const PreviewWorkspaceProvider = ({ children }: { children: ReactNode }) => {
  const [selection, setSelection] = useState<PreviewSelection | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const frameClearRef = useRef<(() => void) | null>(null);

  const registerSelectionClear = useCallback((fn: (() => void) | null) => {
    frameClearRef.current = fn;
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(null);
    // Without this the chip disappears but the element stays outlined in the
    // frame, and clicking it again is a no-op because the frame still thinks
    // it is the current selection.
    frameClearRef.current?.();
  }, []);

  const reloadPreview = useCallback(() => setReloadNonce((n) => n + 1), []);

  const value = useMemo<PreviewWorkspaceValue>(
    () => ({
      selection,
      setSelection,
      clearSelection,
      registerSelectionClear,
      reloadNonce,
      reloadPreview,
    }),
    [selection, clearSelection, registerSelectionClear, reloadNonce, reloadPreview],
  );

  return (
    <PreviewWorkspaceContext.Provider value={value}>
      {children}
    </PreviewWorkspaceContext.Provider>
  );
};

export function usePreviewWorkspace(): PreviewWorkspaceValue {
  const context = useContext(PreviewWorkspaceContext);
  if (!context) {
    throw new Error("usePreviewWorkspace must be used within a PreviewWorkspaceProvider");
  }
  return context;
}
