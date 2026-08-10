import Image from "next/image";
import { format } from "date-fns";
import {
  ChevronRightIcon,
  Code2Icon,
  MousePointerClickIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Markdown } from "@/components/markdown";
import { formatTokens } from "@/lib/ai/format";
import { Card } from "@/components/ui/card";
// Types only. Importing these enums as values pulls the Prisma client into the
// client bundle, which is a build break — this file renders inside "use client".
import type { MessageKind, MessageType } from "@/generated/prisma";
import type { FragmentSummary, ProjectMessage } from "@/modules/projects/types";

import { MessageActivity } from "./message-activity";
import { MessageVersion, type MessageCheckpoint } from "./message-version";

export interface MessageAttachment {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
}

/**
 * A targeted edit stores what the user clicked in `Message.metadata` so the
 * bubble stays human-readable. Read defensively: it is untyped JSON, and rows
 * written before the field existed have none.
 */
function readTargetLabel(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const target = (metadata as { target?: unknown }).target;
  return typeof target === "string" && target.trim() ? target.trim() : null;
}

/** `"app/page.tsx:42:7"` -> `"app/page.tsx:42"`; the column is noise here. */
function readTargetSource(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const locator = (metadata as { locator?: { loc?: unknown } }).locator;
  const loc = locator?.loc;
  if (typeof loc !== "string") return null;
  const match = loc.match(/^(.*):(\d+):\d+$/);
  return match ? `${match[1]}:${match[2]}` : loc;
}

interface UserMessageProps {
  content: string;
  projectId: string;
  attachments?: MessageAttachment[];
  kind: MessageKind;
  metadata: unknown;
}

const UserMessage = ({
  content,
  projectId,
  attachments,
  kind,
  metadata,
}: UserMessageProps) => {
  const targetLabel = readTargetLabel(metadata);
  const targetSource = readTargetSource(metadata);

  return (
    <div className="flex justify-end pb-4 pl-10 pr-2">
      <Card className="max-w-[80%] break-words rounded-lg border border-indigo-100 bg-indigo-50/70 p-3 shadow-none dark:border-indigo-400/15 dark:bg-indigo-400/10">
        {/* What the message was aimed at. Without this a targeted edit reads as
            a bare instruction with no clue which element it changed. */}
        {kind === "TARGETED_EDIT" && targetLabel && (
          <div className="mb-2 flex flex-col gap-0.5 border-b pb-2">
            <span className="flex items-center gap-1.5">
              <MousePointerClickIcon className="size-3 shrink-0 text-primary" />
              <span className="truncate font-mono text-[11px] font-medium text-primary">
                {targetLabel}
              </span>
            </span>
            {targetSource && (
              <span className="truncate pl-[18px] font-mono text-[10px] text-muted-foreground">
                {targetSource}
              </span>
            )}
          </div>
        )}

        {kind === "FIX_ERROR" && (
          <div className="mb-2 flex items-center gap-1.5 border-b pb-2">
            <TriangleAlertIcon className="size-3 shrink-0 text-amber-600" />
            <span className="text-[11px] font-medium text-muted-foreground">
              Fix requested from the console
            </span>
          </div>
        )}

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
        "flex w-fit items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-start transition-colors hover:bg-indigo-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-indigo-400/10",
        isActiveFragment &&
          "border-indigo-600 bg-indigo-600 text-white hover:bg-indigo-600 dark:border-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-500",
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
  projectId: string;
  fragment: FragmentSummary | null;
  createdAt: Date;
  isActiveFragment: boolean;
  onFragmentClick: (fragment: FragmentSummary) => void;
  type: MessageType;
  promptTokens?: number | null;
  completionTokens?: number | null;
  version: number | null;
  checkpoint: MessageCheckpoint | null;
  isCurrentVersion: boolean;
  runMessageId: string | null;
  activitySteps: number;
}

const AssistantMessage = ({
  content,
  projectId,
  fragment,
  createdAt,
  isActiveFragment,
  onFragmentClick,
  type,
  promptTokens,
  completionTokens,
  version,
  checkpoint,
  isCurrentVersion,
  runMessageId,
  activitySteps,
}: AssistantMessageProps) => {
  return (
    <div className={cn(
      "flex flex-col group px-2 pb-4",
      type === "ERROR" && "text-red-700 dark:text-red-500",
    )}>
      <div className="flex items-center gap-2 pl-2 mb-2">
        <Image
          src="/brand/vibe-mark.png"
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
            title={`${promptTokens ?? 0} prompt + ${completionTokens ?? 0} completion tokens`}
          >
            {formatTokens((promptTokens ?? 0) + (completionTokens ?? 0))} tokens
          </span>
        )}
      </div>
      <div className="pl-8.5 flex flex-col gap-y-4">
        {/* Above the reply, the way the steps appeared while they ran. */}
        {runMessageId && activitySteps > 0 && (
          <MessageActivity
            projectId={projectId}
            runMessageId={runMessageId}
            stepCount={activitySteps}
          />
        )}
        <Markdown>{content}</Markdown>
        {fragment && type === "RESULT" && (
          <FragmentCard
            fragment={fragment}
            isActiveFragment={isActiveFragment}
            onFragmentClick={onFragmentClick}
          />
        )}
        {version !== null && (
          <MessageVersion
            projectId={projectId}
            version={version}
            checkpoint={checkpoint}
            isCurrentVersion={isCurrentVersion}
          />
        )}
      </div>
    </div>
  )
};

interface MessageCardProps {
  message: ProjectMessage;
  projectId: string;
  isActiveFragment: boolean;
  onFragmentClick: (fragment: FragmentSummary) => void;
}

export const MessageCard = ({
  message,
  projectId,
  isActiveFragment,
  onFragmentClick,
}: MessageCardProps) => {
  if (message.role === "ASSISTANT") {
    return (
      <AssistantMessage
        content={message.content}
        projectId={projectId}
        fragment={message.fragment}
        createdAt={message.createdAt}
        isActiveFragment={isActiveFragment}
        onFragmentClick={onFragmentClick}
        type={message.type}
        promptTokens={message.promptTokens}
        completionTokens={message.completionTokens}
        version={message.version}
        checkpoint={message.checkpoint}
        isCurrentVersion={message.isCurrentVersion}
        runMessageId={message.runMessageId}
        activitySteps={message.activitySteps}
      />
    );
  }

  return (
    <UserMessage
      content={message.content}
      projectId={projectId}
      attachments={message.attachments}
      kind={message.kind}
      metadata={message.metadata}
    />
  );
};
