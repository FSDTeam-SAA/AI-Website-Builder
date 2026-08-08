"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CopyCheckIcon,
  CopyIcon,
  FilePlusIcon,
  LockIcon,
  Loader2Icon,
  PencilIcon,
  SaveIcon,
  Trash2Icon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Hint } from "@/components/hint";
import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeEditor } from "@/components/code-editor";
import { convertFilesToTreeItems } from "@/lib/utils";
import { isProtectedPath } from "@/lib/file-paths";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

import { TreeView } from "./tree-view";

type FileCollection = { [path: string]: string };

interface FileBreadcrumbProps {
  filePath: string;
}

const FileBreadcrumb = ({ filePath }: FileBreadcrumbProps) => {
  const segments = filePath.split("/");
  const maxSegments = 4;

  if (segments.length <= maxSegments) {
    return (
      <Breadcrumb>
        <BreadcrumbList>
          {segments.map((segment, index) => {
            const isLast = index === segments.length - 1;
            return (
              <Fragment key={index}>
                <BreadcrumbItem>
                  {isLast ? (
                    <BreadcrumbPage className="font-medium">{segment}</BreadcrumbPage>
                  ) : (
                    <span className="text-muted-foreground">{segment}</span>
                  )}
                </BreadcrumbItem>
                {!isLast && <BreadcrumbSeparator />}
              </Fragment>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    );
  }

  return (
    <Breadcrumb>
      <BreadcrumbList>
        <BreadcrumbItem>
          <span className="text-muted-foreground">{segments[0]}</span>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbEllipsis />
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbPage className="font-medium">{segments.at(-1)}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  );
};

interface FileExplorerProps {
  files: FileCollection;
  /** Omit to render a read-only viewer (e.g. for a historical snapshot). */
  projectId?: string;
  /** True while an agent run is writing; editing is locked to avoid clobbering. */
  isGenerating?: boolean;
}

export const FileExplorer = ({ files, projectId, isGenerating }: FileExplorerProps) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [copied, setCopied] = useState(false);
  const [draft, setDraft] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [newFilePath, setNewFilePath] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renamePath, setRenamePath] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const paths = useMemo(() => Object.keys(files).sort(), [files]);

  // Keep a valid selection as the tree changes underneath us.
  useEffect(() => {
    if (selectedFile && files[selectedFile] !== undefined) return;
    setSelectedFile(
      paths.find((p) => p === "app/page.tsx") ?? paths[0] ?? null,
    );
  }, [paths, selectedFile, files]);

  const treeData = useMemo(() => convertFilesToTreeItems(files), [files]);

  const editable = !!projectId && !isGenerating;
  const protectedFile = selectedFile ? isProtectedPath(selectedFile) : false;
  const readOnly = !editable || protectedFile;

  const invalidate = useCallback(() => {
    if (!projectId) return;
    queryClient.invalidateQueries({
      queryKey: trpc.projects.getFiles.queryKey({ projectId }),
    });
  }, [queryClient, trpc, projectId]);

  const writeFile = useMutation({
    ...trpc.projects.writeFile.mutationOptions(),
    onSuccess: (result) => {
      invalidate();
      toast.success(
        result.syncedToSandbox ? "Saved — preview updating" : "Saved",
      );
    },
    onError: (e) => toast.error(e.message),
  });

  const createFile = useMutation({
    ...trpc.projects.createFile.mutationOptions(),
    onSuccess: (result) => {
      invalidate();
      setNewFileOpen(false);
      setNewFilePath("");
      setSelectedFile(result.path);
      toast.success(`Created ${result.path}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const renameFile = useMutation({
    ...trpc.projects.renameFile.mutationOptions(),
    onSuccess: (result) => {
      invalidate();
      setRenameOpen(false);
      setSelectedFile(result.to);
      toast.success("File renamed");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteFile = useMutation({
    ...trpc.projects.deleteFile.mutationOptions(),
    onSuccess: (result) => {
      invalidate();
      setDeleteOpen(false);
      setSelectedFile(null);
      toast.success(`Deleted ${result.path}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCopy = useCallback(() => {
    if (!selectedFile) return;
    navigator.clipboard.writeText(files[selectedFile]).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => toast.error("Clipboard unavailable"),
    );
  }, [selectedFile, files]);

  const current = selectedFile ? files[selectedFile] : undefined;
  const dirty = current !== undefined && draft !== current;

  // Reset the buffer when the selection changes, or when an external write
  // (an agent run, a restore) replaces the stored content.
  useEffect(() => {
    setDraft(current ?? "");
  }, [selectedFile, current]);

  const handleSave = useCallback(
    (content: string) => {
      if (!projectId || !selectedFile) return;
      writeFile.mutate({ projectId, path: selectedFile, content });
    },
    [projectId, selectedFile, writeFile],
  );

  return (
    <>
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={28} minSize={18} className="flex flex-col bg-sidebar">
          {editable && (
            <div className="flex items-center gap-1 border-b p-1.5">
              <Button
                size="sm"
                variant="ghost"
                className="h-6 flex-1 justify-start px-2 text-xs"
                onClick={() => setNewFileOpen(true)}
              >
                <FilePlusIcon className="size-3.5" />
                New file
              </Button>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-auto">
            <TreeView data={treeData} value={selectedFile} onSelect={setSelectedFile} />
          </div>
        </ResizablePanel>

        <ResizableHandle className="transition-colors hover:bg-primary" />

        <ResizablePanel defaultSize={72} minSize={40}>
          {selectedFile && files[selectedFile] !== undefined ? (
            <div className="flex h-full w-full flex-col">
              <div className="flex items-center gap-x-2 border-b bg-sidebar px-3 py-1.5">
                <FileBreadcrumb filePath={selectedFile} />

                {dirty && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                    Unsaved
                  </span>
                )}
                {protectedFile && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <LockIcon className="size-3" />
                    Platform file
                  </span>
                )}
                {isGenerating && projectId && (
                  <span className="text-[11px] text-muted-foreground">
                    Locked while generating
                  </span>
                )}

                <div className="ml-auto flex items-center gap-1">
                  {editable && !protectedFile && (
                    <>
                      <Hint text="Save (Ctrl/Cmd+S)" side="bottom">
                        <Button
                          size="sm"
                          variant={dirty ? "default" : "outline"}
                          className="h-7 px-2"
                          disabled={!dirty || writeFile.isPending}
                          onClick={() => handleSave(draft)}
                        >
                          {writeFile.isPending ? (
                            <Loader2Icon className="size-3.5 animate-spin" />
                          ) : (
                            <SaveIcon className="size-3.5" />
                          )}
                        </Button>
                      </Hint>
                      <Hint text="Rename" side="bottom">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          onClick={() => {
                            setRenamePath(selectedFile);
                            setRenameOpen(true);
                          }}
                        >
                          <PencilIcon className="size-3.5" />
                        </Button>
                      </Hint>
                      <Hint text="Delete" side="bottom">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2"
                          onClick={() => setDeleteOpen(true)}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </Hint>
                    </>
                  )}
                  <Hint text="Copy to clipboard" side="bottom">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2"
                      onClick={handleCopy}
                      disabled={copied}
                    >
                      {copied ? (
                        <CopyCheckIcon className="size-3.5" />
                      ) : (
                        <CopyIcon className="size-3.5" />
                      )}
                    </Button>
                  </Hint>
                </div>
              </div>

              <div className={cn("min-h-0 flex-1 overflow-auto")}>
                <CodeEditor
                  key={selectedFile}
                  path={selectedFile}
                  value={draft}
                  readOnly={readOnly}
                  onSave={handleSave}
                  onChange={setDraft}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Select a file to view its contents
            </div>
          )}
        </ResizablePanel>
      </ResizablePanelGroup>

      <Dialog open={newFileOpen} onOpenChange={setNewFileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New file</DialogTitle>
            <DialogDescription>
              Use a path relative to the project root, e.g. <code>app/about/page.tsx</code>.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="app/components/hero.tsx"
            value={newFilePath}
            onChange={(e) => setNewFilePath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && newFilePath.trim() && projectId) {
                createFile.mutate({ projectId, path: newFilePath.trim(), content: "" });
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewFileOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!newFilePath.trim() || createFile.isPending || !projectId}
              onClick={() =>
                projectId &&
                createFile.mutate({ projectId, path: newFilePath.trim(), content: "" })
              }
            >
              {createFile.isPending && <Loader2Icon className="size-4 animate-spin" />}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename file</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renamePath}
            onChange={(e) => setRenamePath(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!renamePath.trim() || renameFile.isPending}
              onClick={() =>
                projectId &&
                selectedFile &&
                renameFile.mutate({
                  projectId,
                  from: selectedFile,
                  to: renamePath.trim(),
                })
              }
            >
              {renameFile.isPending && <Loader2Icon className="size-4 animate-spin" />}
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedFile}?</AlertDialogTitle>
            <AlertDialogDescription>
              A checkpoint is saved first, so you can restore this from History if you
              change your mind.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteFile.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteFile.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (projectId && selectedFile) {
                  deleteFile.mutate({ projectId, path: selectedFile });
                }
              }}
            >
              {deleteFile.isPending && <Loader2Icon className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
