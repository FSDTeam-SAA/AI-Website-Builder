import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";
import type { FragmentSummary } from "@/modules/projects/types";
import { useProjectStream } from "@/modules/preview/hooks/use-project-stream";

import { MessageCard } from "./message-card";
import { MessageForm } from "./message-form";
import { MessageLoading } from "./message-loading";

interface Props {
  projectId: string;
  activeFragment: FragmentSummary | null;
  setActiveFragment: (fragment: FragmentSummary | null) => void;
};

export const MessagesContainer = ({ 
  projectId,
  activeFragment,
  setActiveFragment
}: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const bottomRef = useRef<HTMLDivElement>(null);
  const lastAssistantMessageIdRef = useRef<string | null>(null);

  const { data: messages } = useSuspenseQuery(
    trpc.messages.getMany.queryOptions(
      { projectId },
      {
        // The SSE stream invalidates this the moment a run finishes, so the
        // poll is only a safety net for a dropped connection — not the primary
        // update path it used to be at 2s.
        refetchInterval: 30_000,
      },
    ),
  );

  const { events } = useProjectStream(projectId);

  // A generation can run for minutes; before this there was no way to stop one
  // once it started. The Inngest functions already declare `cancelOn`.
  const cancel = useMutation({
    ...trpc.messages.cancel.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.messages.getMany.queryKey({ projectId }),
      });
      toast.success("Generation stopped");
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    const lastAssistantMessage = messages.findLast(
      (message) => message.role === "ASSISTANT"
    );

    if (
      lastAssistantMessage?.fragment &&
      lastAssistantMessage.id !== lastAssistantMessageIdRef.current
    ) {
      setActiveFragment(lastAssistantMessage.fragment);
      lastAssistantMessageIdRef.current = lastAssistantMessage.id;
    }
  }, [messages, setActiveFragment]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView();
  }, [messages.length]);

  const lastMessage = messages[messages.length - 1];
  const isLastMessageUser = lastMessage?.role === "USER";

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="pt-2 pr-1">
          {messages.map((message) => (
            <MessageCard
              key={message.id}
              content={message.content}
              projectId={projectId}
              attachments={message.attachments}
              promptTokens={message.promptTokens}
              completionTokens={message.completionTokens}
              costUsd={message.costUsd}
              role={message.role}
              fragment={message.fragment}
              createdAt={message.createdAt}
              isActiveFragment={activeFragment?.id === message.fragment?.id}
              onFragmentClick={() => setActiveFragment(message.fragment)}
              type={message.type}
            />
          ))}
          {isLastMessageUser && <MessageLoading
              events={events}
              isStopping={cancel.isPending}
              onStop={() => cancel.mutate({ projectId })}
            />}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="relative p-3 pt-1">
        <div className="absolute -top-6 left-0 right-0 h-6 bg-gradient-to-b from-transparent to-background pointer-events-none" />
        <MessageForm projectId={projectId} />
      </div>
    </div>
  );
};
