"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronLeftIcon,
  CopyIcon,
  DownloadIcon,
  Loader2Icon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  projectId: string;
}

export const ProjectHeader = ({ projectId }: Props) => {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: project } = useSuspenseQuery(
    trpc.projects.getOne.queryOptions({ id: projectId }),
  );

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const rename = useMutation({
    ...trpc.projects.rename.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.projects.getOne.queryKey({ id: projectId }),
      });
      queryClient.invalidateQueries({ queryKey: trpc.projects.getMany.queryKey() });
      setRenameOpen(false);
      toast.success("Project renamed");
    },
    onError: (e) => toast.error(e.message),
  });

  const duplicate = useMutation({
    ...trpc.projects.duplicate.mutationOptions(),
    onSuccess: (copy) => {
      toast.success("Project duplicated");
      router.push(`/projects/${copy.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    ...trpc.projects.delete.mutationOptions(),
    onSuccess: () => {
      toast.success("Project deleted");
      router.push("/");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <header className="project-header flex min-w-0 items-center gap-2 overflow-hidden border-b bg-white/95 p-2 backdrop-blur-xl dark:bg-zinc-950/95">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="min-w-0 flex-1 justify-start overflow-hidden pl-2! transition-opacity focus-visible:ring-0 hover:bg-transparent hover:opacity-75"
          >
            <Image src="/brand/vibe-mark.png" alt="Vibe" width={18} height={18} />
            <span className="truncate text-sm font-medium">{project.name}</span>
            <ChevronDownIcon className="shrink-0" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent side="bottom" align="start" className="w-56">
          <DropdownMenuItem asChild>
            <Link href="/">
              <ChevronLeftIcon />
              <span>Go to Dashboard</span>
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => {
              setRenameValue(project.name);
              setRenameOpen(true);
            }}
          >
            <PencilIcon className="size-4 text-muted-foreground" />
            <span>Rename</span>
          </DropdownMenuItem>

          <DropdownMenuItem
            disabled={duplicate.isPending}
            onSelect={(e) => {
              e.preventDefault();
              duplicate.mutate({ projectId });
            }}
          >
            {duplicate.isPending ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <CopyIcon className="size-4 text-muted-foreground" />
            )}
            <span>Duplicate</span>
          </DropdownMenuItem>

          <DropdownMenuItem asChild>
            <a href={`/api/projects/${projectId}/download`} download>
              <DownloadIcon className="size-4 text-muted-foreground" />
              <span>Download ZIP</span>
            </a>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setDeleteOpen(true)}
          >
            <Trash2Icon className="size-4" />
            <span>Delete project</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            maxLength={80}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && renameValue.trim()) {
                rename.mutate({ projectId, name: renameValue.trim() });
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!renameValue.trim() || rename.isPending}
              onClick={() => rename.mutate({ projectId, name: renameValue.trim() })}
            >
              {rename.isPending && <Loader2Icon className="size-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{project.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the project, its code, its history and any
              published site. This cannot be undone — download a ZIP first if you
              want to keep the code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                remove.mutate({ projectId });
              }}
            >
              {remove.isPending && <Loader2Icon className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  );
};
