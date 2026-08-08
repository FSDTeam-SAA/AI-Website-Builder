"use client";

import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Suspense, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { ActivityIcon, CodeIcon, CrownIcon, EyeIcon } from "lucide-react";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { ActivityPanel } from "@/modules/preview/ui/activity-panel";
import { useProjectStream } from "@/modules/preview/hooks/use-project-stream";
import { ShareDialog } from "@/modules/publish/ui/share-dialog";

import { ProjectHeader } from "../components/project-header";
import { MessagesContainer } from "../components/messages-container";

type TabValue = "preview" | "code" | "activity";

interface Props {
  projectId: string;
}

export const ProjectView = ({ projectId }: Props) => {
  const trpc = useTRPC();
  const { has } = useAuth();
  const hasProAccess = has?.({ plan: "pro" });

  const [activeFragment, setActiveFragment] = useState<FragmentSummary | null>(null);
  const [tabState, setTabState] = useState<TabValue>("preview");
  /** Cleared once the user picks a tab themselves, so we stop hijacking it. */
  const [autoSwitch, setAutoSwitch] = useState(true);

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

  // Show the work while it happens, then hand the preview back when it's done.
  useEffect(() => {
    if (!autoSwitch) return;
    setTabState(isGenerating ? "activity" : "preview");
  }, [isGenerating, autoSwitch]);

  return (
    <div className="h-screen">
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel defaultSize={35} minSize={20} className="flex min-h-0 flex-col">
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
                setActiveFragment={setActiveFragment}
              />
            </Suspense>
          </ErrorBoundary>
        </ResizablePanel>

        <ResizableHandle className="transition-colors hover:bg-primary" />

        <ResizablePanel defaultSize={65} minSize={40}>
          <Tabs
            className="h-full gap-y-0"
            defaultValue="preview"
            value={tabState}
            onValueChange={(value) => {
              setAutoSwitch(false);
              setTabState(value as TabValue);
            }}
          >
            <div className="flex w-full items-center gap-x-2 border-b p-2">
              <TabsList className="h-8 rounded-md border p-0">
                <TabsTrigger value="preview" className="rounded-md">
                  <EyeIcon /> <span>Preview</span>
                </TabsTrigger>
                <TabsTrigger value="code" className="rounded-md">
                  <CodeIcon /> <span>Code</span>
                </TabsTrigger>
                <TabsTrigger value="activity" className="relative rounded-md">
                  <ActivityIcon /> <span>Activity</span>
                  {isGenerating && (
                    <span className="absolute right-1 top-1 size-1.5 animate-pulse rounded-full bg-primary" />
                  )}
                </TabsTrigger>
              </TabsList>

              <div className="ml-auto flex items-center gap-x-2">
                                <ShareDialog projectId={projectId} />
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
              <PreviewPanel projectId={projectId} />
            </TabsContent>

            <TabsContent value="activity" className="min-h-0">
              <ActivityPanel events={events} isRunning={isGenerating} />
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
