import "server-only";

import { gunzipSync, gzipSync } from "zlib";

import { prisma } from "@/lib/db";
import type { CheckpointKind } from "@/generated/prisma";
import { getProjectFiles, type ProjectFiles } from "@/lib/project-files";
import { connectIfAlive, writeFilesToSandbox } from "@/lib/sandbox/manager";

/**
 * File-tree history.
 *
 * `Project.files` is overwritten in place by every agent run and every edit, so
 * without snapshots a bad turn is unrecoverable. These are full snapshots, not
 * deltas — `Fragment.files` already demonstrated that a delta chain cannot
 * reconstruct a tree on its own.
 */

/** Keep every MANUAL/PRE_RESTORE checkpoint, plus this many rolling others. */
const ROLLING_LIMIT = 40;
/** Manual editor saves snapshot at most this often. */
export const AUTO_CHECKPOINT_INTERVAL_MS = 10 * 60 * 1000;

export interface CheckpointSummary {
  id: string;
  kind: CheckpointKind;
  label: string;
  filesVersion: number;
  fileCount: number;
  sizeBytes: number;
  createdAt: Date;
}

function pack(files: ProjectFiles): { snapshot: Buffer; fileCount: number; sizeBytes: number } {
  const json = JSON.stringify(files);
  return {
    snapshot: gzipSync(Buffer.from(json, "utf8"), { level: 6 }),
    fileCount: Object.keys(files).length,
    sizeBytes: Buffer.byteLength(json, "utf8"),
  };
}

function unpack(snapshot: Uint8Array): ProjectFiles {
  const json = gunzipSync(Buffer.from(snapshot)).toString("utf8");
  const parsed = JSON.parse(json) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: ProjectFiles = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export async function createCheckpoint(
  projectId: string,
  opts: { kind: CheckpointKind; label: string; messageId?: string },
): Promise<CheckpointSummary | null> {
  const { files, filesVersion } = await getProjectFiles(projectId);
  // An empty tree carries no recoverable state; snapshotting it just adds noise
  // to the timeline.
  if (Object.keys(files).length === 0) return null;

  const packed = pack(files);
  const created = await prisma.checkpoint.create({
    data: {
      projectId,
      kind: opts.kind,
      label: opts.label.slice(0, 200),
      messageId: opts.messageId,
      snapshot: packed.snapshot,
      filesVersion,
      fileCount: packed.fileCount,
      sizeBytes: packed.sizeBytes,
    },
    select: {
      id: true,
      kind: true,
      label: true,
      filesVersion: true,
      fileCount: true,
      sizeBytes: true,
      createdAt: true,
    },
  });

  await pruneCheckpoints(projectId);
  return created;
}

/**
 * Snapshot only if the newest AUTO checkpoint is older than the interval.
 * Used by the code editor so a burst of saves doesn't fill the timeline.
 */
export async function maybeAutoCheckpoint(projectId: string, label: string) {
  const latest = await prisma.checkpoint.findFirst({
    where: { projectId, kind: "AUTO" },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });

  if (latest && Date.now() - latest.createdAt.getTime() < AUTO_CHECKPOINT_INTERVAL_MS) {
    return null;
  }
  return createCheckpoint(projectId, { kind: "AUTO", label });
}

export async function listCheckpoints(projectId: string): Promise<CheckpointSummary[]> {
  return prisma.checkpoint.findMany({
    where: { projectId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      kind: true,
      label: true,
      filesVersion: true,
      fileCount: true,
      sizeBytes: true,
      createdAt: true,
    },
  });
}

export async function readCheckpointFiles(
  projectId: string,
  checkpointId: string,
): Promise<ProjectFiles | null> {
  const row = await prisma.checkpoint.findFirst({
    where: { id: checkpointId, projectId },
    select: { snapshot: true },
  });
  if (!row) return null;
  return unpack(row.snapshot);
}

export interface RestoreResult {
  filesVersion: number;
  restored: number;
  deleted: number;
  updated: number;
  preRestoreCheckpointId: string | null;
  syncedToSandbox: boolean;
}

/**
 * Roll a project back to a checkpoint.
 *
 * Critically this DELETES files created after the checkpoint. An
 * overwrite-only restore would leave orphans behind — a component the user
 * asked to remove would keep rendering, which is worse than not restoring at
 * all.
 */
export async function restoreCheckpoint(
  projectId: string,
  checkpointId: string,
): Promise<RestoreResult> {
  const checkpoint = await prisma.checkpoint.findFirst({
    where: { id: checkpointId, projectId },
    select: { id: true, label: true, snapshot: true },
  });
  if (!checkpoint) throw new Error("Checkpoint not found");

  const target = unpack(checkpoint.snapshot);
  const { files: current } = await getProjectFiles(projectId);

  // Snapshot the present first, so the restore itself can be undone.
  const preRestore = await createCheckpoint(projectId, {
    kind: "PRE_RESTORE",
    label: `Before restoring "${checkpoint.label}"`,
  });

  const patch: Record<string, string | null> = {};
  let updated = 0;
  let deleted = 0;

  for (const [path, content] of Object.entries(target)) {
    if (current[path] !== content) {
      patch[path] = content;
      updated++;
    }
  }
  for (const path of Object.keys(current)) {
    if (!(path in target)) {
      patch[path] = null;
      deleted++;
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { filesVersion: true },
    });
    if (!project) throw new Error("Project not found");

    const filesVersion = project.filesVersion + 1;
    await tx.project.update({
      where: { id: projectId },
      data: { files: target, filesVersion, lastActiveAt: new Date() },
    });
    return { filesVersion };
  });

  // Push the diff to the live sandbox so Fast Refresh repaints. If the sandbox
  // is asleep this is a no-op — the next rehydrate replays the restored tree.
  let syncedToSandbox = false;
  if (Object.keys(patch).length > 0) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { sandboxId: true, sandboxStatus: true },
    });
    if (project?.sandboxId && project.sandboxStatus === "RUNNING") {
      const sandbox = await connectIfAlive(project.sandboxId);
      if (sandbox) {
        await writeFilesToSandbox(sandbox, patch);
        syncedToSandbox = true;
      }
    }
  }

  await prisma.agentEvent
    .create({
      data: {
        projectId,
        type: "STATUS",
        label: `Restored "${checkpoint.label}"`,
        detail: { updated, deleted, checkpointId },
      },
    })
    .catch(() => {});

  return {
    filesVersion: result.filesVersion,
    restored: Object.keys(target).length,
    deleted,
    updated,
    preRestoreCheckpointId: preRestore?.id ?? null,
    syncedToSandbox,
  };
}

/**
 * Trim history. Manual and pre-restore points are the ones a user deliberately
 * relies on, so they are never pruned; automatic ones roll.
 */
export async function pruneCheckpoints(projectId: string): Promise<number> {
  const rolling = await prisma.checkpoint.findMany({
    where: { projectId, kind: { in: ["TURN", "AUTO"] } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
    skip: ROLLING_LIMIT,
  });
  if (rolling.length === 0) return 0;

  const result = await prisma.checkpoint.deleteMany({
    where: { id: { in: rolling.map((c) => c.id) } },
  });
  return result.count;
}
