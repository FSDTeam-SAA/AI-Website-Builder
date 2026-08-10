"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Suspense, useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { CodeIcon, CrownIcon, EyeIcon } from "lucide-react";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ThemeToggle } from "@/components/theme-toggle";
import { UserControl } from "@/components/user-control";
import { FileExplorer } from "@/components/file-explorer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { FragmentSummary } from "@/modules/projects/types";
import { PreviewPanel } from "@/modules/preview/ui/preview-panel";
import { useProjectStream } from "@/modules/preview/hooks/use-project-stream";
import {
  PreviewWorkspaceProvider,
  usePreviewWorkspace,
} from "@/modules/preview/workspace-context";
import { ShareDialog } from "@/modules/publish/ui/share-dialog";

import { ProjectHeader } from "../components/project-header";
import { MessagesContainer } from "../components/messages-container";

type TabValue = "preview" | "code";

interface Props {
  projectId: string;
}

/**
 * The chat and the preview are siblings that have to share two things: the
 * element the user clicked, and whether the preview needs to re-read the app.
 * The provider has to sit above both, so the panels live one level down.
 */
export const ProjectView = ({ projectId }: Props) => (
  <PreviewWorkspaceProvider>
    <ProjectWorkspace projectId={projectId} />
  </PreviewWorkspaceProvider>
);

const ProjectWorkspace = ({ projectId }: Props) => {
  const trpc = useTRPC();
  const { has } = useAuth();
  const hasProAccess = has?.({ plan: "pro" });

  const [activeFragment, setActiveFragment] = useState<FragmentSummary | null>(null);
  const [tabState, setTabState] = useState<TabValue>("preview");

  const { events } = useProjectStream(projectId);

  // The canonical tree, fetched on demand rather than ridden along on the chat
  // poll — the old `include: { fragment: true }` re-sent every generated source
  // file every two seconds.
  const { data: fileData } = useQuery({
    ...trpc.projects.getFiles.queryOptions({ projectId }),
    enabled: tabState === "code" || !!activeFragment,
  });
  const { data: session } = useQuery({
    ...trpc.preview.getSession.queryOptions({ projectId }),
    refetchInterval: 10_000,
  });

  const files = fileData?.files ?? {};
  const hasFiles = Object.keys(files).length > 0;
  const isGenerating = session?.isGenerating ?? false;

  /**
   * Sequence number of the most recent finished run.
   *
   * A static site has no hot reload and even a Next app can miss a Fast Refresh,
   * so the preview has to be told explicitly that the app changed. Using the
   * event `seq` means this only moves when a run actually completes.
   */
  const lastRunSeq = useMemo(() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].type === "DONE") return events[i].seq;
    }
    return 0;
  }, [events]);

  // Also bumped by a restore from the chat: rolling files back changes the app
  // on disk without producing a run, so nothing else would move `lastRunSeq`.
  const { reloadNonce, reloadPreview } = usePreviewWorkspace();

  /** Clicking a fragment's Preview should show the preview — it did nothing. */
  const handleFragmentClick = useCallback(
    (fragment: FragmentSummary | null) => {
      setActiveFragment(fragment);
      if (!fragment) return;
      setTabState("preview");
      reloadPreview();
    },
    [reloadPreview],
  );

  return (
    <div className="h-screen bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-100">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={35} minSize={20} className="flex min-h-0 flex-col bg-white dark:bg-zinc-950">
          <ErrorBoundary fallback={<PanelError label="project header" />}>
            <Suspense fallback={<HeaderSkeleton />}>
              <ProjectHeader projectId={projectId} />
            </Suspense>
          </ErrorBoundary>
          <ErrorBoundary fallback={<PanelError label="messages" />}>
            <Suspense fallback={<MessagesSkeleton />}>
              <MessagesContainer
                projectId={projectId}
                activeFragment={activeFragment}
                setActiveFragment={handleFragmentClick}
              />
            </Suspense>
          </ErrorBoundary>
        </ResizablePanel>

        <ResizableHandle className="transition-colors hover:bg-indigo-500" />

        <ResizablePanel defaultSize={65} minSize={40}>
          <Tabs
            className="h-full gap-y-0"
            defaultValue="preview"
            value={tabState}
            onValueChange={(value) => setTabState(value as TabValue)}
          >
            <div className="flex w-full items-center gap-x-2 border-b bg-white/95 p-2 backdrop-blur-xl dark:bg-zinc-950/95">
              {/* Activity used to be a third tab here. It now streams inline in
                  the chat, where the reply it belongs to already is. */}
              <TabsList className="h-8 rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-800 dark:bg-zinc-900">
                <TabsTrigger value="preview" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-indigo-600 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-indigo-300">
                  <EyeIcon /> <span>Preview</span>
                </TabsTrigger>
                <TabsTrigger value="code" className="rounded-md data-[state=active]:bg-white data-[state=active]:text-indigo-600 dark:data-[state=active]:bg-zinc-800 dark:data-[state=active]:text-indigo-300">
                  <CodeIcon /> <span>Code</span>
                </TabsTrigger>
              </TabsList>

              <div className="ml-auto flex items-center gap-x-2">
                <ShareDialog projectId={projectId} />
                <ThemeToggle />
                {!hasProAccess && (
                  <Button asChild size="sm" variant="ghost">
                    <Link href="/pricing">
                      <CrownIcon /> Upgrade
                    </Link>
                  </Button>
                )}
                <UserControl />
              </div>
            </div>

            {/* Kept mounted: unmounting tears down the preview iframe and the
                inspector handshake, so switching to Code and back would reload
                the whole app and lose scroll position. */}
            <TabsContent value="preview" forceMount className="min-h-0 data-[state=inactive]:hidden">
              <PreviewPanel
                projectId={projectId}
                reloadSignal={lastRunSeq + reloadNonce}
              />
            </TabsContent>

            <TabsContent value="code" className="min-h-0">
              {hasFiles ? (
                <FileExplorer
                  files={files}
                  projectId={projectId}
                  isGenerating={isGenerating}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-8 text-center">
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Your generated code will appear here once the first build finishes.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

const PanelError = ({ label }: { label: string }) => (
  <div className="p-4 text-sm text-muted-foreground">
    Something went wrong loading the {label}. Try refreshing the page.
  </div>
);

const HeaderSkeleton = () => (
  <div className="flex items-center gap-2 border-b p-3">
    <Skeleton className="size-6 rounded-md" />
    <Skeleton className="h-4 w-32" />
  </div>
);

const MessagesSkeleton = () => (
  <div className="flex flex-1 flex-col gap-4 p-4">
    <Skeleton className="ml-auto h-16 w-3/4 rounded-lg" />
    <Skeleton className="h-24 w-full rounded-lg" />
    <Skeleton className="ml-auto h-12 w-2/3 rounded-lg" />
  </div>
);
