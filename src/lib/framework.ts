import type { Framework } from "@/generated/prisma";

/**
 * Per-framework runtime differences.
 *
 * A Next.js project runs a dev server that compiles; a static project just
 * serves files. Nearly everything downstream — where files live, how the
 * preview boots, what "ready" means, how publishing works — forks here rather
 * than being scattered as `if (framework === …)` checks.
 */

export interface FrameworkConfig {
  id: Framework;
  label: string;
  description: string;
  /** Where the project's files live inside the sandbox, relative to /home/user. */
  fileRoot: string;
  /** Command used to (re)start the preview process. */
  startCommand: string;
  /** Whether publishing needs a build step, or can upload the files as-is. */
  needsBuild: boolean;
  /** Whether `npm install` is meaningful for this project type. */
  usesNpm: boolean;
  /** Seed files written when a project of this type is first created. */
  seedFiles?: Record<string, string>;
}

const STATIC_SEED_INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>New site</title>
    <link rel="stylesheet" href="styles/main.css" />
  </head>
  <body>
    <main class="empty">
      <p>Your site will appear here.</p>
    </main>
  </body>
</html>
`;

const STATIC_SEED_CSS = `:root {
  color-scheme: light dark;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
}

body {
  margin: 0;
  min-height: 100dvh;
  display: grid;
  place-items: center;
}

.empty {
  color: #6b7280;
  font-size: 0.95rem;
}
`;

export const FRAMEWORKS: Record<Framework, FrameworkConfig> = {
  NEXTJS: {
    id: "NEXTJS",
    label: "Next.js app",
    description: "React, Tailwind and shadcn/ui. Best for interactive apps.",
    fileRoot: "",
    startCommand: "npx next dev --turbopack",
    needsBuild: true,
    usesNpm: true,
  },
  STATIC_HTML: {
    id: "STATIC_HTML",
    label: "HTML website",
    description: "Plain HTML, CSS and JavaScript. Fast, simple, no build step.",
    // Kept out of the repo root so the Next scaffold in the template image does
    // not get mixed into the user's site.
    fileRoot: "site",
    startCommand: "node /home/user/vibe/static-server.cjs",
    needsBuild: false,
    usesNpm: false,
    seedFiles: {
      "site/index.html": STATIC_SEED_INDEX,
      "site/styles/main.css": STATIC_SEED_CSS,
    },
  },
};

export function frameworkConfig(framework: Framework | null | undefined): FrameworkConfig {
  return FRAMEWORKS[framework ?? "NEXTJS"] ?? FRAMEWORKS.NEXTJS;
}

/** Prefix a repo-relative path with the framework's file root. */
export function withFileRoot(framework: Framework | null | undefined, path: string): string {
  const root = frameworkConfig(framework).fileRoot;
  if (!root) return path;
  return path.startsWith(`${root}/`) ? path : `${root}/${path}`;
}
