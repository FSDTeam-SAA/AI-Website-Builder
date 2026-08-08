"use client";

import { z } from "zod";
import { toast } from "sonner";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import TextareaAutosize from "react-textarea-autosize";
import { ArrowUpIcon, ImageIcon, Loader2Icon, XIcon } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { Hint } from "@/components/hint";
import { Button } from "@/components/ui/button";
import { Form, FormField } from "@/components/ui/form";

import { useAttachments } from "../hooks/use-attachments";
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

  const { data: usage } = useQuery(trpc.usage.status.queryOptions());
  const { attachments, isUploading, upload, remove, clear, onPaste } =
    useAttachments(projectId);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { value: "" },
  });

  const createMessage = useMutation(
    trpc.messages.create.mutationOptions({
      onSuccess: () => {
        form.reset();
        clear();
        queryClient.invalidateQueries(
          trpc.messages.getMany.queryOptions({ projectId }),
        );
        queryClient.invalidateQueries(trpc.usage.status.queryOptions());
      },
      onError: (error) => toast.error(error.message),
    }),
  );

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    await createMessage.mutateAsync({
      value: values.value,
      projectId,
      attachmentIds: attachments.map((a) => a.id),
    });
  };

  const [isFocused, setIsFocused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const isPending = createMessage.isPending;
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
          "relative rounded-xl border bg-sidebar p-4 pt-1 transition-all dark:bg-sidebar",
          isFocused && "shadow-xs",
          showUsage && "rounded-t-none",
          isDragging && "border-primary bg-primary/5",
        )}
      >
        {isDragging && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/5 text-sm font-medium text-primary">
            Drop an image to attach it
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
              disabled={isPending}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              minRows={2}
              maxRows={8}
              className="w-full resize-none border-none bg-transparent pt-4 outline-none"
              placeholder={
                attachments.length
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

        <div className="flex items-end justify-between gap-x-2 pt-2">
          <div className="flex items-center gap-2">
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
            <Hint text="Attach an image" side="top" align="start">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="size-7 p-0"
                disabled={isPending || isUploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="size-4" />
              </Button>
            </Hint>

            <span className="font-mono text-[10px] text-muted-foreground">
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                <span>&#8984;</span>Enter
              </kbd>
              &nbsp;to submit
            </span>
          </div>

          <Button
            disabled={isButtonDisabled}
            className={cn(
              "size-8 rounded-full",
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
