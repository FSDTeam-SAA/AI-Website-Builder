import { createHash } from "crypto";

import { prisma } from "@/lib/db";
import { normalizeFilePath } from "@/lib/file-paths";

/** A project's file tree: relative POSIX path -> file contents. */
export type ProjectFiles = Record<string, string>;

// Path helpers live in a dependency-free module so client components (the code
// editor) can import them without pulling Prisma into the browser bundle.
export {
  SANDBOX_ROOT,
  PROTECTED_PATHS,
  isProtectedPath,
  normalizeFilePath,
  toSandboxPath,
} from "@/lib/file-paths";

export function readFilesJson(value: unknown): ProjectFiles {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ProjectFiles = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === "string") out[normalizeFilePath(k)] = v;
  }
  return out;
}

export async function getProjectFiles(projectId: string): Promise<{
  files: ProjectFiles;
  filesVersion: number;
}> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { files: true, filesVersion: true },
  });
  return {
    files: readFilesJson(project?.files),
    filesVersion: project?.filesVersion ?? 0,
  };
}

export class FilesVersionConflictError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number,
  ) {
    super(`Project files changed (expected v${expected}, found v${actual})`);
    this.name = "FilesVersionConflictError";
  }
}

/**
 * Merge a patch into the canonical tree and bump `filesVersion`.
 *
 * `expectedVersion` enables optimistic concurrency: the deterministic text
 * editor passes the version it read, so an agent run that lands mid-edit causes
 * a clean conflict instead of silently clobbering one side.
 *
 * A `null` value in `patch` deletes the file.
 */
export async function mergeProjectFiles(
  projectId: string,
  patch: Record<string, string | null>,
  opts: { expectedVersion?: number } = {},
): Promise<{ files: ProjectFiles; filesVersion: number }> {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { files: true, filesVersion: true },
    });
    if (!project) throw new Error(`Project ${projectId} not found`);

    if (
      opts.expectedVersion !== undefined &&
      opts.expectedVersion !== project.filesVersion
    ) {
      throw new FilesVersionConflictError(
        opts.expectedVersion,
        project.filesVersion,
      );
    }

    const files = readFilesJson(project.files);
    for (const [rawPath, content] of Object.entries(patch)) {
      const path = normalizeFilePath(rawPath);
      if (!path) continue;
      if (content === null) delete files[path];
      else files[path] = content;
    }

    const filesVersion = project.filesVersion + 1;
    await tx.project.update({
      where: { id: projectId },
      data: {
        files,
        filesVersion,
        depsHash: computeDepsHash(files),
        lastActiveAt: new Date(),
      },
    });

    return { files, filesVersion };
  });
}

/**
 * Fingerprint of the dependency set, so sandbox rehydration can skip a 30-60s
 * `npm ci` when the tree still matches the template baseline.
 */
export function computeDepsHash(files: ProjectFiles): string | null {
  const pkg = files["package.json"];
  if (!pkg) return null;
  try {
    const parsed = JSON.parse(pkg) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const normalized = JSON.stringify({
      dependencies: sortObject(parsed.dependencies ?? {}),
      devDependencies: sortObject(parsed.devDependencies ?? {}),
    });
    return createHash("sha256").update(normalized).digest("hex");
  } catch {
    return null;
  }
}

function sortObject(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Compact listing given to the agent so it knows it is editing an existing app
 * rather than starting from a blank template.
 */
export function buildFileManifest(files: ProjectFiles, limit = 120): string {
  const entries = Object.keys(files)
    .filter((p) => !p.startsWith("components/ui/") && !p.startsWith("node_modules/"))
    .sort();
  const shown = entries.slice(0, limit);
  const lines = shown.map((p) => {
    const lineCount = files[p].split("\n").length;
    return `${p} (${lineCount} lines)`;
  });
  if (entries.length > shown.length) {
    lines.push(`... and ${entries.length - shown.length} more`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// In-process search
// ---------------------------------------------------------------------------

export interface SearchHit {
  path: string;
  line: number;
  text: string;
}

/** Convert a simple glob ("app/**\/*.tsx") to a RegExp. */
export function globToRegExp(glob: string): RegExp {
  const SPECIAL = ".+^${}()|[]\\";
  let out = "";
  let i = 0;

  while (i < glob.length) {
    const c = glob[i];
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          out += "(?:[^/]*/)*"; // "**/" — zero or more directories
          i += 3;
        } else {
          out += ".*";
          i += 2;
        }
      } else {
        out += "[^/]*";
        i += 1;
      }
    } else if (c === "?") {
      out += "[^/]";
      i += 1;
    } else {
      if (SPECIAL.includes(c)) out += "\\";
      out += c;
      i += 1;
    }
  }

  return new RegExp(`^${out}$`);
}


/**
 * Grep the canonical tree in-process.
 *
 * Deliberately not shelled out to the sandbox: this works while the sandbox is
 * cold or asleep, avoids a round-trip per call, and searches exactly the tree
 * that edits will be applied to.
 */
export function searchProjectFiles(
  files: ProjectFiles,
  pattern: string,
  opts: { pathGlob?: string; maxResults?: number; flags?: string } = {},
): { hits: SearchHit[]; truncated: boolean; error?: string } {
  const maxResults = Math.min(opts.maxResults ?? 40, 200);
  let re: RegExp;
  try {
    re = new RegExp(pattern, opts.flags ?? "i");
  } catch (e) {
    return { hits: [], truncated: false, error: `Invalid regular expression: ${String(e)}` };
  }

  const pathRe = opts.pathGlob ? globToRegExp(opts.pathGlob) : null;
  const hits: SearchHit[] = [];

  for (const path of Object.keys(files).sort()) {
    if (pathRe && !pathRe.test(path)) continue;
    const lines = files[path].split("\n");
    for (let i = 0; i < lines.length; i++) {
      if (!re.test(lines[i])) continue;
      if (hits.length >= maxResults) return { hits, truncated: true };
      hits.push({ path, line: i + 1, text: lines[i].slice(0, 300).trimEnd() });
    }
  }

  return { hits, truncated: false };
}

/** Render a file with 1-based line numbers, optionally windowed. */
export function renderWithLineNumbers(
  content: string,
  startLine?: number,
  endLine?: number,
): string {
  const lines = content.split("\n");
  const from = Math.max(1, startLine ?? 1);
  const to = Math.min(lines.length, endLine ?? lines.length);
  const width = String(to).length;
  const out: string[] = [];
  for (let i = from; i <= to; i++) {
    out.push(`${String(i).padStart(width, " ")} | ${lines[i - 1]}`);
  }
  return out.join("\n");
}
