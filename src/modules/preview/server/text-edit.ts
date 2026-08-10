import "server-only";

import { parse } from "@babel/parser";
import MagicString from "magic-string";

import { prisma } from "@/lib/db";
import type { VibeElementLocator } from "@/modules/preview/protocol";
import {
  FilesVersionConflictError,
  getProjectFiles,
  mergeProjectFiles,
} from "@/lib/project-files";
import { connectIfAlive, writeFilesToSandbox } from "@/lib/sandbox/manager";

import { resolveLocator, type SourceCandidate } from "./resolve-locator";

export type TextEditResult =
  | {
      status: "applied";
      path: string;
      line: number;
      filesVersion: number;
      editId: string;
      syncedToSandbox: boolean;
    }
  | { status: "ambiguous"; candidates: { path: string; line: number; snippet: string }[] }
  | { status: "needs_ai"; reason: string }
  | { status: "conflict"; message: string };

interface Node {
  type: string;
  start?: number | null;
  end?: number | null;
  loc?: { start: { line: number; column: number }; end: { line: number } } | null;
  [key: string]: unknown;
}

/** Depth-first walk that keeps the ancestor stack, without @babel/traverse. */
function walk(node: Node, visit: (node: Node, ancestors: Node[]) => void, ancestors: Node[] = []) {
  visit(node, ancestors);
  const next = [...ancestors, node];
  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (child && typeof child === "object" && typeof (child as Node).type === "string") {
          walk(child as Node, visit, next);
        }
      }
    } else if (value && typeof value === "object" && typeof (value as Node).type === "string") {
      walk(value as Node, visit, next);
    }
  }
}

interface TextMatch {
  node: Node;
  /** Absolute offsets of the `oldText` occurrence within the file. */
  from: number;
  to: number;
  line: number;
  enclosingFunction: string | null;
}

const JSX_UNSAFE = /[<>{}]/;
const HTML_PATH = /\.html?$/i;
const HTML_RAW_TEXT_TAGS = new Set(["script", "style", "template", "noscript"]);

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (source.charCodeAt(i) === 10) line++;
  }
  return line;
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Find the end of an HTML tag without being fooled by `>` inside quotes. */
function htmlTagEnd(source: string, from: number): number {
  let quote = "";
  for (let i = from + 1; i < source.length; i++) {
    const char = source[i];
    if (quote) {
      if (char === quote) quote = "";
    } else if (char === '"' || char === "'") {
      quote = char;
    } else if (char === ">") {
      return i + 1;
    }
  }
  return source.length;
}

/**
 * Locate visible literal text in a plain HTML document.
 *
 * Attribute values, comments and raw script/style contents are deliberately
 * excluded. This gives static sites the same deterministic edit path as JSX
 * without risking a replacement in code that happens to contain the label.
 */
function findHtmlTextMatches(source: string, oldText: string): TextMatch[] {
  const matches: TextMatch[] = [];
  const needles = [...new Set([oldText, escapeHtmlText(oldText)])].filter(Boolean);
  const lower = source.toLowerCase();
  let rawTag: string | null = null;
  let cursor = 0;

  while (cursor < source.length) {
    if (rawTag) {
      const closing = lower.indexOf(`</${rawTag}`, cursor);
      if (closing === -1) break;
      cursor = closing;
      rawTag = null;
      continue;
    }

    if (source.startsWith("<!--", cursor)) {
      const end = source.indexOf("-->", cursor + 4);
      cursor = end === -1 ? source.length : end + 3;
      continue;
    }

    if (source[cursor] === "<") {
      const end = htmlTagEnd(source, cursor);
      const tag = source.slice(cursor, end);
      const parsed = tag.match(/^<\s*(\/?)\s*([a-z][\w:-]*)/i);
      if (parsed && !parsed[1] && HTML_RAW_TEXT_TAGS.has(parsed[2].toLowerCase())) {
        rawTag = parsed[2].toLowerCase();
      }
      cursor = end;
      continue;
    }

    const nextTag = source.indexOf("<", cursor);
    const end = nextTag === -1 ? source.length : nextTag;
    const segment = source.slice(cursor, end);

    for (const needle of needles) {
      let searchFrom = 0;
      for (;;) {
        const index = segment.indexOf(needle, searchFrom);
        if (index === -1) break;
        const from = cursor + index;
        matches.push({
          node: {
            type: "HTMLText",
            start: from,
            end: from + needle.length,
            loc: { start: { line: lineAt(source, from), column: 0 }, end: { line: lineAt(source, from) } },
          },
          from,
          to: from + needle.length,
          line: lineAt(source, from),
          enclosingFunction: null,
        });
        searchFrom = index + Math.max(1, needle.length);
      }
    }

    cursor = end;
  }

  return matches;
}

