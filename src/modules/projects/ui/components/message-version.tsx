"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2Icon, RotateCcwIcon } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { usePreviewWorkspace } from "@/modules/preview/workspace-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export interface MessageCheckpoint {
  id: string;
  label: string;
  fileCount: number;
}

interface Props {
  projectId: string;
  version: number;
  checkpoint: MessageCheckpoint | null;
  isCurrentVersion: boolean;
}

/**
 * Per-turn version tag with a one-click revert.
 *
 * The same restore the History dialog offers, put where a bad turn is actually
 * noticed. Without it the only way back from a generation that made things
 * worse was to ask the model to undo it, which usually compounded the problem.
 */
export const MessageVersion = ({
  projectId,
  version,
  checkpoint,
  isCurrentVersion,
}: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { reloadPreview } = usePreviewWorkspace();
  const [confirming, setConfirming] = useState(false);

  const restore = useMutation({
    ...trpc.projects.restoreCheckpoint.mutationOptions(),
    onSuccess: (result) => {
      setConfirming(false);
      queryClient.invalidateQueries({
        queryKey: trpc.messages.getMany.queryKey({ projectId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.projects.getFiles.queryKey({ projectId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.projects.listCheckpoints.queryKey({ projectId }),
      });
      // A static export has no hot reload, and even a Next app can miss a Fast
      // Refresh — a restore produces no run, so nothing else repaints the frame.
      reloadPreview();
      toast.success(
        `Restored v${version} — ${result.updated} file(s) changed, ${result.deleted} removed.`,
      );
    },
    onError: (error) => {
      setConfirming(false);
      toast.error(error.message);
    },
  });

  return (
    <>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium">
          v{version}
        </span>

        {isCurrentVersion ? (
          <span>Current version</span>
        ) : checkpoint ? (
          <Button
            size="sm"
            variant="ghost"
            // Deliberately not hover-only like the timestamp: reverting is the
            // point of the row, and hover states do not exist on touch.
            className="h-6 px-2 text-xs"
            disabled={restore.isPending}
            onClick={() => setConfirming(true)}
          >
            {restore.isPending ? (
              <Loader2Icon className="size-3 animate-spin" />
            ) : (
              <RotateCcwIcon className="size-3" />
            )}
            Restore this version
          </Button>
        ) : (
          <span title="Older snapshots are trimmed to keep history small.">
            Snapshot no longer available
          </span>
        )}
      </div>

      <AlertDialog open={confirming} onOpenChange={(open) => !open && setConfirming(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore version {version}?</AlertDialogTitle>
            <AlertDialogDescription>
              Your files go back to how they were after this step
              {checkpoint ? ` (${checkpoint.fileCount} files)` : ""}. Anything created
              since then is removed. The current state is saved first, so you can come
              forward again from History.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restore.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={restore.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (checkpoint) {
                  restore.mutate({ projectId, checkpointId: checkpoint.id });
                }
              }}
            >
              {restore.isPending && <Loader2Icon className="size-4 animate-spin" />}
              Restore
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
