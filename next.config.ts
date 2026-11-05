import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

const createNextConfig = (phase: string): NextConfig => ({
  // Keep the dev server's incremental cache separate from production builds.
  // Running `next build` while `next dev` is active otherwise lets both
  // processes replace manifests inside `.next`, causing recurring ENOENTs.
  distDir: phase === PHASE_DEVELOPMENT_SERVER
    ? process.env.KORA_BROWSER_TEST === "1" ? ".next-browser-tests" : ".next-dev"
    : ".next",
  // The sandbox manager reads this at runtime to install the static file server
  // into STATIC_HTML sandboxes. Without tracing it in, it is absent from a
  // standalone/serverless build and static previews silently fail.
  outputFileTracingIncludes: {
    "/api/inngest": [
      "./sandbox-templates/nextjs/vibe/static-server.cjs",
      "./sandbox-templates/nextjs/vibe/inspector.bundle.js",
    ],
    "/api/trpc/[trpc]": [
      "./sandbox-templates/nextjs/vibe/static-server.cjs",
      "./sandbox-templates/nextjs/vibe/inspector.bundle.js",
    ],
  },
});

export default createNextConfig;
