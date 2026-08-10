import "server-only";

import { Sandbox } from "@e2b/code-interpreter";

import { prisma } from "@/lib/db";
import { allowedParentOrigins, serverEnv } from "@/lib/env";
import { frameworkConfig } from "@/lib/framework";
import { captureTemplateBaseline } from "@/lib/sandbox/reconcile";
import {
  SANDBOX_ROOT,
  computeDepsHash,
  getProjectFiles,
  normalizeFilePath,
  toSandboxPath,
  type ProjectFiles,
} from "@/lib/project-files";

/**
 * Sandbox lifecycle.
 *
 * Previously every user message called `Sandbox.create()` for a brand new empty
 * sandbox, so nothing the user built survived to the next turn — follow-ups
 * regenerated from a blank scaffold instead of editing. Here a project owns one
 * long-lived sandbox that is reconnected when alive and rebuilt from
 * `Project.files` when not.
 */

export const SANDBOX_PORT = 3000;
export const SANDBOX_TIMEOUT_MS = 30 * 60 * 1000;
/** Skip the E2B round-trip on heartbeat while this much time still remains. */
export const HEARTBEAT_SKIP_ABOVE_MS = 20 * 60 * 1000;
/** A CREATING claim older than this is assumed to belong to a dead worker. */
export const CLAIM_STALE_MS = 4 * 60 * 1000;
/** How long to wait for the dev server to answer after a (re)start. */
export const BOOT_TIMEOUT_MS = 120_000;

export type SandboxSession =
  | { status: "RUNNING"; sandboxId: string; url: string; expiresAt: Date }
  | { status: "CREATING"; phase: "QUEUED" | "BOOTING" }
  | { status: "EXPIRED" }
  | { status: "NONE" }
  | { status: "FAILED"; error: string };

function urlForHost(host: string): string {
  return `https://${host}`;
}

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

/**
 * Confirm the dev server is actually serving.
 *
 * A reconnected sandbox can be alive with a dead or still-compiling Next
 * process, which is exactly the state that used to show a green preview over a
 * blank iframe. Requiring a non-empty <body> — not merely a 200 — is what makes
 * the RUNNING status trustworthy.
 */
export async function probeDevServer(
  url: string,
  opts: { timeoutMs?: number; requireBody?: boolean; requireStaticServer?: boolean } = {},
): Promise<{ ok: boolean; status?: number; reason?: string }> {
  const timeoutMs = opts.timeoutMs ?? 5_000;
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
    if (opts.requireStaticServer && res.headers.get("x-vibe-static-server") !== "1") {
      return { ok: false, status: res.status, reason: "wrong preview runtime" };
    }
    if (!opts.requireBody) return { ok: true, status: res.status };

    const html = await res.text();
    const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? "";
    if (body.replace(/<[^>]*>/g, "").trim().length === 0 && !/<div|<main|<section/i.test(body)) {
      return { ok: false, status: res.status, reason: "empty document body" };
    }
    return { ok: true, status: res.status };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

async function waitForDevServer(
  url: string,
  timeoutMs = BOOT_TIMEOUT_MS,
  requireStaticServer = false,
) {
  const deadline = Date.now() + timeoutMs;
  let last = "no attempt made";
  // Backs off from 250ms to 2s. A static server is ready almost immediately, so
  // a flat 2s poll spent most of the boot budget waiting on an app that was
  // already serving; a Next compile still gets the slow cadence it needs.
  let delay = 250;
  while (Date.now() < deadline) {
    const probe = await probeDevServer(url, {
      timeoutMs: 5_000,
      requireBody: true,
      requireStaticServer,
    });
    if (probe.ok) return { ok: true as const };
    last = probe.reason ?? "unknown";
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 2, 2_000);
  }
  return { ok: false as const, reason: last };
}

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------

export async function connectIfAlive(sandboxId: string): Promise<Sandbox | null> {
  try {
    const sandbox = await Sandbox.connect(sandboxId);
    await sandbox.setTimeout(SANDBOX_TIMEOUT_MS);
    return sandbox;
  } catch {
    return null;
  }
}

