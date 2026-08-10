"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";

export interface ActivityEvent {
  seq: number;
  type:
    | "STATUS"
    | "THINKING"
    | "TOOL_CALL"
    | "TOOL_RESULT"
    | "FILE_WRITE"
    | "TERMINAL"
    | "ERROR"
    | "DONE";
  label: string;
  detail?: unknown;
  /** The run (user message) this step belongs to; null on older rows. */
  messageId?: string | null;
  at: string;
}

const MAX_EVENTS = 200;

/**
 * Subscribes to the agent activity stream.
 *
 * Gives the chat a real, specific progress trace ("Wrote app/page.tsx",
 * "npm install recharts") in place of the rotating canned phrases the loading
 * component used to cycle through, and refreshes the message list the moment a
 * run finishes rather than up to two seconds later.
 */
export function useProjectStream(projectId: string, enabled = true) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    const source = new EventSource(`/api/projects/${projectId}/stream`);
    sourceRef.current = source;

    source.addEventListener("open", () => setConnected(true));

    source.addEventListener("activity", (event) => {
      try {
        const data = JSON.parse((event as MessageEvent).data) as ActivityEvent;
        // `seq` is unique per project, so this drops anything the server
        // replayed after a reconnect instead of listing the step twice.
        setEvents((prev) =>
          prev.some((e) => e.seq === data.seq)
            ? prev
            : [...prev, data].slice(-MAX_EVENTS),
        );

        if (data.type === "DONE" || data.type === "ERROR") {
          queryClient.invalidateQueries({
            queryKey: trpc.messages.getMany.queryKey({ projectId }),
          });
          queryClient.invalidateQueries({
            queryKey: trpc.projects.getFiles.queryKey({ projectId }),
          });
          queryClient.invalidateQueries({
            queryKey: trpc.preview.getSession.queryKey({ projectId }),
          });
          queryClient.invalidateQueries({ queryKey: trpc.usage.status.queryKey() });
        }
        if (data.type === "FILE_WRITE") {
          queryClient.invalidateQueries({
            queryKey: trpc.projects.getFiles.queryKey({ projectId }),
          });
        }
      } catch {
        // Malformed frame — skip it rather than tear down the stream.
      }
    });

    source.onerror = () => {
      setConnected(false);
      // EventSource reconnects on its own; nothing to do here.
    };

    return () => {
      source.close();
      sourceRef.current = null;
      setConnected(false);
    };
  }, [projectId, enabled, queryClient, trpc]);

  const clear = () => setEvents([]);

  return { events, connected, clear, latest: events[events.length - 1] ?? null };
}
