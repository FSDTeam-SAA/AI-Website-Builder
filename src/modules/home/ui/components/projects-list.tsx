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
  ArrowUpRightIcon,
  CopyIcon,
  DownloadIcon,
  FolderOpenIcon,
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
      <section className="w-full py-8 sm:py-12">
        <div className="overflow-hidden rounded-[2rem] border border-zinc-200/80 bg-white/75 shadow-[0_24px_70px_-50px_rgba(15,23,42,0.5)] backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.035]">
          <header className="flex flex-col gap-4 border-b border-zinc-200/70 px-6 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-8 dark:border-white/10">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-300">
                <FolderOpenIcon className="size-5" />
              </span>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-indigo-600 dark:text-indigo-300">
                  Your workspace
                </p>
                <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-zinc-950 dark:text-white">
                  {user?.firstName}&apos;s projects
                </h2>
              </div>
            </div>
            <span className="w-fit rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs font-medium text-zinc-500 shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
              {projects?.length ?? 0} {(projects?.length ?? 0) === 1 ? "project" : "projects"}
            </span>
          </header>

          <div className="grid grid-cols-1 gap-4 p-6 sm:grid-cols-2 sm:p-8 lg:grid-cols-3">
            {projects?.length === 0 && (
              <div className="col-span-full flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/70 px-6 text-center dark:border-white/15 dark:bg-white/[0.025]">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-white/5 dark:ring-white/10">
                  <Image src="/brand/vibe-mark.png" alt="" width={32} height={32} />
                </span>
                <h3 className="mt-4 font-semibold text-zinc-900 dark:text-white">Your next idea starts above</h3>
                <p className="mt-1 max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
                  Describe a project and it will appear here, ready to revisit anytime.
                </p>
              </div>
            )}

            {projects?.map((project) => (
              <article
                key={project.id}
                className="group relative min-h-48 overflow-hidden rounded-2xl border border-zinc-200/80 bg-white transition-all duration-300 hover:-translate-y-1 hover:border-indigo-200 hover:shadow-[0_20px_45px_-30px_rgba(79,70,229,0.45)] dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-indigo-400/30"
              >
                <Link href={`/projects/${project.id}`} className="flex h-full flex-col p-5">
                  <div className="flex items-start justify-between pr-8">
                    <span className="flex size-11 items-center justify-center rounded-2xl bg-zinc-50 ring-1 ring-zinc-200/80 transition-transform duration-300 group-hover:rotate-3 group-hover:scale-105 dark:bg-white/5 dark:ring-white/10">
                      <Image
                        src="/brand/vibe-mark.png"
                        alt=""
                        width={30}
                        height={30}
                        className="object-contain"
                      />
                    </span>
                    {project.publishStatus === "LIVE" && project.isPublic && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300">
                        <GlobeIcon className="size-3" />
                        Live
                      </span>
                    )}
                  </div>
                  <div className="mt-auto pt-8">
                    <h3 className="truncate font-semibold tracking-tight text-zinc-900 dark:text-white">
                      {project.name}
                    </h3>
                    <div className="mt-2 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
                      <span>{formatDistanceToNow(project.updatedAt, { addSuffix: true })}</span>
                      <ArrowUpRightIcon className="size-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-indigo-600 dark:group-hover:text-indigo-300" />
                    </div>
                  </div>
                </Link>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="absolute right-3 top-3 size-8 rounded-full p-0 text-zinc-500 opacity-100 transition-all hover:bg-zinc-100 sm:opacity-0 sm:group-hover:opacity-100 data-[state=open]:bg-zinc-100 data-[state=open]:opacity-100 dark:hover:bg-white/10 dark:data-[state=open]:bg-white/10"
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
              </article>
            ))}
          </div>
        </div>
      </section>

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
