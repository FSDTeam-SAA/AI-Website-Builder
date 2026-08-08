import { parse } from "@babel/parser";

import type { ProjectFiles } from "@/lib/project-files";

/**
 * A compact index of what lives where.
 *
 * The agent used to receive only a list of filenames and line counts, so
 * finding anything meant a `searchFiles` call, then a `readFile`, then often
 * another read of a neighbouring file — three round-trips of prompt tokens
 * before it could make a single edit. Listing each file's exports and routes up
 * front usually lets it go straight to the right file on the first try.
 *
 * Built from a real parse rather than regex so a component defined as
 * `export const Hero = () => …` is found as reliably as `export function Hero`.
 */

export interface FileSummary {
  path: string;
  lines: number;
  /** Exported symbol names. */
  exports: string[];
  /** Local component-looking declarations that are not exported. */
  locals: string[];
  /** Next.js route this file serves, when it is a page. */
  route?: string;
  /** True when the file opens with "use client". */
  clientComponent?: boolean;
}

export interface CodeMap {
  files: FileSummary[];
  routes: { route: string; path: string }[];
  totalFiles: number;
  totalLines: number;
}

const SKIP_PREFIXES = ["node_modules/", "components/ui/", ".next/", "vibe/"];
const PARSEABLE = /\.(tsx|ts|jsx|js|mjs)$/;
/** Above this, parsing costs more than the map saves. */
const MAX_PARSE_BYTES = 200_000;

function shouldIndex(path: string): boolean {
  if (SKIP_PREFIXES.some((p) => path.startsWith(p))) return false;
  return PARSEABLE.test(path);
}

/** "app/blog/[slug]/page.tsx" -> "/blog/[slug]" */
export function routeForPath(path: string): string | undefined {
  const match = path.match(/^app\/(.*\/)?page\.(tsx|jsx|ts|js)$/);
  if (!match) return undefined;
  const segments = (match[1] ?? "")
    .split("/")
    .filter(Boolean)
    // Route groups such as (marketing) do not appear in the URL.
    .filter((s) => !(s.startsWith("(") && s.endsWith(")")));
  return `/${segments.join("/")}`;
}

interface Node {
  type: string;
  [key: string]: unknown;
}

function declarationNames(node: Node | undefined): string[] {
  if (!node) return [];

  if (node.type === "FunctionDeclaration" || node.type === "ClassDeclaration") {
    const id = node.id as { name?: string } | null;
    return id?.name ? [id.name] : [];
  }

  if (node.type === "VariableDeclaration") {
    const out: string[] = [];
    for (const declarator of (node.declarations as Node[]) ?? []) {
      const id = declarator.id as { type?: string; name?: string };
      if (id?.type === "Identifier" && id.name) out.push(id.name);
    }
    return out;
  }

  return [];
}

function summarise(path: string, content: string): FileSummary {
  const lines = content.split("\n").length;
  const summary: FileSummary = { path, lines, exports: [], locals: [] };

  const route = routeForPath(path);
  if (route !== undefined) summary.route = route;
  if (/^\s*["']use client["']/.test(content)) summary.clientComponent = true;

  if (content.length > MAX_PARSE_BYTES) return summary;

  let ast: Node;
  try {
    ast = parse(content, {
      sourceType: "module",
      errorRecovery: true,
      plugins: ["typescript", "jsx", "decorators-legacy"],
    }) as unknown as Node;
  } catch {
    // Unparseable (mid-edit, or not really JS) — the path alone still helps.
    return summary;
  }

  const program = ast.program as Node | undefined;
  const body = (program?.body as Node[]) ?? [];

  for (const node of body) {
    switch (node.type) {
      case "ExportNamedDeclaration": {
        summary.exports.push(...declarationNames(node.declaration as Node));
        for (const spec of (node.specifiers as Node[]) ?? []) {
          const exported = spec.exported as { name?: string } | undefined;
          if (exported?.name) summary.exports.push(exported.name);
        }
        break;
      }
      case "ExportDefaultDeclaration": {
        const names = declarationNames(node.declaration as Node);
        summary.exports.push(names.length ? `default (${names[0]})` : "default");
        break;
      }
      case "FunctionDeclaration":
      case "ClassDeclaration":
      case "VariableDeclaration": {
        for (const name of declarationNames(node)) {
          // Only surface things that look like components or hooks; local
          // constants are noise.
          if (/^[A-Z]/.test(name) || name.startsWith("use")) summary.locals.push(name);
        }
        break;
      }
    }
  }

  summary.exports = [...new Set(summary.exports)];
  summary.locals = [...new Set(summary.locals)].filter(
    (l) => !summary.exports.includes(l),
  );

  return summary;
}

export function buildCodeMap(files: ProjectFiles): CodeMap {
  const summaries: FileSummary[] = [];
  let totalLines = 0;

  for (const path of Object.keys(files).sort()) {
    const content = files[path];
    totalLines += content.split("\n").length;
    if (!shouldIndex(path)) continue;
    summaries.push(summarise(path, content));
  }

  const routes = summaries
    .filter((s) => s.route !== undefined)
    .map((s) => ({ route: s.route!, path: s.path }))
    .sort((a, b) => a.route.localeCompare(b.route));

  return {
    files: summaries,
    routes,
    totalFiles: Object.keys(files).length,
    totalLines,
  };
}

/**
 * Render the map for the prompt.
 *
 * Kept terse deliberately — this ships on every run, so verbosity here is a
 * per-turn tax. One line per file.
 */
export function renderCodeMap(map: CodeMap, limit = 150): string {
  if (map.files.length === 0) return "(no source files yet)";

  const lines: string[] = [];

  if (map.routes.length) {
    lines.push("Routes:");
    for (const { route, path } of map.routes) lines.push(`  ${route} -> ${path}`);
    lines.push("");
  }

  lines.push("Files:");
  for (const file of map.files.slice(0, limit)) {
    const parts: string[] = [`  ${file.path} (${file.lines}L`];
    if (file.clientComponent) parts.push(", client");
    parts.push(")");

    const symbols = [...file.exports, ...file.locals.map((l) => `${l}*`)];
    if (symbols.length) parts.push(` exports: ${symbols.slice(0, 8).join(", ")}`);

    lines.push(parts.join(""));
  }

  if (map.files.length > limit) {
    lines.push(`  … and ${map.files.length - limit} more files`);
  }

  return lines.join("\n");
}
