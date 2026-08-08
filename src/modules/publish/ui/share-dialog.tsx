"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CopyCheckIcon,
  CopyIcon,
  ExternalLinkIcon,
  GlobeIcon,
  Loader2Icon,
  SparklesIcon,
  UploadCloudIcon,
} from "lucide-react";

import { useTRPC } from "@/trpc/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  projectId: string;
}

export const ShareDialog = ({ projectId }: Props) => {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data } = useQuery({
    ...trpc.publish.getStatus.queryOptions({ projectId }),
    // Follow the build while it runs, then back off.
    refetchInterval: (q) => (q.state.data?.status === "BUILDING" ? 3_000 : false),
    enabled: open,
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.publish.getStatus.queryKey({ projectId }),
    });

  const publish = useMutation({
    ...trpc.publish.publish.mutationOptions(),
    onSuccess: () => {
      invalidate();
      toast.success("Building your site…");
    },
    onError: (e) => toast.error(e.message),
  });

  const setVisibility = useMutation({
    ...trpc.publish.setVisibility.mutationOptions(),
    onSuccess: invalidate,
  });

  const unpublish = useMutation({
    ...trpc.publish.unpublish.mutationOptions(),
    onSuccess: () => {
      invalidate();
      toast.success("Site taken offline");
    },
  });

  const fixBuild = useMutation({
    ...trpc.publish.fixBuild.mutationOptions(),
    onSuccess: () => {
      setOpen(false);
      toast.success("Asking AI to fix the build…");
    },
    onError: (e) => toast.error(e.message),
  });

  const handleCopy = async () => {
    if (!data?.shareUrl) return;
    await navigator.clipboard.writeText(data.shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isBuilding = data?.status === "BUILDING" || publish.isPending;
  const isLive = data?.status === "LIVE";
  const failed = data?.status === "EXPORT_FAILED";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="tertiary">
          <GlobeIcon className="size-4" />
          <span className="hidden sm:inline">Share</span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share your site</DialogTitle>
          <DialogDescription>
            Publishing builds a static copy of your app and hosts it at a permanent
            link. It keeps working after your preview goes to sleep.
          </DialogDescription>
        </DialogHeader>

        {isLive && data?.shareUrl && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border bg-muted/50 px-3 py-2">
                <CheckCircle2Icon className="size-4 shrink-0 text-emerald-600" />
                <span className="truncate font-mono text-xs">{data.shareUrl}</span>
              </div>
              <Button size="sm" variant="outline" onClick={handleCopy}>
                {copied ? <CopyCheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(data.shareUrl!, "_blank", "noopener")}
              >
                <ExternalLinkIcon className="size-4" />
              </Button>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="space-y-0.5">
                <Label htmlFor="public-toggle" className="text-sm">
                  Anyone with the link
                </Label>
                <p className="text-xs text-muted-foreground">
                  {data.isPublic ? "Your site is live." : "Your site is offline."}
                  {data.viewCount > 0 && ` · ~${data.viewCount} views`}
                </p>
              </div>
              <Switch
                id="public-toggle"
                checked={data.isPublic}
                onCheckedChange={(isPublic) =>
                  setVisibility.mutate({ projectId, isPublic })
                }
              />
            </div>

            {data.isStale && (
              <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" />
                You&apos;ve made changes since you last published. Re-publish to update
                the live site.
              </p>
            )}
          </div>
        )}

        {failed && data?.lastAttempt?.log && (
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-sm font-medium text-red-600">
              <AlertTriangleIcon className="size-4" />
              The build failed
            </p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 text-[11px] leading-relaxed">
              {data.lastAttempt.log.slice(-4000)}
            </pre>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={fixBuild.isPending}
              onClick={() => fixBuild.mutate({ projectId })}
            >
              {fixBuild.isPending ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <SparklesIcon className="size-4" />
              )}
              Ask AI to fix the build errors
            </Button>
          </div>
        )}

        <div className="flex items-center gap-2">
          <Button
            className="flex-1"
            disabled={isBuilding}
            onClick={() => publish.mutate({ projectId })}
          >
            {isBuilding ? (
              <>
                <Loader2Icon className="size-4 animate-spin" />
                Building…
              </>
            ) : (
              <>
                <UploadCloudIcon className="size-4" />
                {isLive ? "Re-publish" : "Publish site"}
              </>
            )}
          </Button>

          {isLive && (
            <Button
              variant="outline"
              disabled={unpublish.isPending}
              onClick={() => unpublish.mutate({ projectId })}
            >
              Unpublish
            </Button>
          )}
        </div>

        {isBuilding && (
          <p className="text-center text-xs text-muted-foreground">
            This usually takes 1-2 minutes. You can close this dialog.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
};