/** Connect to the project's sandbox, or throw if it isn't currently running. */
export async function requireRunningSandbox(projectId: string): Promise<Sandbox> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { sandboxId: true },
  });
  if (!project?.sandboxId) throw new Error("Project has no sandbox");
  const sandbox = await connectIfAlive(project.sandboxId);
  if (!sandbox) throw new Error("Sandbox is not running");
  return sandbox;
}

// ---------------------------------------------------------------------------
// File sync
// ---------------------------------------------------------------------------

/** Write a patch into a live sandbox. `null` deletes. */
export async function writeFilesToSandbox(
  sandbox: Sandbox,
  patch: Record<string, string | null>,
): Promise<void> {
  const writes: { path: string; data: string }[] = [];
  const deletes: string[] = [];

  for (const [rawPath, content] of Object.entries(patch)) {
    const path = normalizeFilePath(rawPath);
    if (!path) continue;
    if (content === null) deletes.push(toSandboxPath(path));
    else writes.push({ path: toSandboxPath(path), data: content });
  }

  // Batch — the previous implementation looped one HTTP round-trip per file.
  const BATCH = 40;
  for (let i = 0; i < writes.length; i += BATCH) {
    await sandbox.files.write(writes.slice(i, i + BATCH));
  }

  if (deletes.length) {
    const quoted = deletes.map((p) => `'${p.replace(/'/g, "'\\''")}'`).join(" ");
    await sandbox.commands.run(`rm -f ${quoted}`, { timeoutMs: 30_000 }).catch(() => {});
  }
}

/** Read files back out of the sandbox (used to reconcile npm-installed manifests). */
export async function readFilesFromSandbox(
  sandbox: Sandbox,
  paths: string[],
): Promise<ProjectFiles> {
  const out: ProjectFiles = {};
  for (const path of paths) {
    try {
      const content = await sandbox.files.read(toSandboxPath(path));
      if (typeof content === "string") out[normalizeFilePath(path)] = content;
    } catch {
      // Absent file — nothing to reconcile.
    }
  }
  return out;
}

/**
 * Inject this deployment's origin into the sandbox's inspector allowlist.
 *
 * The sandbox preview URL is public, so the allowlist — not the `vibe_parent`
 * query parameter — decides who may drive the inspector. Writing it from here
 * means a hostile page that frames the sandbox cannot add itself, while the
 * origin still follows the deployment (localhost in dev, the real domain in
 * production) without rebuilding the template.
 */
export async function writeInspectorConfig(sandbox: Sandbox): Promise<void> {
  const origins = allowedParentOrigins();
  const contents =
    `// Written by the Vibe app at sandbox boot. Do not edit.\n` +
    `export const ALLOWED_PARENT_ORIGINS: string[] = ${JSON.stringify(origins, null, 2)};\n`;

  // Static HTML cannot compile the TypeScript inspector inside the sandbox.
  // Upload a prebuilt copy and prepend this deployment's trusted origins so it
  // works in production as well as localhost. This also upgrades live sandboxes
  // created from a template that predates the inspector.
  const staticBundle = await loadStaticRuntimeSource("inspector.bundle.js");
  const writes = [{ path: `${SANDBOX_ROOT}/vibe/allowed-parents.ts`, data: contents }];
  if (staticBundle) {
    const safeOrigins = JSON.stringify(origins).replace(/</g, "\\u003c");
    writes.push({
      path: `${SANDBOX_ROOT}/vibe/inspector.bundle.js`,
      data: `window.__VIBE_ALLOWED_PARENT_ORIGINS__=${safeOrigins};\n${staticBundle}`,
    });
  }

  await sandbox.commands
    .run(`mkdir -p ${SANDBOX_ROOT}/vibe`, { timeoutMs: 15_000 })
    .catch(() => {});
  await sandbox.files
    .write(writes)
    .catch(() => {
      // Older template without the inspector — the preview still works, only
      // click-to-edit is unavailable.
    });
}

