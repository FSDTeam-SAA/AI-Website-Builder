/**
 * Path helpers shared by the server and the browser.
 *
 * Deliberately dependency-free: `project-files.ts` imports Prisma, so client
 * components cannot import from it without pulling the database client into the
 * bundle. These are the pieces the editor UI needs.
 */

/** Everything in the sandbox lives under this root. */
export const SANDBOX_ROOT = "/home/user";

/**
 * Paths the code agent — and the user's editor — may never write.
 *
 * Prompt rules are advisory; the model can and does ignore them. These are
 * enforced inside the tool handlers and the tRPC mutations, which is the only
 * place a guarantee is possible. Anything the platform depends on to function
 * belongs here.
 */
export const PROTECTED_PATHS: readonly (string | RegExp)[] = [
  // Inspector plumbing — losing these silently breaks click-to-edit.
  /^next\.config\.(ts|js|mjs|cjs)$/,
  /^instrumentation-client\.(ts|js)$/,
  /^vibe\//,
  /^public\/vibe-/,
  // Dependency manifests are reconciled from the sandbox after `npm install`;
  // direct writes desynchronise them from the installed node_modules.
  "package.json",
  "package-lock.json",
  // Secrets and VCS.
  /^\.env/,
  /^\.git\//,
];

export function isProtectedPath(path: string): boolean {
  const p = normalizeFilePath(path);
  return PROTECTED_PATHS.some((rule) =>
    typeof rule === "string" ? p === rule : rule.test(p),
  );
}

/**
 * Coerce whatever the model (or the user) produced into a repo-relative POSIX
 * path.
 *
 * The system prompt demands relative paths, but models routinely emit
 * "/home/user/app/page.tsx", "./app/page.tsx" or backslashes. Normalising here
 * means a stray absolute path is a no-op instead of writing a second, shadow
 * copy of the file that the preview never sees.
 */
export function normalizeFilePath(path: string): string {
  let p = String(path ?? "").trim().replace(/\\/g, "/");
  if (p.startsWith(SANDBOX_ROOT)) p = p.slice(SANDBOX_ROOT.length);
  p = p.replace(/^\/+/, "").replace(/^\.\//, "");

  // Collapse any traversal; a path that escapes the root resolves to nothing.
  const parts: string[] = [];
  for (const seg of p.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") parts.pop();
    else parts.push(seg);
  }
  return parts.join("/");
}

/** Absolute path inside the sandbox for a repo-relative path. */
export function toSandboxPath(path: string): string {
  return `${SANDBOX_ROOT}/${normalizeFilePath(path)}`;
}