function enclosingFunctionName(ancestors: Node[]): string | null {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const node = ancestors[i];
    if (node.type === "FunctionDeclaration") {
      const id = node.id as { name?: string } | null;
      if (id?.name) return id.name;
    }
    if (node.type === "VariableDeclarator") {
      const id = node.id as { name?: string; type?: string } | null;
      if (id?.type === "Identifier" && id.name) return id.name;
    }
  }
  return null;
}

/**
 * Find every place `oldText` appears as literal *content* in the source.
 *
 * Only JSXText, StringLiteral and TemplateElement nodes are considered.
 * Searching the raw file with a regex instead would happily rewrite a class
 * name, an import path or a comment that merely shares the substring.
 */
function findTextMatches(source: string, oldText: string): TextMatch[] {
  let ast: Node;
  try {
    ast = parse(source, {
      sourceType: "module",
      errorRecovery: true,
      plugins: ["typescript", "jsx", "decorators-legacy"],
    }) as unknown as Node;
  } catch {
    return [];
  }

  const matches: TextMatch[] = [];

  walk(ast, (node, ancestors) => {
    if (node.start == null || node.end == null) return;
    if (
      node.type !== "JSXText" &&
      node.type !== "StringLiteral" &&
      node.type !== "TemplateElement"
    ) {
      return;
    }

    const raw = source.slice(node.start, node.end);
    let searchFrom = 0;
    for (;;) {
      const idx = raw.indexOf(oldText, searchFrom);
      if (idx === -1) break;
      const from = node.start + idx;
      matches.push({
        node,
        from,
        to: from + oldText.length,
        line: node.loc?.start.line ?? 1,
        enclosingFunction: enclosingFunctionName(ancestors),
      });
      searchFrom = idx + Math.max(1, oldText.length);
    }
  });

  return matches;
}

/** Produce the replacement source for one match, respecting node syntax. */
function replacementFor(
  match: TextMatch,
  source: string,
  oldText: string,
  newText: string,
): { from: number; to: number; text: string } | null {
  const node = match.node;

  if (node.type === "HTMLText") {
    return { from: match.from, to: match.to, text: escapeHtmlText(newText) };
  }

  if (node.type === "JSXText") {
    // `<` `>` `{` `}` are syntax in JSX text; wrap in an expression container.
    if (JSX_UNSAFE.test(newText)) {
      return { from: match.from, to: match.to, text: `{${JSON.stringify(newText)}}` };
    }
    return { from: match.from, to: match.to, text: newText };
  }

  if (node.type === "StringLiteral") {
    if (node.start == null || node.end == null) return null;
    const current = String(node.value ?? "");
    const updated = current.replace(oldText, newText);
    // Re-emit the whole literal so quoting and escaping stay valid.
    return { from: node.start, to: node.end, text: JSON.stringify(updated) };
  }

  if (node.type === "TemplateElement") {
    // Escape the sequences that would terminate or interpolate the template.
    const escaped = newText.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
    return { from: match.from, to: match.to, text: escaped };
  }

  return null;
}

function narrow(
  matches: TextMatch[],
  locator: VibeElementLocator,
  exactLine: number | null,
  source: string,
): TextMatch[] {
  if (matches.length <= 1) return matches;

  // 1. Within the line window the build-time attribute pointed at.
  if (exactLine !== null) {
    const windowed = matches.filter(
      (m) => m.line >= exactLine - 2 && m.line <= exactLine + 40,
    );
    if (windowed.length === 1) return windowed;
    if (windowed.length > 1) matches = windowed;
  }

  // 2. Inside the component that owns the element.
  const innermost = locator.componentChain.at(-1);
  if (innermost) {
    const scoped = matches.filter((m) => m.enclosingFunction === innermost);
    if (scoped.length === 1) return scoped;
    if (scoped.length > 1) matches = scoped;
  }

  // 3. Sibling text context, which distinguishes repeated labels in a list.
  const prev = locator.prevSiblingText?.trim();
  const next = locator.nextSiblingText?.trim();
  if (prev || next) {
    const scoped = matches.filter((m) => {
      const behind = source.slice(Math.max(0, m.from - 400), m.from);
      const ahead = source.slice(m.to, m.to + 400);
      return (!prev || behind.includes(prev)) && (!next || ahead.includes(next));
    });
    if (scoped.length === 1) return scoped;
  }

  return matches;
}

