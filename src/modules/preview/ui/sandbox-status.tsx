"use client";

import { AlertTriangleIcon, Loader2Icon, MoonIcon, PlayIcon, RefreshCcwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  status: string;
  error: string | null;
  framework: "NEXTJS" | "STATIC_HTML" | null;
  bootPhase: "QUEUED" | "BOOTING" | null;
  isWaking: boolean;
  onWake: () => void;
  onRestart: () => void;
  onFixError?: (error: string) => void;
}

/**
 * What the preview pane shows when there is nothing to show.
 *
 * The old preview pointed an iframe at a stored sandbox URL regardless of
 * whether that sandbox still existed, so an expired preview rendered as a blank
 * white rectangle with no explanation and no way forward.
 */
export const SandboxStatus = ({
  status,
  error,
  framework,
  bootPhase,
  isWaking,
  onWake,
  onRestart,
  onFixError,
}: Props) => {
  if (status === "CREATING" || isWaking) {
    const isStatic = framework === "STATIC_HTML";
    return (
      <Shell>
        <Loader2Icon className="size-7 animate-spin text-muted-foreground" />
        <Title>
          {bootPhase === "QUEUED" ? "Scheduling your preview" : "Starting your preview"}
        </Title>
        <Body>
          {isStatic
            ? "Starting a lightweight HTML server. No dependencies or build step are needed."
            : "Preparing dependencies and starting the app. The first launch can take up to a minute."}
        </Body>
      </Shell>
    );
  }

  if (status === "FAILED") {
    return (
      <Shell>
        <AlertTriangleIcon className="size-7 text-red-600" />
        <Title>The preview didn&apos;t start</Title>
        {error && (
          <pre className="max-h-40 max-w-lg overflow-auto whitespace-pre-wrap rounded-md border bg-muted p-3 text-left text-xs text-muted-foreground">
            {error}
          </pre>
        )}
        <div className="flex gap-2">
          <Button size="sm" onClick={onRestart}>
            <RefreshCcwIcon className="size-4" />
            Try again
          </Button>
          {onFixError && error && (
            <Button size="sm" variant="outline" onClick={() => onFixError(error)}>
              Ask AI to fix it
            </Button>
          )}
        </div>
      </Shell>
    );
  }

  if (status === "EXPIRED" || status === "NONE") {
    return (
      <Shell>
        <MoonIcon className="size-7 text-muted-foreground" />
        <Title>Your preview is asleep</Title>
        <Body>
          Previews pause when you&apos;re away to save resources. Your code is safe —
          waking it rebuilds your app exactly as you left it.
        </Body>
        <Button size="sm" onClick={onWake}>
          <PlayIcon className="size-4" />
          Wake preview
        </Button>
      </Shell>
    );
  }

  return (
    <Shell>
      <Loader2Icon className="size-7 animate-spin text-muted-foreground" />
      <Title>Loading</Title>
    </Shell>
  );
};

const Shell = ({ children }: { children: React.ReactNode }) => (
  <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
    {children}
  </div>
);

const Title = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm font-medium">{children}</p>
);

const Body = ({ children }: { children: React.ReactNode }) => (
  <p className="max-w-sm text-xs text-muted-foreground">{children}</p>
);
