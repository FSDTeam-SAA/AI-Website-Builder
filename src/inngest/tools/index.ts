import { z } from "zod";
import { createTool } from "@inngest/agent-kit";
import type { Sandbox } from "@e2b/code-interpreter";

import { prisma } from "@/lib/db";
import {
  SANDBOX_ROOT,
  isProtectedPath,
  mergeProjectFiles,
  normalizeFilePath,
  renderWithLineNumbers,
  searchProjectFiles,
  toSandboxPath,
  type ProjectFiles,
} from "@/lib/project-files";
import { writeFilesToSandbox } from "@/lib/sandbox/manager";
import { checkAppHealth } from "@/lib/sandbox/health";

/** Output cap per tool result, so one `npm install` can't blow the context. */
const MAX_OUTPUT = 24_000;
const TERMINAL_TIMEOUT_MS = 240_000;

/**
 * Commands that would fight the running dev server or corrupt the workspace.
 *
 * The prompt already forbids these, but prompt rules are advisory — a model
 * that runs `next build` mid-session kills hot reload for the user, and only a
 * handler-level check can actually prevent it.
 */
const BLOCKED_COMMANDS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /\b(?:next\s+(?:dev|build|start)|(?:npm|yarn|pnpm|bun)\s+(?:run\s+)?(?:dev|build|start))\b/,
    reason:
      "The dev server is already running with hot reload. Never start, restart or build the app.",
  },
  {
    pattern: /\brm\s+(?:-[a-zA-Z]+\s+)*\/(?:\s|$)/,
    reason: "Refusing to delete the filesystem root.",
  },
  {
    pattern: /\b(?:shutdown|reboot|halt|poweroff)\b/,
    reason: "Not available in the sandbox.",
  },
];

export interface ToolContext {
  projectId: string;
  messageId?: string;
  sandbox: Sandbox;
  /** Live view of the canonical tree; kept in sync as tools write. */
  files: ProjectFiles;
  /** Files this run touched — persisted as the Fragment delta. */
  touched: Record<string, string>;
  /** Live preview URL, so the agent can verify its own work. */
  previewUrl?: string;
  /**
   * How long to let the app settle before reading its log. Zero for frameworks
   * that serve straight off disk and so have nothing to recompile.
   */
  settleMs?: number;
  /** Whether npm manifests belong to this project. Assumed true when unset. */
  usesNpm?: boolean;
  /** Framework file root ("site" for static). Applied to every tool path. */
  fileRoot?: string;
  /**
   * Bumped on every write, and recorded by `checkApp` when its verdict was
   * clean. Equal values mean nothing has changed since a passing check, which
   * lets the post-run repair pass skip a duplicate health check.
   */
  writeSeq?: number;
  verifiedAtSeq?: number;
  /** Monotonic sequence for ordering activity events. */
  emit: (
    type: "STATUS" | "THINKING" | "TOOL_CALL" | "TOOL_RESULT" | "FILE_WRITE" | "TERMINAL" | "ERROR" | "DONE",
    label: string,
    detail?: unknown,
  ) => Promise<void>;
}

export function createAgentEventEmitter(projectId: string, messageId?: string) {
  return async (
    type: "STATUS" | "THINKING" | "TOOL_CALL" | "TOOL_RESULT" | "FILE_WRITE" | "TERMINAL" | "ERROR" | "DONE",
    label: string,
    detail?: unknown,
  ) => {
    try {
      await prisma.agentEvent.create({
        data: {
          projectId,
          messageId,
          type,
          label: label.slice(0, 500),
          detail: detail === undefined ? undefined : (JSON.parse(
            JSON.stringify(detail, (_k, v) =>
              typeof v === "string" && v.length > 4000 ? `${v.slice(0, 4000)}…` : v,
            ),
          ) as object),
        },
      });
    } catch {
      // Activity logging must never break a run.
    }
  };
}

