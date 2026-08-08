"use client";

import { useState } from "react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookmarkIcon,
  DownloadIcon,
  HistoryIcon,
  Loader2Icon,
  RotateCcwIcon,
  SparklesIcon,
  UndoIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

interface Props {
  projectId: string;
}

const KIND_META: Record<string, { label: string; icon: React.ElementType; tone: string }> = {
  TURN: { label: "Build", icon: SparklesIcon, tone: "text-muted-foreground" },
  MANUAL: { label: "Saved", icon: BookmarkIcon, tone: "text-primary" },
  PRE_RESTORE: { label: "Before restore", icon: UndoIcon, tone: "text-amber-600" },
  AUTO: { label: "Auto", icon: HistoryIcon, tone: "text-muted-foreground" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Version history with restore.
 *
 * `Project.files` is overwritten in place on every turn, so before this the
 * only way back from a bad generation was to ask the model to undo it — which
 * often compounded the problem.
 */
export const HistoryDialog = ({ projectId }: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<{ id: string; label: string } | null>(null);

  const { data: checkpoints, isLoading } = useQuery({
    ...trpc.projects.listCheckpoints.queryOptions({ projectId }),
    enabled: open,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: trpc.projects.listCheckpoints.queryKey({ projectId }),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.projects.getFiles.queryKey({ projectId }),
    });
    queryClient.invalidateQueries({
      queryKey: trpc.messages.getMany.queryKey({ projectId }),
    });
  };

  const save = useMutation({
    ...trpc.projects.createCheckpoint.mutationOptions(),
    onSuccess: () => {
      invalidate();
      toast.success("Checkpoint saved");
    },
    onError: (e) => toast.error(e.message),
  });

  const restore = useMutation({
    ...trpc.projects.restoreCheckpoint.mutationOptions(),
    onSuccess: (result) => {
      invalidate();
      setPending(null);
      setOpen(false);
      toast.success(
        `Restored — ${result.updated} file(s) changed, ${result.deleted} removed.`,
      );
    },
    onError: (e) => {
      setPending(null);
      toast.error(e.message);
    },
  });

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="ghost" className="h-7 px-2">
            <HistoryIcon className="size-4" />
            <span className="hidden lg:inline">History</span>
          </Button>
        </DialogTrigger>

        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Version history</DialogTitle>
            <DialogDescription>
              Every build is saved automatically. Restoring rolls your files back —
              and saves the current state first, so you can always come forward again.
            </DialogDescription>
          </DialogHeader>

          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={save.isPending}
            onClick={() => save.mutate({ projectId })}
          >
            {save.isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <BookmarkIcon className="size-4" />
            )}
            Save a checkpoint now
          </Button>

          <ScrollArea className="max-h-[22rem]">
            {isLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
            ) : !checkpoints?.length ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No history yet. Your first build will create one.
              </p>
            ) : (
              <ul className="divide-y">
                {checkpoints.map((cp, index) => {
                  const meta = KIND_META[cp.kind] ?? KIND_META.AUTO;
                  const Icon = meta.icon;
                  const isCurrent = index === 0;

                  return (
                    <li key={cp.id} className="group flex items-start gap-3 py-2.5">
                      <Icon className={cn("mt-0.5 size-4 shrink-0", meta.tone)} />

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{cp.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {meta.label} ·{" "}
                          {formatDistanceToNow(cp.createdAt, { addSuffix: true })} ·{" "}
                          {cp.fileCount} files · {formatBytes(cp.sizeBytes)}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          asChild
                        >
                          <a
                            href={`/api/projects/${projectId}/download?checkpointId=${cp.id}`}
                            title="Download this version"
                          >
                            <DownloadIcon className="size-3.5" />
                          </a>
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          disabled={isCurrent || restore.isPending}
                          onClick={() => setPending({ id: cp.id, label: cp.label })}
                        >
                          <RotateCcwIcon className="size-3.5" />
                          Restore
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore &ldquo;{pending?.label}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Your files will be rolled back to this point. Anything created since then
              will be removed. The current state is saved first, so this is reversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restore.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={restore.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (pending) restore.mutate({ projectId, checkpointId: pending.id });
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
