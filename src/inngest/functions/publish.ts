import { Sandbox } from "@e2b/code-interpreter";
import JSZip from "jszip";

import { prisma } from "@/lib/db";
import { serverEnv } from "@/lib/env";
import { getProjectFiles, SANDBOX_ROOT } from "@/lib/project-files";
import { rehydrateSandbox } from "@/lib/sandbox/manager";
import { frameworkConfig } from "@/lib/framework";
import { cacheControlFor, contentTypeFor, getStorage } from "@/lib/storage";

import { inngest } from "../client";

const BUILD_SANDBOX_TIMEOUT_MS = 12 * 60 * 1000;
const MAX_LOG = 32_000;

/**
 * Config we impose on every published build.
 *
 * Deliberately overwritten rather than merged: generated code cannot be trusted
 * to have set `output: "export"` correctly, and a type error must never block a
 * user from sharing something that renders fine.
 */
function exportConfig(basePath: string): string {
  return `/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  trailingSlash: true,
  basePath: ${JSON.stringify(basePath)},
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};
module.exports = nextConfig;
`;
}

export const publishProjectFunction = inngest.createFunction(
  {
    id: "publish-project",
    concurrency: { key: "event.data.projectId", limit: 1 },
    retries: 0,
    onFailure: async ({ event, error }) => {
      const { projectId, attemptId } = event.data.event.data;
      await prisma.publishAttempt
        .update({
          where: { id: attemptId },
          data: { status: "EXPORT_FAILED", log: String(error).slice(0, MAX_LOG) },
        })
        .catch(() => {});
      await prisma.project
        .update({ where: { id: projectId }, data: { publishStatus: "EXPORT_FAILED" } })
        .catch(() => {});
    },
  },
  { event: "project/publish" },
  async ({ event, step }) => {
    const { projectId, attemptId } = event.data;
    const startedAt = Date.now();

    const project = await step.run("load-project", async () => {
      const row = await prisma.project.findUnique({
        where: { id: projectId },
        select: { shareSlug: true, filesVersion: true, name: true, framework: true },
      });
      if (!row?.shareSlug) throw new Error("Project has no share slug");
      return row;
    });

    const built = await step.run("build-static-export", async () => {
      const { files } = await getProjectFiles(projectId);
      if (Object.keys(files).length === 0) {
        throw new Error("This project has no code to publish yet.");
      }

      // A static site is already its own output. No sandbox, no build, no
      // failure mode — the files go straight to storage.
      if (project.framework === "STATIC_HTML") {
        const zip = new JSZip();
        const root = frameworkConfig("STATIC_HTML").fileRoot;
        let hasEntry = false;

        for (const [path, content] of Object.entries(files)) {
          if (!path.startsWith(`${root}/`)) continue;
          const relative = path.slice(root.length + 1);
          if (relative === "index.html") hasEntry = true;
          zip.file(relative, content);
        }

        if (!hasEntry) {
          return {
            ok: false as const,
            log: "No index.html was found — a static site needs one at its root.",
            zipBase64: null,
          };
        }

        const buffer = await zip.generateAsync({ type: "nodebuffer" });
        return {
          ok: true as const,
          log: "Static site — no build required.",
          zipBase64: buffer.toString("base64"),
        };
      }

      // A dedicated sandbox: swapping next.config.ts under the user's running
      // dev server causes a restart storm and can leave their preview broken.
      const sandbox = await Sandbox.create(serverEnv().E2B_TEMPLATE_ID, {
        timeoutMs: BUILD_SANDBOX_TIMEOUT_MS,
      });

      try {
        await sandbox.commands
          .run("pkill -f 'next dev' || true", { timeoutMs: 20_000 })
          .catch(() => {});

        await rehydrateSandbox(sandbox, files, { baselineDepsHash: null });
        await sandbox.files.write([
          {
            path: `${SANDBOX_ROOT}/next.config.ts`,
            data: exportConfig(`/p/${project.shareSlug}`),
          },
        ]);
        // Both filenames can exist after rehydration; Next would pick one
        // arbitrarily, so remove the alternatives.
        await sandbox.commands
          .run(`cd ${SANDBOX_ROOT} && rm -f next.config.js next.config.mjs && rm -rf .next out`, {
            timeoutMs: 60_000,
          })
          .catch(() => {});

        let log = "";
        const build = await sandbox.commands.run(
          `cd ${SANDBOX_ROOT} && VIBE_INSPECTOR=0 npx next build`,
          {
            timeoutMs: 8 * 60 * 1000,
            onStdout: (d: string) => {
              if (log.length < MAX_LOG * 2) log += d;
            },
            onStderr: (d: string) => {
              if (log.length < MAX_LOG * 2) log += d;
            },
          },
        );

        if (build.exitCode !== 0) {
          return { ok: false as const, log: log.slice(-MAX_LOG), zipBase64: null };
        }

        const zipCheck = await sandbox.commands.run(
          `cd ${SANDBOX_ROOT}/out && zip -qr /tmp/site.zip . && stat -c %s /tmp/site.zip`,
          { timeoutMs: 120_000 },
        );
        if (zipCheck.exitCode !== 0) {
          return {
            ok: false as const,
            log: `${log.slice(-MAX_LOG / 2)}\n\nFailed to package the build output.`,
            zipBase64: null,
          };
        }

        const zipBytes = await sandbox.files.read(`/tmp/site.zip`, { format: "bytes" });
        return {
          ok: true as const,
          log: log.slice(-MAX_LOG),
          zipBase64: Buffer.from(zipBytes).toString("base64"),
        };
      } finally {
        await sandbox.kill().catch(() => {});
      }
    });

    if (!built.ok || !built.zipBase64) {
      await step.run("record-failure", async () => {
        await prisma.publishAttempt.update({
          where: { id: attemptId },
          data: {
            status: "EXPORT_FAILED",
            log: built.log,
            durationMs: Date.now() - startedAt,
          },
        });
        await prisma.project.update({
          where: { id: projectId },
          data: { publishStatus: "EXPORT_FAILED" },
        });
        return true;
      });
      return { ok: false as const };
    }

    const uploaded = await step.run("upload", async () => {
      const storage = await getStorage();
      const prefix = `sites/${project.shareSlug}`;

      // Clear the previous publish so removed pages stop resolving.
      await storage.deletePrefix(`${prefix}/`);

      const zip = await JSZip.loadAsync(Buffer.from(built.zipBase64!, "base64"));
      let fileCount = 0;
      let bytes = 0;

      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        const safe = entry.name
          .replace(/\\/g, "/")
          .split("/")
          .filter((p) => p && p !== "." && p !== "..")
          .join("/");
        if (!safe) continue;

        const body = Buffer.from(await entry.async("uint8array"));
        await storage.put(`${prefix}/${safe}`, body, contentTypeFor(safe));
        fileCount++;
        bytes += body.byteLength;
      }

      return { fileCount, bytes, prefix };
    });

    await step.run("mark-live", async () => {
      await prisma.publishAttempt.update({
        where: { id: attemptId },
        data: {
          status: "LIVE",
          log: built.log,
          fileCount: uploaded.fileCount,
          bytes: uploaded.bytes,
          durationMs: Date.now() - startedAt,
        },
      });
      await prisma.project.update({
        where: { id: projectId },
        data: {
          publishStatus: "LIVE",
          publishedAt: new Date(),
          publishedFilesVersion: project.filesVersion,
          publishBlobPrefix: uploaded.prefix,
          isPublic: true,
        },
      });
      return true;
    });

    return { ok: true as const, ...uploaded };
  },
);

export { cacheControlFor };
