/**
 * Splices `data-vibe-loc="path:line:col"` onto every JSX opening tag.
 *
 * This is a parse-and-splice, not a Babel transform: we parse with
 * @babel/parser (the fastest JSX parser available in JS), then insert a literal
 * attribute string with magic-string. There is no code generation, so nothing
 * about the source formatting changes and the cost is ~1-3ms per file.
 *
 * Why this exists: React 19 removed `fiber._debugSource` and `element._source`,
 * so a clicked DOM node carries no file/line at runtime. Baking the location in
 * at compile time is the only exact answer available.
 *
 * Safety properties that matter:
 *   - never throws — any parse failure returns the source untouched, so a
 *     syntax error in generated code degrades the inspector rather than
 *     breaking the build;
 *   - the attribute is baked before hydration, so SSR and client markup agree
 *     and no hydration mismatch is possible;
 *   - the bundler sees the modified source but `tsc` does not, so a
 *     `data-vibe-loc` on a strictly-typed component prop never fails typecheck;
 *   - disabled unless VIBE_INSPECTOR=1, so published static exports are clean.
 */

const path = require("path");

let parse;
let MagicString;
try {
  ({ parse } = require("@babel/parser"));
  // magic-string ships ESM with CJS interop, so require() hands back the module
  // namespace rather than the constructor.
  const magicModule = require("magic-string");
  MagicString = magicModule.default || magicModule;
} catch {
  // Dependencies missing — degrade to a pass-through rather than break the app.
}

/** Tags where the attribute would be invalid or useless. */
const SKIP_TAGS = new Set(["html", "head", "body", "Fragment", "React.Fragment"]);

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  if (typeof node.type === "string") visit(node);

  for (const key of Object.keys(node)) {
    if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visit);
    } else if (value && typeof value === "object") {
      walk(value, visit);
    }
  }
}

module.exports = function vibeLocLoader(source) {
  if (process.env.VIBE_INSPECTOR !== "1") return source;
  if (!parse || !MagicString) return source;

  const resourcePath = (this && this.resourcePath) || "";
  const abs = resourcePath.replace(/\\/g, "/");

  if (!abs) return source;
  if (abs.includes("/node_modules/")) return source;
  // Vendored shadcn primitives are identical in every project; annotating them
  // adds noise and their elements are never what a user means to select.
  if (abs.includes("/components/ui/")) return source;
  if (abs.includes("/vibe/")) return source;
  if (source.indexOf("<") === -1) return source;

  const root = (process.env.VIBE_ROOT || "/home/user").replace(/\\/g, "/");
  const rel = path.posix.relative(root, abs) || path.posix.basename(abs);

  let ast;
  try {
    ast = parse(source, {
      sourceType: "module",
      errorRecovery: true,
      plugins: ["typescript", "jsx", "decorators-legacy"],
    });
  } catch {
    return source;
  }

  try {
    const magic = new MagicString(source);
    let touched = false;

    walk(ast, (node) => {
      if (node.type !== "JSXOpeningElement") return;
      const name = node.name;
      if (!name || name.type !== "JSXIdentifier") return; // skip <Foo.Bar> and <this.X>
      if (SKIP_TAGS.has(name.name)) return;
      if (
        Array.isArray(node.attributes) &&
        node.attributes.some(
          (a) => a && a.type === "JSXAttribute" && a.name && a.name.name === "data-vibe-loc",
        )
      ) {
        return;
      }
      if (!node.loc || name.end == null) return;

      const { line, column } = node.loc.start;
      magic.appendLeft(name.end, ` data-vibe-loc="${rel}:${line}:${column + 1}"`);
      touched = true;
    });

    return touched ? magic.toString() : source;
  } catch {
    return source;
  }
};