/**
 * Upload the static file server into the sandbox.
 *
 * Static projects need it to serve `site/` and to inject the inspector. The
 * template image ships a copy, but uploading it at boot means STATIC_HTML
 * projects also work on an older template that predates it — otherwise the
 * start command silently fails, `next dev` keeps serving the React scaffold,
 * and the preview shows the wrong app with no explanation.
 */
async function ensureStaticServer(sandbox: Sandbox): Promise<boolean> {
  const source = await loadStaticRuntimeSource("static-server.cjs");
  if (!source) return false;

  try {
    await sandbox.commands.run(`mkdir -p ${SANDBOX_ROOT}/vibe ${SANDBOX_ROOT}/site`, {
      timeoutMs: 15_000,
    });
    await sandbox.files.write([
      { path: `${SANDBOX_ROOT}/vibe/static-server.cjs`, data: source },
    ]);
    return true;
  } catch {
    return false;
  }
}

type StaticRuntimeAsset = "static-server.cjs" | "inspector.bundle.js";
const cachedStaticRuntime = new Map<StaticRuntimeAsset, string | null>();

async function loadStaticRuntimeSource(asset: StaticRuntimeAsset): Promise<string | null> {
  // Deployment assets are immutable, but in development the inspector bundle
  // is regenerated while the Next process stays alive. Do not keep serving the
  // previous bundle to a sandbox after a hot update.
  const cacheable = process.env.NODE_ENV === "production";
  if (cacheable && cachedStaticRuntime.has(asset)) {
    return cachedStaticRuntime.get(asset) ?? null;
  }
  try {
    const { readFile } = await import("fs/promises");
    const { join } = await import("path");
    const source = await readFile(
      join(process.cwd(), "sandbox-templates/nextjs/vibe", asset),
      "utf8",
    );
    if (cacheable) cachedStaticRuntime.set(asset, source);
    return source;
  } catch {
    if (cacheable) cachedStaticRuntime.set(asset, null);
    return null;
  }
}

async function restartDevServer(
  sandbox: Sandbox,
  startCommand = "npx next dev --turbopack",
): Promise<void> {
  // Kill whatever currently holds port 3000.
  //
  // `pkill -f 'next dev'` alone is not enough: `next dev` spawns a detached
  // `next-server` child that keeps the port bound, so the replacement server
  // died with EADDRINUSE and the old app kept being served. Match every variant,
  // then wait for the port to actually free before rebinding.
  await sandbox.commands
    .run(
      [
        // Bracket the first character so the pattern cannot match this very
        // command line — otherwise pkill kills its own shell and the real
        // server survives.
        "pkill -f '[n]ext dev' || true",
        "pkill -f '[n]ext-server' || true",
        "pkill -f '[s]tart-server' || true",
        "pkill -f '[s]tatic-server.cjs' || true",
      ].join("; "),
      // The template's start command is launched by E2B as root, while our
      // commands default to `user`. Without this the kill silently fails and
      // the old server keeps port 3000 — a static project then kept serving
      // the Next scaffold.
      { timeoutMs: 20_000, user: "root" },
    )
    .catch(() => {});

  // Poll rather than sleep a fixed amount: process teardown is not instant, and
  // a premature bind fails silently in the background.
  await sandbox.commands
    .run(
      `for i in $(seq 1 20); do ` +
        `if ! (exec 3<>/dev/tcp/127.0.0.1/3000) 2>/dev/null; then exit 0; fi; ` +
        `sleep 0.5; done`,
      { timeoutMs: 20_000 },
    )
    .catch(() => {});
  // A .next cache built against different source is a reliable source of ghost
  // errors after rehydration. Only Next builds one, and deleting it costs
  // seconds on a warm template, so skip it for frameworks that never compile.
  if (startCommand.includes("next")) {
    await sandbox.commands
      .run(`rm -rf ${SANDBOX_ROOT}/.next`, { timeoutMs: 60_000 })
      .catch(() => {});
  }
  // Started as root so it can bind port 3000 and replace the template process.
  await sandbox.commands.run(
    `cd ${SANDBOX_ROOT} && ${startCommand} > /tmp/next-dev.log 2>&1`,
    { background: true, timeoutMs: 20_000, user: "root" },
  );
}

