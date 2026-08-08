"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import type { VibeElementLocator } from "@/modules/preview/protocol";
import { usePreviewBridge, type ConsoleEntry } from "@/modules/preview/hooks/use-preview-bridge";
import { useSandboxSession } from "@/modules/preview/hooks/use-sandbox-session";

import { PreviewConsole } from "./preview-console";
import { PreviewToolbar, DEVICE_PRESETS, type DevicePreset } from "./preview-toolbar";
import { SandboxStatus } from "./sandbox-status";
import { SelectionPanel } from "./selection-panel";

interface Props {
  projectId: string;
}

export const PreviewPanel = ({ projectId }: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);

  const [device, setDevice] = useState<DevicePreset>(DEVICE_PRESETS[0]);
  const [landscape, setLandscape] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [consoleOpen, setConsoleOpen] = useState(false);

  const { status, sandboxUrl, error, isWaking, wake, restart, invalidate } =
    useSandboxSession(projectId);

  const invalidateProject = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: trpc.projects.getFiles.queryKey({ projectId }),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.messages.getMany.queryKey({ projectId }),
    });
  }, [queryClient, trpc, projectId]);

  const applyTextEdit = useMutation(trpc.preview.applyTextEdit.mutationOptions());
  const requestAiEdit = useMutation({
    ...trpc.preview.requestAiEdit.mutationOptions(),
    onSuccess: () => {
      invalidateProject();
      toast.success("Working on that change…");
    },
    onError: (e) => toast.error(e.message),
  });
  const requestErrorFix = useMutation({
    ...trpc.preview.requestErrorFix.mutationOptions(),
    onSuccess: () => {
      invalidateProject();
      toast.success("Looking into that error…");
    },
    onError: (e) => toast.error(e.message),
  });

  /**
   * Inline text edit. Tries the deterministic path first; when the server
   * cannot pin the text down exactly it says so rather than guessing, and we
   * hand the same selection to the model instead of making the user re-explain.
   */
  const handleTextEdit = useCallback(
    async (payload: { locator: VibeElementLocator; oldText: string; newText: string }) => {
      try {
        const result = await applyTextEdit.mutateAsync({
          projectId,
          locator: payload.locator,
          oldText: payload.oldText,
          newText: payload.newText,
        });

        if (result.status === "applied") {
          invalidateProject();
          toast.success(`Updated ${result.path}`);
          return;
        }

        if (result.status === "conflict") {
          bridge.revertOptimisticText(payload.locator.nodeId);
          toast.error(result.message);
          return;
        }

        // Fall through to the model, carrying the element context.
        bridge.revertOptimisticText(payload.locator.nodeId);
        const reason =
          result.status === "ambiguous"
            ? "That text appears in more than one place"
            : result.reason;
        toast.info(`${reason} — asking AI to make the change.`);

        await requestAiEdit.mutateAsync({
          projectId,
          instruction: `Change this text from "${payload.oldText}" to "${payload.newText}".`,
          locator: payload.locator,
        });
      } catch (e) {
        bridge.revertOptimisticText(payload.locator.nodeId);
        toast.error(e instanceof Error ? e.message : "Could not apply that edit");
      }
    },
    // `bridge` is defined below; referenced lazily inside the callback body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [projectId, applyTextEdit, requestAiEdit, invalidateProject],
  );

  const bridge = usePreviewBridge({ sandboxUrl, onTextEdit: handleTextEdit });

  const selected = bridge.state.selected;

  // Where the selected element lives, shown before the user commits to an edit.
  const { data: resolved } = useQuery({
    ...trpc.preview.resolveElement.queryOptions({
      projectId,
      locator: selected as VibeElementLocator,
    }),
    enabled: !!selected,
    staleTime: 30_000,
  });

  const errorCount = useMemo(
    () => bridge.state.consoleEntries.filter((e) => e.level === "error").length,
    [bridge.state.consoleEntries],
  );

  const handleFixConsoleError = (entry: ConsoleEntry) => {
    requestErrorFix.mutate({
      projectId,
      errorText: entry.stack ? `${entry.message}\n\n${entry.stack}` : entry.message,
      source: "console",
    });
  };

  const handleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen().catch(() => {});
  };

  const frameWidth = device.width === null ? null : landscape ? device.height : device.width;
  const frameHeight = device.height === null ? null : landscape ? device.width : device.height;
  const isLive = status === "RUNNING" && !!sandboxUrl;

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col bg-background">
      <PreviewToolbar
        mode={bridge.mode}
        onModeChange={bridge.setMode}
        device={device}
        onDeviceChange={(d) => {
          setDevice(d);
          setLandscape(false);
        }}
        landscape={landscape}
        onToggleOrientation={() => setLandscape((v) => !v)}
        zoom={zoom}
        onZoomChange={setZoom}
        route={bridge.state.route}
        sandboxUrl={sandboxUrl}
        onRefresh={() => {
          bridge.reload();
          invalidate();
        }}
        onFullscreen={handleFullscreen}
        consoleOpen={consoleOpen}
        onToggleConsole={() => setConsoleOpen((v) => !v)}
        errorCount={errorCount}
        inspectorAvailable={isLive && bridge.state.ready}
        disabled={!isLive}
      />

      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-auto",
          frameWidth !== null && "flex items-start justify-center bg-muted/40 p-4",
        )}
      >
        {isLive && bridge.src ? (
          <iframe
            ref={bridge.iframeRef}
            title="Website preview"
            className={cn(
              "border-0 bg-white",
              frameWidth === null
                ? "h-full w-full"
                : "shadow-lg ring-1 ring-black/10 rounded-lg",
            )}
            style={
              frameWidth === null
                ? undefined
                : {
                    width: frameWidth,
                    height: frameHeight ?? 800,
                    transform: `scale(${zoom})`,
                    transformOrigin: "top center",
                  }
            }
            // allow-popups / allow-modals were missing before, which silently
            // broke target="_blank" links, alert(), and downloads inside every
            // generated app.
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"
            referrerPolicy="no-referrer"
            allow="clipboard-write; fullscreen"
            src={bridge.src}
          />
        ) : (
          <SandboxStatus
            status={status}
            error={error}
            isWaking={isWaking}
            onWake={wake}
            onRestart={restart}
            onFixError={(text) =>
              requestErrorFix.mutate({ projectId, errorText: text, source: "build" })
            }
          />
        )}
      </div>

      {selected && (
        <SelectionPanel
          locator={selected}
          sourcePath={resolved?.best?.path ?? null}
          sourceLine={resolved?.best?.line ?? null}
          isSubmitting={requestAiEdit.isPending}
          onDismiss={bridge.clearSelection}
          onSubmit={(instruction) =>
            requestAiEdit.mutate({ projectId, instruction, locator: selected })
          }
        />
      )}

      {consoleOpen && (
        <PreviewConsole
          entries={bridge.state.consoleEntries}
          onClear={bridge.clearConsole}
          onClose={() => setConsoleOpen(false)}
          onFix={handleFixConsoleError}
          isFixing={requestErrorFix.isPending}
        />
      )}
    </div>
  );
};
