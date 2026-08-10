"use client";

import { ArrowLeftIcon, FileCodeIcon, MousePointerClickIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { describeLocator, type VibeElementLocator } from "@/modules/preview/protocol";

interface Props {
  locator: VibeElementLocator;
  sourcePath: string | null;
  sourceLine: number | null;
  onDismiss: () => void;
}

/**
 * Read-only banner for the currently selected element.
 *
 * The instruction box used to live here, which gave the app two composers doing
 * the same job — and the one you were typing in was on the opposite side of the
 * screen from the conversation it joined. The chat composer now owns targeted
 * edits; this only has to say what is selected and where it lives.
 *
 * Still docked rather than anchored to the element: an anchored popover would
 * need the iframe's scroll position mirrored into parent coordinates on every
 * frame, and drifts the moment anything inside the preview scrolls.
 */
export const SelectionPanel = ({ locator, sourcePath, sourceLine, onDismiss }: Props) => {
  return (
    <div className="flex items-center gap-2 border-t bg-background px-3 py-2 shadow-[0_-4px_12px_-8px_rgba(0,0,0,.3)]">
      <MousePointerClickIcon className="size-3.5 shrink-0 text-primary" />

      <span className="max-w-[45%] truncate rounded-md bg-primary/10 px-2 py-1 font-mono text-xs font-medium text-primary">
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

      <span className="ml-auto hidden shrink-0 items-center gap-1 text-xs text-muted-foreground md:flex">
        <ArrowLeftIcon className="size-3" />
        Describe the change in the chat
      </span>

      <Button
        size="sm"
        variant="ghost"
        className="ml-auto h-6 shrink-0 px-2 md:ml-2"
        onClick={onDismiss}
        aria-label="Clear selection"
      >
        <XIcon className="size-3.5" />
      </Button>
    </div>
  );
};