async function tailDevServerLog(sandbox: Sandbox): Promise<string> {
  try {
    const res = await sandbox.commands.run("tail -n 40 /tmp/next-dev.log", {
      timeoutMs: 15_000,
    });
    return res.stdout.slice(-4000);
  } catch {
    return "";
  }
}

// ---------------------------------------------------------------------------
// Rehydration
// ---------------------------------------------------------------------------

/**
 * Replay a project's canonical tree into a fresh sandbox.
 *
 * Order matters. The system prompt forbids editing package.json but mandates
 * `npm install` via the terminal, so installed dependencies are invisible to
 * the database unless the manifests are reconciled back. Those manifests must
 * be written and installed BEFORE source, or the dev server compiles imports
 * whose packages do not exist yet.
 */
export async function rehydrateSandbox(
  sandbox: Sandbox,
  files: ProjectFiles,
  opts: { baselineDepsHash?: string | null; skipInstall?: boolean } = {},
): Promise<{ installed: boolean }> {
  const manifests: Record<string, string> = {};
  if (files["package.json"]) manifests["package.json"] = files["package.json"];
  if (files["package-lock.json"]) manifests["package-lock.json"] = files["package-lock.json"];

  let installed = false;
  if (manifests["package.json"] && !opts.skipInstall) {
    await writeFilesToSandbox(sandbox, manifests);

    const depsHash = computeDepsHash(files);
    const needsInstall = !opts.baselineDepsHash || depsHash !== opts.baselineDepsHash;

    if (needsInstall) {
      const ci = await sandbox.commands
        .run(`cd ${SANDBOX_ROOT} && npm ci --no-audit --no-fund --prefer-offline`, {
          timeoutMs: 300_000,
        })
        .catch(() => null);

      if (!ci || ci.exitCode !== 0) {
        // `npm ci` refuses when the lockfile and manifest disagree, which is
        // common after the agent installed packages ad hoc.
        await sandbox.commands
          .run(`cd ${SANDBOX_ROOT} && npm install --no-audit --no-fund`, {
            timeoutMs: 300_000,
          })
          .catch(() => null);
      }
      installed = true;
    }
  }

  const source: Record<string, string> = {};
  for (const [path, content] of Object.entries(files)) {
    if (path === "package.json" || path === "package-lock.json") continue;
    source[path] = content;
  }
  await writeFilesToSandbox(sandbox, source);

  return { installed };
}

// ---------------------------------------------------------------------------
// Ensure
// ---------------------------------------------------------------------------

async function markRunning(projectId: string, sandbox: Sandbox) {
  const url = urlForHost(sandbox.getHost(SANDBOX_PORT));
  const expiresAt = new Date(Date.now() + SANDBOX_TIMEOUT_MS);
  await prisma.project.update({
    where: { id: projectId },
    data: {
      sandboxId: sandbox.sandboxId,
      sandboxUrl: url,
      sandboxStatus: "RUNNING",
      sandboxExpiresAt: expiresAt,
      sandboxBootedAt: new Date(),
      sandboxClaimedAt: null,
      sandboxError: null,
      lastActiveAt: new Date(),
    },
  });
  return { status: "RUNNING" as const, sandboxId: sandbox.sandboxId, url, expiresAt };
}

async function markFailed(projectId: string, error: string): Promise<SandboxSession> {
  await prisma.project.update({
    where: { id: projectId },
    data: {
      sandboxStatus: "FAILED",
      sandboxError: error.slice(0, 2000),
      sandboxClaimedAt: null,
    },
  });
  return { status: "FAILED", error };
}