/**
 * Resolve a model-supplied path to where the file actually lives.
 *
 * A static project is rooted at `site/` so it cannot mix with the Next scaffold
 * the template image ships — but that prefix is an implementation detail, and
 * the model omits it as often as not. It used to get away with it only because
 * the seed files carried the prefix and it copied them; asked to write a new
 * file it produced `index.html`, which the static server never serves. Applying
 * the root here makes the placement independent of what the model guessed.
 */
function resolvePath(ctx: ToolContext, path: string): string {
  const key = normalizeFilePath(path);
  const root = ctx.fileRoot;
  if (!key || !root) return key;
  return key === root || key.startsWith(`${root}/`) ? key : `${root}/${key}`;
}

function truncate(value: string, max = MAX_OUTPUT): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}\n… [truncated ${value.length - max} characters]`;
}

/** Cap on how much file content rides along on a live activity event. */
const MAX_STREAMED_CONTENT = 16_000;

function countLines(value: string): number {
  return value ? value.split("\n").length : 0;
}

/**
 * Apply file changes to both the sandbox and the canonical tree, and emit an
 * event carrying the new content so the UI can show the code as it lands.
 */
async function persistWrites(
  ctx: ToolContext,
  patch: Record<string, string>,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;

  // Captured before the merge so the event can report what actually changed.
  const previous: Record<string, string | undefined> = {};
  for (const path of Object.keys(patch)) previous[path] = ctx.files[path];

  await writeFilesToSandbox(ctx.sandbox, patch);
  await mergeProjectFiles(ctx.projectId, patch);
  ctx.writeSeq = (ctx.writeSeq ?? 0) + 1;

  for (const [path, content] of Object.entries(patch)) {
    ctx.files[path] = content;
    ctx.touched[path] = content;

    const before = previous[path];
    await ctx.emit("FILE_WRITE", `${before === undefined ? "Created" : "Updated"} ${path}`, {
      path,
      isNew: before === undefined,
      lines: countLines(content),
      linesBefore: before === undefined ? 0 : countLines(before),
      // The UI renders this live; truncated so one huge file cannot flood the
      // event stream.
      content: content.slice(0, MAX_STREAMED_CONTENT),
      truncated: content.length > MAX_STREAMED_CONTENT,
    });
  }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

export function createTerminalTool(ctx: ToolContext) {
  return createTool({
    name: "terminal",
    description:
      "Run a shell command in the project root. Use this to install npm packages " +
      "(e.g. `npm install zustand --yes`). Never start, build or restart the app.",
    parameters: z.object({
      command: z.string().describe("The shell command to run"),
    }),
    handler: async ({ command }) => {
      for (const { pattern, reason } of BLOCKED_COMMANDS) {
        if (pattern.test(command)) {
          await ctx.emit("TOOL_RESULT", `Blocked command: ${command.slice(0, 80)}`);
          return `ERROR: This command is not allowed. ${reason}`;
        }
      }

      await ctx.emit("TERMINAL", command.slice(0, 200), { command });

      const buffers = { stdout: "", stderr: "" };
      try {
        const result = await ctx.sandbox.commands.run(command, {
          cwd: SANDBOX_ROOT,
          timeoutMs: TERMINAL_TIMEOUT_MS,
          onStdout: (data: string) => {
            if (buffers.stdout.length < MAX_OUTPUT * 2) buffers.stdout += data;
          },
          onStderr: (data: string) => {
            if (buffers.stderr.length < MAX_OUTPUT * 2) buffers.stderr += data;
          },
        });

        // Reconcile the manifests after any install: the tree in the database
        // is what a future rehydrate replays, and it must include whatever
        // dependencies were just added.
        if (/\b(?:npm|yarn|pnpm|bun)\b.*\b(?:install|add|remove|uninstall)\b/.test(command)) {
          await syncManifests(ctx, { usesNpm: ctx.usesNpm !== false });
        }

        const output = result.stdout || result.stderr || "(no output)";
        return truncate(output);
      } catch (e) {
        const message = `Command failed: ${e instanceof Error ? e.message : String(e)}`;
        await ctx.emit("ERROR", message.slice(0, 200));
        // Returned as text, not thrown: the model can read the failure and
        // correct course, which is far more useful than aborting the run.
        return truncate(
          `${message}\nstdout:\n${buffers.stdout}\nstderr:\n${buffers.stderr}`,
        );
      }
    },
  });
}

/** Pull package.json / package-lock.json back out of the sandbox into the tree. */
export async function syncManifests(
  ctx: ToolContext,
  opts: { usesNpm: boolean },
): Promise<void> {
  // A static site has no npm manifests of its own. Reading them anyway pulled
  // the template image's Next scaffold — including a ~700KB lockfile — into the
  // project tree on every single run.
  if (!opts.usesNpm) return;

  const patch: Record<string, string> = {};
  for (const name of ["package.json", "package-lock.json"]) {
    try {
      const content = await ctx.sandbox.files.read(toSandboxPath(name));
      // Unchanged manifests are the normal case. Merging them regardless
      // rewrote the whole file tree jsonb and bumped filesVersion for nothing.
      if (typeof content === "string" && ctx.files[name] !== content) {
        patch[name] = content;
      }
    } catch {
      // Not present — nothing to reconcile.
    }
  }
  if (Object.keys(patch).length === 0) return;

  await mergeProjectFiles(ctx.projectId, patch);
  for (const [path, content] of Object.entries(patch)) ctx.files[path] = content;
}

export function createListFilesTool(ctx: ToolContext) {
  return createTool({
    name: "listFiles",
    description:
      "List the project's files. Cheap — call this first to orient yourself " +
      "instead of reading files speculatively.",
    parameters: z.object({
      dir: z.string().nullable().describe('Directory to list, e.g. "app". Pass null for all.'),
    }),
    handler: async ({ dir }) => {
      const prefix = dir ? `${resolvePath(ctx, dir)}/` : ctx.fileRoot ? `${ctx.fileRoot}/` : "";
      const paths = Object.keys(ctx.files)
        .filter((p) => p.startsWith(prefix))
        // Vendored shadcn primitives are noise; the model already knows them.
        .filter((p) => !p.startsWith("components/ui/"))
        .sort();

      if (paths.length === 0) return "(no files)";
      return truncate(
        paths.map((p) => `${p} (${ctx.files[p].split("\n").length} lines)`).join("\n"),
      );
    },
  });
}

export function createSearchFilesTool(ctx: ToolContext) {
  return createTool({
    name: "searchFiles",
    description:
      "Search the project's source with a regular expression. Returns file paths, " +
      "line numbers and matching lines. Use this BEFORE reading files — it is the " +
      "fastest way to find where something is defined or rendered.",
    parameters: z.object({
      pattern: z.string().describe("JavaScript regular expression"),
      pathGlob: z.string().nullable().describe('e.g. "app/**/*.tsx", or null for all files'),
      maxResults: z.number().int().min(1).max(80).nullable(),
    }),
    handler: async ({ pattern, pathGlob, maxResults }) => {
      await ctx.emit("TOOL_CALL", `Searching for ${pattern.slice(0, 60)}`);
      const { hits, truncated, error } = searchProjectFiles(ctx.files, pattern, {
        pathGlob: pathGlob ?? undefined,
        maxResults: maxResults ?? 40,
      });
      if (error) return `ERROR: ${error}`;
      if (hits.length === 0) return "No matches.";
      const lines = hits.map((h) => `${h.path}:${h.line}: ${h.text}`);
      if (truncated) lines.push("… more matches omitted; narrow your pattern.");
      return truncate(lines.join("\n"));
    },
  });
}

export function createReadFileTool(ctx: ToolContext) {
  return createTool({
    name: "readFile",
    description:
      "Read a file with line numbers. Pass startLine/endLine to read just a range. " +
      'Use repo-relative paths like "app/page.tsx".',
    parameters: z.object({
      path: z.string(),
      startLine: z.number().int().min(1).nullable(),
      endLine: z.number().int().min(1).nullable(),
    }),
    handler: async ({ path, startLine, endLine }) => {
      const key = resolvePath(ctx, path);
      let content = ctx.files[key];

      if (content === undefined) {
        // Fall back to the sandbox: shadcn primitives and template files are on
        // disk but are not part of the project's own tree.
        try {
          const read = await ctx.sandbox.files.read(toSandboxPath(key));
          if (typeof read === "string") content = read;
        } catch {
          return `ERROR: ${key} does not exist. Use listFiles or searchFiles to find the right path.`;
        }
      }
      if (content === undefined) return `ERROR: ${key} does not exist.`;

      await ctx.emit("TOOL_CALL", `Reading ${key}`);
      return truncate(
        renderWithLineNumbers(content, startLine ?? undefined, endLine ?? undefined),
      );
    },
  });
}

export function createWriteFileTool(ctx: ToolContext) {
  return createTool({
    name: "writeFile",
    description:
      "Create a NEW file, or completely replace a file's contents. To change part " +
      "of an existing file use editFile instead — it is faster and cannot damage " +
      "code you have not read.",
    parameters: z.object({
      path: z.string().describe('Repo-relative, e.g. "app/components/hero.tsx"'),
      content: z.string(),
    }),
    handler: async ({ path, content }) => {
      const key = resolvePath(ctx, path);
      if (!key) return "ERROR: empty path.";
      if (isProtectedPath(key)) {
        return `ERROR: ${key} is managed by the platform and is read-only. Do not modify it.`;
      }

      await persistWrites(ctx, { [key]: content });
      return `Wrote ${key} (${content.split("\n").length} lines).`;
    },
  });
}

export function createEditFileTool(ctx: ToolContext) {
  return createTool({
    name: "editFile",
    description:
      "Apply exact string replacements to one file. `oldString` must appear EXACTLY " +
      "once — include 3+ lines of surrounding context to make it unique. This is the " +
      "preferred way to change existing code: it is fast, cheap, and cannot destroy " +
      "code you did not read.",
    parameters: z.object({
      path: z.string(),
      edits: z
        .array(
          z.object({
            oldString: z.string().min(1),
            newString: z.string(),
            replaceAll: z.boolean().nullable(),
          }),
        )
        .min(1)
        .max(20),
    }),
    handler: async ({ path, edits }) => {
      const key = resolvePath(ctx, path);
      if (isProtectedPath(key)) {
        return `ERROR: ${key} is managed by the platform and is read-only. Do not modify it.`;
      }

      let content = ctx.files[key];
      if (content === undefined) {
        return `ERROR: ${key} does not exist. Use writeFile to create it.`;
      }

      const applied: string[] = [];
      for (const [i, edit] of edits.entries()) {
        if (edit.oldString === edit.newString) {
          return `ERROR: edit ${i + 1} has identical oldString and newString.`;
        }

        const occurrences = countOccurrences(content, edit.oldString);
        if (occurrences === 0) {
          return (
            `ERROR: edit ${i + 1} — oldString not found in ${key}. ` +
            `Read the file again and copy the exact text, including whitespace.`
          );
        }
        if (occurrences > 1 && !edit.replaceAll) {
          return (
            `ERROR: edit ${i + 1} — oldString appears ${occurrences} times in ${key}. ` +
            `Add more surrounding context to make it unique, or set replaceAll: true.`
          );
        }

        content = edit.replaceAll
          ? content.split(edit.oldString).join(edit.newString)
          : content.replace(edit.oldString, edit.newString);
        applied.push(
          `${occurrences > 1 ? `${occurrences}x ` : ""}${edit.oldString.split("\n")[0].trim().slice(0, 60)}`,
        );
      }

      await persistWrites(ctx, { [key]: content });
      await ctx.emit("TOOL_RESULT", `Applied ${edits.length} edit(s) to ${key}`, { path: key, edits: applied });
      return `Applied ${edits.length} edit(s) to ${key}.`;
    },
  });
}

/** Batch create/update — retained for the initial build, where most files are new. */
export function createOrUpdateFilesTool(ctx: ToolContext) {
  return createTool({
    name: "createOrUpdateFiles",
    description:
      "Create or overwrite several files at once. Use this for the initial build. " +
      "For targeted changes to existing files, prefer editFile.",
    parameters: z.object({
      files: z
        .array(z.object({ path: z.string(), content: z.string() }))
        .min(1)
        .max(30),
    }),
    handler: async ({ files }) => {
      const patch: Record<string, string> = {};
      const rejected: string[] = [];

      for (const file of files) {
        const key = resolvePath(ctx, file.path);
        if (!key) continue;
        if (isProtectedPath(key)) {
          rejected.push(key);
          continue;
        }
        patch[key] = file.content;
      }

      await persistWrites(ctx, patch);
      const written = Object.keys(patch);

      let result = written.length ? `Wrote: ${written.join(", ")}` : "No files written.";
      if (rejected.length) {
        result += `\nERROR: refused (platform-managed, read-only): ${rejected.join(", ")}`;
      }
      return result;
    },
  });
}

export function createCheckAppTool(ctx: ToolContext) {
  return createTool({
    name: "checkApp",
    description:
      "Check that the app compiles and renders. Call this when you think you are " +
      "done, BEFORE writing the task summary. Returns any compile or runtime " +
      "errors so you can fix them.",
    parameters: z.object({}),
    handler: async () => {
      if (!ctx.previewUrl) {
        return "The preview is not running, so the app cannot be checked right now.";
      }

      await ctx.emit("STATUS", "Checking the app compiles");
      const report = await checkAppHealth(ctx.sandbox, ctx.previewUrl, {
        settleMs: ctx.settleMs,
      });

      if (report.ok) {
        // Lets the automatic repair pass skip re-checking an app the agent
        // already proved healthy, as long as nothing was written since.
        ctx.verifiedAtSeq = ctx.writeSeq ?? 0;
        await ctx.emit("TOOL_RESULT", "App compiles and renders");
        return "OK — the app compiles and the page renders. You may finish.";
      }

      await ctx.emit("ERROR", report.summary);
      return truncate(
        `The app is currently BROKEN. Fix these before finishing:\n\n${report.errors.join("\n\n")}`,
      );
    },
  });
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let index = haystack.indexOf(needle);
  while (index !== -1) {
    count++;
    index = haystack.indexOf(needle, index + needle.length);
  }
  return count;
}

/** Tool set for a full build. */
export function buildAgentTools(ctx: ToolContext) {
  return [
    createTerminalTool(ctx),
    createListFilesTool(ctx),
    createSearchFilesTool(ctx),
    createReadFileTool(ctx),
    createOrUpdateFilesTool(ctx),
    createEditFileTool(ctx),
    createWriteFileTool(ctx),
    createCheckAppTool(ctx),
  ];
}

/**
 * Tool set for a surgical edit.
 *
 * `createOrUpdateFiles` is deliberately absent: with no batch-rewrite tool
 * available, the model cannot regenerate a whole file when it was asked to
 * change one button.
 */
export function surgicalAgentTools(ctx: ToolContext) {
  return [
    createSearchFilesTool(ctx),
    createReadFileTool(ctx),
    createEditFileTool(ctx),
    createListFilesTool(ctx),
    createTerminalTool(ctx),
    createWriteFileTool(ctx),
    createCheckAppTool(ctx),
  ];
}
