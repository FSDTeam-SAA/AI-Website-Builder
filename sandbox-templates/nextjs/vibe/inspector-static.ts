/**
 * Entry point for the standalone inspector bundle used by STATIC_HTML projects.
 *
 * Next compiles vibe/inspector.ts for React projects, but a static site has no
 * compiler — so this is pre-bundled to plain JS at image build time and injected
 * by vibe/static-server.cjs.
 */
import { start } from "./inspector";

start();
