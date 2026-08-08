import type { VibeElementLocator } from "@/modules/preview/protocol";

export { SANDBOX_TIMEOUT_MS as SANDBOX_TIMEOUT } from "@/lib/sandbox/manager";

/**
 * Event catalogue. Typed so `inngest.send` rejects a malformed payload at
 * compile time rather than silently starting a run with a missing projectId.
 */
export type VibeEvents = {
  "code-agent/run": {
    data: {
      projectId: string;
      value: string;
      messageId?: string;
      /** Images the user attached; described by a vision pass before the run. */
      attachmentIds?: string[];
    };
  };
  "code-agent/surgical-edit": {
    data: {
      projectId: string;
      messageId: string;
      instruction: string;
      locator: VibeElementLocator;
    };
  };
  "code-agent/fix-error": {
    data: {
      projectId: string;
      messageId: string;
      errorText: string;
      source: "console" | "build";
    };
  };
  "code-agent/cancel": {
    data: { projectId: string };
  };
  "sandbox/ensure": {
    data: { projectId: string };
  };
  "project/publish": {
    data: { projectId: string; attemptId: string };
  };
};
