import type { NextConfig } from "next";
import { PHASE_DEVELOPMENT_SERVER } from "next/constants";

// Keep local development, browser tests and deployment build caches separate.
const createNextConfig = (phase: string): NextConfig => ({
  distDir: phase === PHASE_DEVELOPMENT_SERVER
    ? process.env.KORA_BROWSER_TEST === "1" ? ".next-browser-tests" : ".next-dev"
    : ".next",
});

export default createNextConfig;
