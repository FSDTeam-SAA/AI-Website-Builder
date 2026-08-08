"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { useUser } from "@clerk/nextjs";
import { formatDistanceToNow } from "date-fns";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CopyIcon,
  DownloadIcon,
  GlobeIcon,
  Loader2Icon,
  MoreVerticalIcon,
  Trash2Icon,
} from "lucide-react";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
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

export const ProjectsList = () => {
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useUser();

  const { data: projects } = useQuery(trpc.projects.getMany.queryOptions());
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(
    null,
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.projects.getMany.queryKey() });

  const duplicate = useMutation({
    ...trpc.projects.duplicate.mutationOptions(),
    onSuccess: (copy) => {
      invalidate();
      toast.success("Project duplicated");
      router.push(`/projects/${copy.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const remove = useMutation({
    ...trpc.projects.delete.mutationOptions(),
    onSuccess: () => {
      invalidate();
      setPendingDelete(null);
      toast.success("Project deleted");
    },
    onError: (e) => {
      setPendingDelete(null);
      toast.error(e.message);
    },
  });

  if (!user) return null;

  return (
    <>
      <div className="flex w-full flex-col gap-y-6 rounded-xl border bg-white p-8 sm:gap-y-4 dark:bg-sidebar">
        <h2 className="text-2xl font-semibold">{user?.firstName}&apos;s Vibes</h2>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {projects?.length === 0 && (
            <div className="col-span-full text-center">
              <p className="text-sm text-muted-foreground">No projects yet</p>
            </div>
          )}

          {projects?.map((project) => (
            <div
              key={project.id}
              className="group relative rounded-md border transition-colors hover:bg-accent/50"
            >
              <Link
                href={`/projects/${project.id}`}
                className="flex items-center gap-x-4 p-4 pr-10"
              >
                <Image
                  src="/logo.svg"
                  alt="Vibe"
                  width={32}
                  height={32}
                  className="shrink-0 object-contain"
                />
                <div className="flex min-w-0 flex-col">
                  <h3 className="flex items-center gap-1.5 truncate font-medium">
                    <span className="truncate">{project.name}</span>
                    {project.publishStatus === "LIVE" && project.isPublic && (
                      <GlobeIcon className="size-3 shrink-0 text-emerald-600" />
                    )}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {formatDistanceToNow(project.updatedAt, { addSuffix: true })}
                  </p>
                </div>
              </Link>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="absolute right-1.5 top-1/2 size-7 -translate-y-1/2 p-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100"
                    aria-label={`Actions for ${project.name}`}
                  >
                    <MoreVerticalIcon className="size-4" />
                  </Button>
                </DropdownMenuTrigger>

                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    disabled={duplicate.isPending}
                    onSelect={(e) => {
                      e.preventDefault();
                      duplicate.mutate({ projectId: project.id });
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
                    <a href={`/api/projects/${project.id}/download`} download>
                      <DownloadIcon className="size-4 text-muted-foreground" />
                      <span>Download ZIP</span>
                    </a>
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() =>
                      setPendingDelete({ id: project.id, name: project.name })
                    }
                  >
                    <Trash2Icon className="size-4" />
                    <span>Delete</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      </div>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &ldquo;{pendingDelete?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the project, its code, its version history and
              any published site. Download a ZIP first if you want to keep the code.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={remove.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (pendingDelete) remove.mutate({ projectId: pendingDelete.id });
              }}
            >
              {remove.isPending && <Loader2Icon className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
