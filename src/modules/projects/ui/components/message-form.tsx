"use client";

import { z } from "zod";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import TextareaAutosize from "react-textarea-autosize";
import {
  ArrowUpIcon,
  FileCodeIcon,
  ImageIcon,
  Loader2Icon,
  MousePointerClickIcon,
  XIcon,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Form, FormField } from "@/components/ui/form";
import { describeLocator } from "@/modules/preview/protocol";
import { usePreviewWorkspace } from "@/modules/preview/workspace-context";

import { useAttachments } from "../hooks/use-attachments";
import { HistoryDialog } from "./history-dialog";
import { ModelPicker } from "./model-picker";
import { TokenMeter } from "./token-meter";
import { Usage } from "./usage";

interface Props {
  projectId: string;
}

const formSchema = z.object({
  value: z
    .string()
    .min(1, { message: "Value is required" })
    .max(10000, { message: "Value is too long" }),
});

export const MessageForm = ({ projectId }: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const { data: usage } = useQuery(trpc.usage.status.queryOptions());
  const { attachments, isUploading, upload, remove, clear, onPaste } =
    useAttachments(projectId);
  const { selection, clearSelection } = usePreviewWorkspace();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { value: "" },
  });

  const invalidateChat = () => {
    queryClient.invalidateQueries(trpc.messages.getMany.queryOptions({ projectId }));
    queryClient.invalidateQueries(trpc.usage.status.queryOptions());
  };

  const createMessage = useMutation(
    trpc.messages.create.mutationOptions({
      onSuccess: () => {
        form.reset();
        clear();
        invalidateChat();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const requestAiEdit = useMutation(
    trpc.preview.requestAiEdit.mutationOptions({
      onSuccess: () => {
        form.reset();
        // One selection, one edit — leaving it attached would silently aim the
        // next unrelated message at the same element.
        clearSelection();
        invalidateChat();
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    if (selection) {
      await requestAiEdit.mutateAsync({
        projectId,
        instruction: values.value,
        locator: selection.locator,
      });
      return;
    }

    await createMessage.mutateAsync({
      value: values.value,
      projectId,
      attachmentIds: attachments.map((a) => a.id),
    });
  };

  // Picking an element happens in the other panel; land the caret here so the
  // instruction can be typed without a second click.
  const selectedNodeId = selection?.locator.nodeId ?? null;
  useEffect(() => {
    if (selectedNodeId) textareaRef.current?.focus();
  }, [selectedNodeId]);

  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isPending = createMessage.isPending || requestAiEdit.isPending;
  const isButtonDisabled = isPending || isUploading || !form.formState.isValid;
  const showUsage = !!usage;

  return (
    <Form {...form}>
      {showUsage && (
        <Usage
          points={usage.remainingPoints}
          msBeforeNext={usage.msBeforeNext}
          unlimited={usage.unlimited}
        />
      )}

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        onPaste={onPaste}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          // Ignore drags moving between child elements.
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setIsDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.files.length) return;
          e.preventDefault();
          setIsDragging(false);
          void upload(Array.from(e.dataTransfer.files));
        }}
        className={cn(
          "relative rounded-xl border border-zinc-200 bg-white p-4 pt-1 transition-all dark:border-zinc-800 dark:bg-zinc-900",
          isFocused && "border-indigo-400 shadow-sm ring-4 ring-indigo-500/10 dark:border-indigo-500",
          showUsage && "rounded-t-none",
          isDragging && "border-primary bg-primary/5",
          selection && "border-primary/50",
        )}
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/5 text-sm font-medium text-primary">
            Drop an image to attach it
          </div>
        )}

        {selection && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2 py-1.5">
            <MousePointerClickIcon className="size-3.5 shrink-0 text-primary" />
            <span className="max-w-[55%] truncate font-mono text-xs font-medium text-primary">
              {describeLocator(selection.locator)}
            </span>
            {selection.sourcePath && (
              <span className="hidden min-w-0 items-center gap-1 text-[11px] text-muted-foreground sm:flex">
                <FileCodeIcon className="size-3 shrink-0" />
                <span className="truncate">
                  {selection.sourcePath}
                  {selection.sourceLine ? `:${selection.sourceLine}` : ""}
                </span>
              </span>
            )}
            <button
              type="button"
              onClick={clearSelection}
              disabled={isPending}
              aria-label="Clear selected element"
              className="ml-auto shrink-0 rounded-md p-0.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground disabled:opacity-50"
            >
              <XIcon className="size-3.5" />
            </button>
          </div>
        )}

        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-3">
            {attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="group relative size-16 overflow-hidden rounded-md border bg-background"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachment.previewUrl}
                  alt={attachment.name}
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => remove(attachment.id)}
                  disabled={isPending}
                  aria-label={`Remove ${attachment.name}`}
                  className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-0"
                >
                  <XIcon className="size-3" />
                </button>
              </div>
            ))}
            {isUploading && (
              <div className="flex size-16 items-center justify-center rounded-md border bg-muted">
                <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        )}

        <FormField
          control={form.control}
          name="value"
          render={({ field }) => (
            <TextareaAutosize
              {...field}
              ref={(element) => {
                field.ref(element);
                textareaRef.current = element;
              }}
              disabled={isPending}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              minRows={2}
              maxRows={8}
              className="w-full resize-none border-none bg-transparent pt-4 outline-none"
              placeholder={
                selection
                  ? "Describe the change to this element…"
                  : attachments.length
                    ? "Describe what to do with this image…"
                    : "What would you like to build?"
              }
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  form.handleSubmit(onSubmit)(e);
                }
              }}
            />
          )}
        />

        {/* Model, history and usage sit with the composer rather than in the
            project header: they are decisions you make about the message you
            are typing, and the header is on the far side of the panel. */}
        <div className="composer-toolbar flex items-end justify-between gap-x-2 pt-2">
          <div className="flex min-w-0 items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                if (files.length) void upload(files);
                e.target.value = "";
              }}
            />
            {/* A targeted edit carries the element, not images — the surgical
                path has no vision pre-pass to feed them to. */}
            <Hint
              text={selection ? "Not available for element edits" : "Attach an image"}
              side="top"
              align="start"
            >
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="size-7 p-0"
                disabled={isPending || isUploading || !!selection}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="size-4" />
              </Button>
            </Hint>

            <ModelPicker projectId={projectId} />
            <HistoryDialog projectId={projectId} />
            <TokenMeter projectId={projectId} />

            <span className="composer-hint whitespace-nowrap pl-1 font-mono text-[10px] text-muted-foreground">
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span>&#8984;</span>Enter
              </kbd>
              &nbsp;to submit
            </span>
          </div>

          <Button
            disabled={isButtonDisabled}
            className={cn(
              "size-8 rounded-full bg-indigo-600 text-white hover:bg-indigo-500",
              isButtonDisabled && "border bg-muted-foreground",
            )}
          >
            {isPending ? <Loader2Icon className="size-4 animate-spin" /> : <ArrowUpIcon />}
          </Button>
        </div>
      </form>
    </Form>
  );
};