export async function applyTextEdit(input: {
  projectId: string;
  locator: VibeElementLocator;
  oldText: string;
  newText: string;
  expectedVersion?: number;
}): Promise<TextEditResult> {
  const { projectId, locator, oldText, newText } = input;

  if (oldText.trim().length === 0) {
    return { status: "needs_ai", reason: "The original text is empty." };
  }
  if (oldText === newText) {
    return { status: "needs_ai", reason: "The text did not change." };
  }

  // The single strongest signal that no exact source string exists to patch:
  // the rendered text is composed, interpolated, or comes from a data array.
  if (!locator.textIsLiteral) {
    return {
      status: "needs_ai",
      reason:
        "This text is generated from data or an expression rather than written " +
        "directly in the markup, so it has no single string to replace.",
    };
  }

  const { files, filesVersion } = await getProjectFiles(projectId);
  if (input.expectedVersion !== undefined && input.expectedVersion !== filesVersion) {
    return {
      status: "conflict",
      message: "The project changed while you were editing. Reload and try again.",
    };
  }

  const resolved = resolveLocator(locator, files);
  const ordered: SourceCandidate[] = resolved.candidates;
  if (ordered.length === 0) {
    return { status: "needs_ai", reason: "Could not find which file renders this element." };
  }

  for (const candidate of ordered) {
    const source = files[candidate.path];
    if (!source) continue;
    const isHtml = HTML_PATH.test(candidate.path);
    if (
      isHtml
        ? !source.includes(oldText) && !source.includes(escapeHtmlText(oldText))
        : !source.includes(oldText)
    ) {
      continue;
    }

    const all = isHtml
      ? findHtmlTextMatches(source, oldText)
      : findTextMatches(source, oldText);
    if (all.length === 0) continue;

    const exactLine = resolved.exact?.path === candidate.path ? resolved.exact.line : null;
    const narrowed = narrow(all, locator, exactLine, source);

    if (narrowed.length > 1) {
      // Never guess. Hand the user (or the model) the alternatives instead.
      return {
        status: "ambiguous",
        candidates: narrowed.slice(0, 4).map((m) => ({
          path: candidate.path,
          line: m.line,
          snippet: source.split("\n")[m.line - 1]?.trim().slice(0, 160) ?? "",
        })),
      };
    }

    const match = narrowed[0];
    const replacement = replacementFor(match, source, oldText, newText);
    if (!replacement) continue;

    const magic = new MagicString(source);
    magic.overwrite(replacement.from, replacement.to, replacement.text);
    const updated = magic.toString();

    let merged;
    try {
      merged = await mergeProjectFiles(
        projectId,
        { [candidate.path]: updated },
        { expectedVersion: filesVersion },
      );
    } catch (e) {
      if (e instanceof FilesVersionConflictError) {
        return {
          status: "conflict",
          message: "The project changed while you were editing. Reload and try again.",
        };
      }
      throw e;
    }

    const edit = await prisma.edit.create({
      data: {
        projectId,
        kind: "TEXT",
        filePath: candidate.path,
        oldString: oldText.slice(0, 10000),
        newString: newText.slice(0, 10000),
        locator: locator as unknown as object,
        fromVersion: filesVersion,
        toVersion: merged.filesVersion,
      },
    });

    // Push to the live sandbox so Fast Refresh repaints immediately. If the
    // sandbox is asleep this is a no-op — the next rehydrate replays the tree.
    let syncedToSandbox = false;
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { sandboxId: true, sandboxStatus: true },
    });
    if (project?.sandboxId && project.sandboxStatus === "RUNNING") {
      const sandbox = await connectIfAlive(project.sandboxId);
      if (sandbox) {
        await writeFilesToSandbox(sandbox, { [candidate.path]: updated });
        syncedToSandbox = true;
      }
    }

    return {
      status: "applied",
      path: candidate.path,
      line: match.line,
      filesVersion: merged.filesVersion,
      editId: edit.id,
      syncedToSandbox,
    };
  }

  return {
    status: "needs_ai",
    reason:
      "The text could not be located as a literal string in the source — it may " +
      "come from a shared component's default.",
  };
}
