"use client";

import { useEffect, useRef, useState } from "react";
import { CornerDownLeftIcon, FileCodeIcon, Loader2Icon, SparklesIcon, XIcon } from "lucide-react";
import TextareaAutosize from "react-textarea-autosize";

import { Button } from "@/components/ui/button";
import { describeLocator, type VibeElementLocator } from "@/modules/preview/protocol";

interface Props {
  locator: VibeElementLocator;
  sourcePath: string | null;
  sourceLine: number | null;
  isSubmitting: boolean;
  onSubmit: (instruction: string) => void;
  onDismiss: () => void;
}

/**
 * Docked action bar for the currently selected element.
 *
 * Deliberately docked rather than anchored to the element: an anchored popover
 * would need the iframe's scroll position mirrored into parent coordinates on
 * every frame, and drifts the moment anything inside the preview scrolls.
 */
export const SelectionPanel = ({
  locator,
  sourcePath,
  sourceLine,
  isSubmitting,
  onSubmit,
  onDismiss,
}: Props) => {
  const [instruction, setInstruction] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // A fresh selection means a fresh instruction.
  useEffect(() => {
    setInstruction("");
    inputRef.current?.focus();
  }, [locator.nodeId]);

  const submit = () => {
    const value = instruction.trim();
    if (!value || isSubmitting) return;
    onSubmit(value);
    setInstruction("");
  };

  return (
    <div className="border-t bg-background p-3 shadow-[0_-4px_12px_-8px_rgba(0,0,0,.3)]">
      <div className="mb-2 flex items-center gap-2">
        <span className="rounded-md bg-primary/10 px-2 py-1 font-mono text-xs font-medium text-primary">
          {describeLocator(locator)}
        </span>
        {sourcePath && (
          <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
            <FileCodeIcon className="size-3 shrink-0" />
            <span className="truncate">
              {sourcePath}
              {sourceLine ? `:${sourceLine}` : ""}
            </span>
          </span>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto h-6 px-2"
          onClick={onDismiss}
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>

      <div className="relative rounded-lg border p-2 transition-colors focus-within:border-primary">
        <TextareaAutosize
          ref={inputRef}
          minRows={1}
          maxRows={5}
          value={instruction}
          disabled={isSubmitting}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="Describe the change to this element…"
          className="w-full resize-none bg-transparent pr-10 text-sm outline-none disabled:opacity-60"
        />
        <Button
          size="sm"
          className="absolute bottom-2 right-2 size-7 p-0"
          disabled={!instruction.trim() || isSubmitting}
          onClick={submit}
        >
          {isSubmitting ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <CornerDownLeftIcon className="size-3.5" />
          )}
        </Button>
      </div>

      <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
        <SparklesIcon className="size-3" />
        Only this element will be changed.
      </p>
    </div>
  );
};