/**
 * Get a running sandbox for a project, creating and rehydrating one if needed.
 *
 * Safe to call concurrently: creation is guarded by a conditional claim so two
 * simultaneous triggers cannot both create a sandbox (which would leak one and
 * strand the other's work).
 */
export async function ensureSandbox(projectId: string): Promise<SandboxSession> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      sandboxId: true,
      sandboxStatus: true,
      sandboxClaimedAt: true,
      depsHash: true,
      framework: true,
    },
  });
  if (!project) return { status: "FAILED", error: "Project not found" };

  const fw = frameworkConfig(project.framework);

  // 1. Reconnect.
  if (project.sandboxId) {
    const sandbox = await connectIfAlive(project.sandboxId);
    if (sandbox) {
      await writeInspectorConfig(sandbox);
      if (!fw.usesNpm) await ensureStaticServer(sandbox);
      const url = urlForHost(sandbox.getHost(SANDBOX_PORT));
      const probe = await probeDevServer(url, {
        timeoutMs: 6_000,
        requireBody: true,
        requireStaticServer: !fw.usesNpm,
      });
      if (probe.ok) return markRunning(projectId, sandbox);

      // Alive but not serving — restart in place rather than burning a new one.
      if (!fw.usesNpm) await ensureStaticServer(sandbox);
      await restartDevServer(sandbox, fw.startCommand);
      const booted = await waitForDevServer(url, BOOT_TIMEOUT_MS, !fw.usesNpm);
      if (booted.ok) return markRunning(projectId, sandbox);
      await sandbox.kill().catch(() => {});
    }
  }

  // 2. Claim the right to create.
  const staleBefore = new Date(Date.now() - CLAIM_STALE_MS);
  const claim = await prisma.project.updateMany({
    where: {
      id: projectId,
      OR: [
        { sandboxStatus: { in: ["NONE", "EXPIRED", "FAILED"] } },
        // A queued boot deliberately has no timestamp. The worker that wins
        // this update becomes the active owner by setting one below.
        { sandboxStatus: "CREATING", sandboxClaimedAt: null },
        { sandboxStatus: "CREATING", sandboxClaimedAt: { lt: staleBefore } },
        { sandboxStatus: "RUNNING" }, // reconnect above already failed
      ],
    },
    data: { sandboxStatus: "CREATING", sandboxClaimedAt: new Date(), sandboxError: null },
  });
  if (claim.count === 0) return { status: "CREATING", phase: "BOOTING" };

  // 3. Create + rehydrate.
  let sandbox: Sandbox | null = null;
  try {
    const { E2B_TEMPLATE_ID } = serverEnv();
    sandbox = await Sandbox.create(E2B_TEMPLATE_ID, { timeoutMs: SANDBOX_TIMEOUT_MS });

    // Must run before ANY write: this is the only moment a pristine sandbox
    // exists, and the baseline is what lets reconciliation tell the user's
    // files apart from the template's own.
    await captureTemplateBaseline(sandbox).catch(() => {});

    await writeInspectorConfig(sandbox);

    const { files } = await getProjectFiles(projectId);
    // Static projects have no npm step and always need their own server
    // started, even on the very first boot.
    if (!fw.usesNpm) {
      const ok = await ensureStaticServer(sandbox);
      if (!ok) {
        await sandbox.kill().catch(() => {});
        return markFailed(
          projectId,
          "Could not install the static file server in the sandbox.",
        );
      }
    }

    if (Object.keys(files).length > 0 || !fw.usesNpm) {
      await rehydrateSandbox(sandbox, files, {
        baselineDepsHash: null,
        skipInstall: !fw.usesNpm,
      });
      await restartDevServer(sandbox, fw.startCommand);
    }

    const url = urlForHost(sandbox.getHost(SANDBOX_PORT));
    const booted = await waitForDevServer(url, BOOT_TIMEOUT_MS, !fw.usesNpm);
    if (!booted.ok) {
      const log = await tailDevServerLog(sandbox);
      await sandbox.kill().catch(() => {});
      return markFailed(
        projectId,
        `Preview failed to start: ${booted.reason}${log ? `\n\n${log}` : ""}`,
      );
    }

    return markRunning(projectId, sandbox);
  } catch (e) {
    if (sandbox) await sandbox.kill().catch(() => {});
    return markFailed(projectId, e instanceof Error ? e.message : String(e));
  }
}

