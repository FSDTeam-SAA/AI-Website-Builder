import Image from "next/image";
import { format } from "date-fns";
import { ChevronRightIcon, Code2Icon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { formatCost, formatTokens } from "@/lib/ai/format";
import { Card } from "@/components/ui/card";
import { MessageRole, MessageType } from "@/generated/prisma";
import type { FragmentSummary } from "@/modules/projects/types";

export interface MessageAttachment {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
}

interface UserMessageProps {
  content: string;
  projectId: string;
  attachments?: MessageAttachment[];
}

const UserMessage = ({ content, projectId, attachments }: UserMessageProps) => {
  return (
    <div className="flex justify-end pb-4 pl-10 pr-2">
      <Card className="max-w-[80%] break-words rounded-lg border-none bg-muted p-3 shadow-none">
        {!!attachments?.length && (
          <div className="mb-2 flex flex-wrap gap-2">
            {attachments.map((attachment) => (
              <a
                key={attachment.id}
                href={`/api/projects/${projectId}/attachments/${attachment.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block overflow-hidden rounded-md border transition-opacity hover:opacity-80"
              >
                {/* Served from an owner-scoped route, so next/image can't optimise it. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/projects/${projectId}/attachments/${attachment.id}`}
                  alt={attachment.name}
                  className="max-h-40 max-w-full object-contain"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        )}
        {/* User text stays literal — they may paste code or markdown syntax. */}
        <span className="whitespace-pre-wrap">{content}</span>
      </Card>
    </div>
  );
};

interface FragmentCardProps {
  fragment: FragmentSummary;
  isActiveFragment: boolean;
  onFragmentClick: (fragment: FragmentSummary) => void;
};

const FragmentCard = ({
  fragment,
  isActiveFragment,
  onFragmentClick,
}: FragmentCardProps) => {
  return (
    <button
      className={cn(
        "flex items-start text-start gap-2 border rounded-lg bg-muted w-fit p-3 hover:bg-secondary transition-colors",
        isActiveFragment && 
          "bg-primary text-primary-foreground border-primary hover:bg-primary",
      )}
      onClick={() => onFragmentClick(fragment)}
    >
      <Code2Icon className="size-4 mt-0.5" />
      <div className="flex flex-col flex-1">
        <span className="text-sm font-medium line-clamp-1">
          {fragment.title}
        </span>
        <span className="text-sm">Preview</span>
      </div>
      <div className="flex items-center justify-center mt-0.5">
        <ChevronRightIcon className="size-4" />
      </div>
    </button>
  );
};

interface AssistantMessageProps {
  content: string;
  fragment: FragmentSummary | null;
  createdAt: Date;
  isActiveFragment: boolean;
  onFragmentClick: (fragment: FragmentSummary) => void;
  type: MessageType;
  promptTokens?: number | null;
  completionTokens?: number | null;
  costUsd?: number | null;
}

const AssistantMessage = ({
  content,
  fragment,
  createdAt,
  isActiveFragment,
  onFragmentClick,
  type,
  promptTokens,
  completionTokens,
  costUsd,
}: AssistantMessageProps) => {
  return (
    <div className={cn(
      "flex flex-col group px-2 pb-4",
      type === "ERROR" && "text-red-700 dark:text-red-500",
    )}>
      <div className="flex items-center gap-2 pl-2 mb-2">
        <Image
          src="/logo.svg"
          alt="Vibe"
          width={18}
          height={18}
          className="shrink-0"
        />
        <span className="text-sm font-medium">Vibe</span>
        <span className="text-xs text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
          {format(createdAt, "HH:mm 'on' MMM dd, yyyy")}
        </span>
        {!!(promptTokens || completionTokens) && (
          <span
            className="font-mono text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
            title={`${promptTokens ?? 0} prompt + ${completionTokens ?? 0} completion tokens · estimated cost`}
          >
            {formatTokens((promptTokens ?? 0) + (completionTokens ?? 0))} tok
            {typeof costUsd === "number" && ` · ${formatCost(costUsd)}`}
          </span>
        )}
      </div>
      <div className="pl-8.5 flex flex-col gap-y-4">
        <Markdown>{content}</Markdown>
        {fragment && type === "RESULT" && (
          <FragmentCard
            fragment={fragment}
            isActiveFragment={isActiveFragment}
            onFragmentClick={onFragmentClick}
          />
        )}
      </div>
    </div>
  )
};

interface MessageCardProps {
  content: string;
  projectId: string;
  attachments?: MessageAttachment[];
  role: MessageRole;
  fragment: FragmentSummary | null;
  createdAt: Date;
  isActiveFragment: boolean;
  onFragmentClick: (fragment: FragmentSummary) => void;
  type: MessageType;
  promptTokens?: number | null;
  completionTokens?: number | null;
  costUsd?: number | null;
}

export const MessageCard = ({
  content,
  projectId,
  attachments,
  role,
  fragment,
  createdAt,
  isActiveFragment,
  onFragmentClick,
  type,
  promptTokens,
  completionTokens,
  costUsd,
}: MessageCardProps) => {
  if (role === "ASSISTANT") {
    return (
      <AssistantMessage
        content={content}
        fragment={fragment}
        createdAt={createdAt}
        isActiveFragment={isActiveFragment}
        onFragmentClick={onFragmentClick}
        type={type}
        promptTokens={promptTokens}
        completionTokens={completionTokens}
        costUsd={costUsd}
      />
    );
  }

  return (
    <UserMessage content={content} projectId={projectId} attachments={attachments} />
  );
};
