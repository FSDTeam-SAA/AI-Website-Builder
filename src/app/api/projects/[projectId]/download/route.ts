import JSZip from "jszip";
import { auth } from "@clerk/nextjs/server";

import { prisma } from "@/lib/db";
import { readCheckpointFiles } from "@/lib/checkpoints";
import { getProjectFiles, type ProjectFiles } from "@/lib/project-files";

/**
 * Download the whole project as a ZIP.
 *
 * Built server-side from the canonical tree so it always reflects everything
 * stored — the previous client-side archive could only zip whatever the browser
 * had already fetched, which silently produced partial downloads.
 *
 * `?checkpointId=` exports an earlier snapshot instead of the current state.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function safeName(value: string): string {
  const name = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return name || "vibe-project";
}

/** Reject traversal and absolute paths before they reach the archive. */
function safePath(value: string): string | null {
  const parts = value
    .replace(/\\/g, "/")
    .split("/")
    .filter((p) => p && p !== "." && p !== "..");
  return parts.length ? parts.join("/") : null;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await context.params;
  const { userId } = await auth();

  if (!userId) return new Response("Unauthorized", { status: 401 });

  const project = await prisma.project.findUnique({
    where: { id: projectId, userId },
    select: { id: true, name: true },
  });
  if (!project) return new Response("Not found", { status: 404 });

  const checkpointId = new URL(request.url).searchParams.get("checkpointId");

  let files: ProjectFiles;
  let label = safeName(project.name);

  if (checkpointId) {
    const snapshot = await readCheckpointFiles(projectId, checkpointId);
    if (!snapshot) return new Response("Checkpoint not found", { status: 404 });
    files = snapshot;
    label = `${label}-${checkpointId.slice(0, 8)}`;
  } else {
    files = (await getProjectFiles(projectId)).files;
  }

  if (Object.keys(files).length === 0) {
    return new Response("This project has no files yet", { status: 409 });
  }

  const zip = new JSZip();
  const folder = zip.folder(label);
  if (!folder) return new Response("Could not build the archive", { status: 500 });

  for (const [path, content] of Object.entries(files)) {
    const safe = safePath(path);
    if (safe) folder.file(safe, content);
  }

  folder.file(
    "README.md",
    `# ${project.name}\n\n` +
      `Exported from Vibe on ${new Date().toISOString().slice(0, 10)}.\n\n` +
      "## Running locally\n\n```bash\nnpm install\nnpm run dev\n```\n",
  );

  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${label}.zip"`,
      "content-length": String(buffer.byteLength),
      "cache-control": "no-store",
    },
  });
}
