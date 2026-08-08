import { serve } from "inngest/next";

import { inngest } from "@/inngest/client";
import {
  codeAgentFunction,
  ensureSandboxFunction,
  fixErrorFunction,
  sandboxIdleSweepFunction,
  publishProjectFunction,
  sandboxReaperFunction,
  surgicalEditFunction,
} from "@/inngest/functions";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    codeAgentFunction,
    surgicalEditFunction,
    fixErrorFunction,
    ensureSandboxFunction,
    sandboxReaperFunction,
    sandboxIdleSweepFunction,
    publishProjectFunction,
  ],
});