// ---------------------------------------------------------------------------
// Cheap reads / lifecycle
// ---------------------------------------------------------------------------

/** Non-blocking status read for the UI poll. Never touches E2B. */
export async function peekSandboxSession(projectId: string): Promise<SandboxSession> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      sandboxId: true,
      sandboxUrl: true,
      sandboxStatus: true,
      sandboxExpiresAt: true,
      sandboxError: true,
      sandboxClaimedAt: true,
      updatedAt: true,
    },
  });
  if (!project) return { status: "NONE" };

  switch (project.sandboxStatus) {
    case "RUNNING": {
      const { sandboxId, sandboxUrl, sandboxExpiresAt } = project;
      if (!sandboxId || !sandboxUrl || !sandboxExpiresAt) return { status: "EXPIRED" };
      if (sandboxExpiresAt.getTime() < Date.now()) return { status: "EXPIRED" };
      return {
        status: "RUNNING",
        sandboxId,
        url: sandboxUrl,
        expiresAt: sandboxExpiresAt,
      };
    }
    case "CREATING": {
      // null means queued for a worker; a timestamp means a worker actively
      // owns the boot. Both are recoverable if the event/worker disappears.
      const phase = project.sandboxClaimedAt ? "BOOTING" : "QUEUED";
      const lastProgressAt = project.sandboxClaimedAt ?? project.updatedAt;
      const stale = Date.now() - lastProgressAt.getTime() > CLAIM_STALE_MS;
      return stale ? { status: "EXPIRED" } : { status: "CREATING", phase };
    }
    case "FAILED":
      return { status: "FAILED", error: project.sandboxError ?? "Preview failed to start" };
    case "EXPIRED":
      return { status: "EXPIRED" };
    default:
      return { status: "NONE" };
  }
}

/** Extend the sandbox TTL while the user is actively looking at the preview. */
export async function heartbeatSandbox(projectId: string): Promise<SandboxSession> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { sandboxId: true, sandboxStatus: true, sandboxExpiresAt: true, sandboxUrl: true },
  });
  if (!project?.sandboxId || project.sandboxStatus !== "RUNNING") {
    return peekSandboxSession(projectId);
  }

  const remaining = (project.sandboxExpiresAt?.getTime() ?? 0) - Date.now();
  if (remaining > HEARTBEAT_SKIP_ABOVE_MS) {
    return peekSandboxSession(projectId);
  }

  try {
    await Sandbox.setTimeout(project.sandboxId, SANDBOX_TIMEOUT_MS);
    const expiresAt = new Date(Date.now() + SANDBOX_TIMEOUT_MS);
    await prisma.project.update({
      where: { id: projectId },
      data: { sandboxExpiresAt: expiresAt, lastActiveAt: new Date() },
    });
    return {
      status: "RUNNING",
      sandboxId: project.sandboxId,
      url: project.sandboxUrl!,
      expiresAt,
    };
  } catch {
    await prisma.project.update({
      where: { id: projectId },
      data: { sandboxStatus: "EXPIRED", sandboxId: null, sandboxUrl: null },
    });
    return { status: "EXPIRED" };
  }
}

export async function killProjectSandbox(projectId: string): Promise<void> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { sandboxId: true },
  });
  if (project?.sandboxId) {
    await Sandbox.kill(project.sandboxId).catch(() => {});
  }
  await prisma.project.update({
    where: { id: projectId },
    data: {
      sandboxStatus: "EXPIRED",
      sandboxId: null,
      sandboxUrl: null,
      sandboxExpiresAt: null,
      sandboxClaimedAt: null,
    },
  });
}
