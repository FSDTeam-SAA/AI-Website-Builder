import "server-only";

import type { Sandbox } from "@e2b/code-interpreter";

import { SANDBOX_ROOT } from "@/lib/project-files";
import { probeDevServer } from "@/lib/sandbox/manager";

/**
 * Does the app actually work right now?
 *
 * Used two ways: as a tool the agent calls before declaring itself finished,
 * and as an automatic verification pass after every run. Previously nothing
 * checked — a run could report success while the app failed to compile, and the
 * user only discovered it by looking at a blank preview.
 */

export interface HealthReport {
  ok: boolean;
  /** Compile/runtime errors, ready to hand to a model. */
  errors: string[];
  /** Human summary for the activity log. */
  summary: string;
}

/** Next prints these when a compile fails; they are what we want to surface. */
const ERROR_PATTERNS = [
  /Failed to compile/i,
  /Module not found/i,
  /SyntaxError/i,
  /TypeError:/,
  /ReferenceError:/,
  /Error:\s+×/,
  /Unhandled Runtime Error/i,
  /Parsing ecmascript source code failed/i,
  /You're importing a component that needs/i,
];

const IGNORE_PATTERNS = [
  /Fast Refresh/i,
  /^\s*$/,
  /Compiled .*successfully/i,
  /ready in/i,
  /warn\s+-\s+/i,
];

/** Pull the interesting parts out of the dev-server log. */
export function extractErrors(log: string): string[] {
  const lines = log.split("\n");
  const errors: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (IGNORE_PATTERNS.some((p) => p.test(line))) continue;
    if (!ERROR_PATTERNS.some((p) => p.test(line))) continue;

    // Include following context: Next's compile errors put the file, the code
    // frame and the cause on the lines after the header.
    const block = lines.slice(i, i + 18).join("\n").trimEnd();
    errors.push(block);
    i += 17;
  }

  return errors;
}

export async function readDevServerLog(sandbox: Sandbox, lines = 200): Promise<string> {
  try {
    const result = await sandbox.commands.run(`tail -n ${lines} /tmp/next-dev.log`, {
      timeoutMs: 15_000,
    });
    return result.stdout ?? "";
  } catch {
    return "";
  }
}

/**
 * Check the app compiles and serves.
 *
 * `touch`ing a source file first forces the dev server to recompile, so the log
 * reflects the code as it stands now rather than a stale success from before
 * the agent's last write.
 */
export async function checkAppHealth(
  sandbox: Sandbox,
  url: string,
  opts: { settleMs?: number } = {},
): Promise<HealthReport> {
  // Give the compiler a moment to react to the most recent writes.
  await new Promise((r) => setTimeout(r, opts.settleMs ?? 3_000));

  const probe = await probeDevServer(url, { timeoutMs: 20_000, requireBody: true });
  const log = await readDevServerLog(sandbox);
  const errors = extractErrors(log);

  // The dev server renders Next's error overlay with a 200, so a green probe is
  // not on its own proof that the page works.
  const overlayFailed = !probe.ok;

  if (errors.length === 0 && !overlayFailed) {
    return { ok: true, errors: [], summary: "App compiles and renders." };
  }

  if (errors.length === 0 && overlayFailed) {
    return {
      ok: false,
      errors: [`The page did not render: ${probe.reason ?? "unknown error"}`],
      summary: `Page did not render (${probe.reason ?? "unknown"})`,
    };
  }

  return {
    ok: false,
    errors,
    summary: `${errors.length} compile/runtime error${errors.length === 1 ? "" : "s"}`,
  };
}

/** Clear the log so a later check does not re-report an already-fixed error. */
export async function resetDevServerLog(sandbox: Sandbox): Promise<void> {
  await sandbox.commands
    .run(`: > /tmp/next-dev.log`, { timeoutMs: 10_000, cwd: SANDBOX_ROOT })
    .catch(() => {});
}
