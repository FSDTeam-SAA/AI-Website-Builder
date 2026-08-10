import "server-only";

import { createHash } from "crypto";
import type { Sandbox } from "@e2b/code-interpreter";

import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import {
  SANDBOX_ROOT,
  isProtectedPath,
  mergeProjectFiles,
  normalizeFilePath,
  toSandboxPath,
  type ProjectFiles,
} from "@/lib/project-files";

/**
 * Pull files the agent created outside the write tools back into the database.
 *
 * The leak this closes: the write tools record everything they touch, but a
 * `terminal` command does not. `npx shadcn@latest add chart`, `npx prisma init`,
 * any scaffolding CLI — all of it lands in the sandbox and never reaches
 * `Project.files`, so the next rehydrate silently destroys it. Only
 * package.json and package-lock.json were being reconciled.
 *
 * Sweeping the whole sandbox instead would drag in the ~46 untouched shadcn
 * components the template always ships, so we diff against a per-template
 * baseline manifest and keep only what actually differs.
 */

/** Skip generated, vendored and platform directories. */
function findCommand(root: string = SANDBOX_ROOT): string {
  return [
    `find ${root} -type f`,
    `-not -path '*/node_modules/*'`,
    `-not -path '*/.next/*'`,
    `-not -path '*/.git/*'`,
    `-not -path '*/vibe/*'`,
    `-not -path '*/.cache/*'`,
    `-not -name '*.log'`,
    `-size -256k`,
    `-exec md5sum {} +`,
  ].join(" ");
}

const MAX_RECONCILED_FILES = 60;

export type Manifest = Record<string, string>;

/** Parse `md5sum` output into { relativePath: hash }. */
function parseManifest(stdout: string): Manifest {
  const manifest: Manifest = {};
  for (const line of stdout.split("\n")) {
    const match = line.match(/^([0-9a-f]{32})\s+(.+)$/);
    if (!match) continue;
    const [, hash, absPath] = match;
    const path = normalizeFilePath(absPath.trim());
    if (path) manifest[path] = hash;
  }
  return manifest;
}

export async function readSandboxManifest(
  sandbox: Sandbox,
  root: string = SANDBOX_ROOT,
): Promise<Manifest> {
  const result = await sandbox.commands
    .run(findCommand(root), { timeoutMs: 60_000 })
    .catch(() => null);
  if (!result || result.exitCode !== 0) return {};
  return parseManifest(result.stdout);
}

function md5(content: string): string {
  return createHash("md5").update(content, "utf8").digest("hex");
}

/**
 * Record what a pristine sandbox looks like for this template.
 *
 * Must be called between `Sandbox.create` and any file write — that is the only
 * moment an untouched sandbox exists. Captured once per template id, so a
 * rebuilt template re-captures automatically.
 */
export async function captureTemplateBaseline(sandbox: Sandbox): Promise<void> {
  const templateId = serverEnv().E2B_TEMPLATE_ID;

  const existing = await prisma.templateBaseline.findUnique({
    where: { templateId },
    select: { templateId: true },
  });
  if (existing) return;

  const manifest = await readSandboxManifest(sandbox);
  const fileCount = Object.keys(manifest).length;
  if (fileCount === 0) return;

  await prisma.templateBaseline
    .create({ data: { templateId, manifest, fileCount } })
    .catch(() => {
      // Another worker captured it first; either copy is equally valid.
    });
}

async function loadBaseline(): Promise<Manifest | null> {
  const templateId = serverEnv().E2B_TEMPLATE_ID;
  const row = await prisma.templateBaseline.findUnique({
    where: { templateId },
    select: { manifest: true },
  });
  if (!row?.manifest || typeof row.manifest !== "object") return null;

  const manifest: Manifest = {};
  for (const [k, v] of Object.entries(row.manifest as Record<string, unknown>)) {
    if (typeof v === "string") manifest[k] = v;
  }
  return manifest;
}

export interface ReconcileResult {
  scanned: number;
  imported: string[];
  skipped: number;
}

/**
 * Import sandbox files that the database does not already have.
 *
 * A file is imported when its hash differs from what we have stored AND it is
 * not an untouched template file. Files identical to the baseline are left
 * alone — the fresh sandbox already provides them on rehydrate, and storing
 * them would bloat every subsequent jsonb write.
 */
export async function reconcileSandboxFiles(
  sandbox: Sandbox,
  projectId: string,
  knownFiles: ProjectFiles,
  opts: { fileRoot?: string } = {},
): Promise<ReconcileResult> {
  // Scoped to the framework's own directory where it has one. A static project
  // would otherwise hash the entire Next template on every run only to discard
  // all of it below.
  const manifest = await readSandboxManifest(
    sandbox,
    opts.fileRoot ? `${SANDBOX_ROOT}/${opts.fileRoot}` : SANDBOX_ROOT,
  );
  const scanned = Object.keys(manifest).length;
  if (scanned === 0) return { scanned: 0, imported: [], skipped: 0 };

  const baseline = await loadBaseline();
  const knownHashes = new Map<string, string>();
  for (const [path, content] of Object.entries(knownFiles)) {
    knownHashes.set(path, md5(content));
  }

  const candidates: string[] = [];
  let skipped = 0;

  for (const [path, hash] of Object.entries(manifest)) {
    // A static project owns only its site directory. Without this the Next
    // scaffold the image ships (package.json, tsconfig, app/) gets imported into
    // a plain-HTML project and follows it around forever.
    if (opts.fileRoot && !path.startsWith(`${opts.fileRoot}/`)) {
      skipped++;
      continue;
    }

    // Platform files are ours, never the user's work.
    if (isProtectedPath(path) && path !== "package.json" && path !== "package-lock.json") {
      skipped++;
      continue;
    }
    // Already stored with identical content.
    if (knownHashes.get(path) === hash) {
      skipped++;
      continue;
    }
    // Untouched template file — the fresh sandbox provides it on rehydrate.
    // When no baseline exists we deliberately import rather than skip: losing
    // the user's files is far worse than storing some redundant ones.
    if (baseline && baseline[path] === hash && !(path in knownFiles)) {
      skipped++;
      continue;
    }
    candidates.push(path);
  }

  if (candidates.length === 0) return { scanned, imported: [], skipped };

  // Bound the work: a runaway CLI that writes hundreds of files should not
  // stall the run. Manifests and source come first.
  candidates.sort((a, b) => {
    const rank = (p: string) =>
      p === "package.json" || p === "package-lock.json" ? 0 : /\.(tsx?|jsx?|json|css)$/.test(p) ? 1 : 2;
    return rank(a) - rank(b) || a.localeCompare(b);
  });

  const selected = candidates.slice(0, MAX_RECONCILED_FILES);
  const patch: Record<string, string> = {};

  for (const path of selected) {
    try {
      const content = await sandbox.files.read(toSandboxPath(path));
      if (typeof content === "string") patch[path] = content;
    } catch {
      // Deleted between the scan and the read; nothing to import.
    }
  }

  if (Object.keys(patch).length > 0) {
    await mergeProjectFiles(projectId, patch);
  }

  return { scanned, imported: Object.keys(patch), skipped };
}
