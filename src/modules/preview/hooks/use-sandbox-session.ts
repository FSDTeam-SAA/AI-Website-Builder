"use client";

import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";

const HEARTBEAT_INTERVAL_MS = 60_000;

/**
 * Tracks the project's sandbox and keeps it alive while the tab is visible.
 *
 * Polling adapts to state: fast while a boot is in flight, slow once live. The
 * heartbeat only runs for a visible tab, so a forgotten background tab stops
 * renewing a billed sandbox.
 */
export function useSandboxSession(projectId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const query = useQuery({
    ...trpc.preview.getSession.queryOptions({ projectId }),
    refetchInterval: (q) => {
      const status = q.state.data?.session.status;
      if (status === "CREATING") return 2_000;
      if (q.state.data?.isGenerating) return 4_000;
      return 20_000;
    },
    refetchOnWindowFocus: true,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: trpc.preview.getSession.queryKey({ projectId }),
    });
  }, [queryClient, trpc, projectId]);

  const wake = useMutation({
    ...trpc.preview.wake.mutationOptions(),
    onSuccess: invalidate,
  });

  const restart = useMutation({
    ...trpc.preview.restart.mutationOptions(),
    onSuccess: invalidate,
  });

  const heartbeat = useMutation(trpc.preview.heartbeat.mutationOptions());

  const status = query.data?.session.status ?? "NONE";

  useEffect(() => {
    if (status !== "RUNNING") return;

    const beat = () => {
      if (document.visibilityState !== "visible") return;
      heartbeat.mutate({ projectId });
    };

    const timer = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    document.addEventListener("visibilitychange", beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
    };
    // `heartbeat` is a stable mutation object from react-query.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, projectId]);

  // Boot automatically when a project is opened with no live preview — the user
  // came here to look at their site, so making them press a button first is
  // just friction.
  useEffect(() => {
    if (status === "NONE" || status === "EXPIRED") {
      if (!wake.isPending) wake.mutate({ projectId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, projectId]);

  const session = query.data?.session;

  return {
    session,
    status,
    framework: query.data?.framework ?? null,
    bootPhase: session?.status === "CREATING" ? session.phase : null,
    isGenerating: query.data?.isGenerating ?? false,
    sandboxUrl: session?.status === "RUNNING" ? session.url : null,
    error: session?.status === "FAILED" ? session.error : null,
    isLoading: query.isLoading,
    wake: () => wake.mutate({ projectId }),
    restart: () => restart.mutate({ projectId }),
    isWaking: wake.isPending || restart.isPending || status === "CREATING",
    invalidate,
  };
}
