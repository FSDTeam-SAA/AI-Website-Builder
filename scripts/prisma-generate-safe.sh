#!/usr/bin/env bash
# Regenerate the Prisma client while a dev server is running.
#
# On Windows, `next dev` holds an open handle to
# src/generated/prisma/query_engine-windows.dll.node, and `prisma generate`
# fails with EPERM trying to rename the new engine into place.
#
# The engine binary only changes when the Prisma version changes, so we
# generate into a temporary directory and copy everything except the engine.
# Run plain `npx prisma generate` instead whenever the dev server is stopped.
set -euo pipefail

cd "$(dirname "$0")/.."

TMP_DIR=".prisma-tmp"
TMP_SCHEMA="prisma/schema.tmp.prisma"
TARGET="src/generated/prisma"

cleanup() { rm -rf "$TMP_DIR" "$TMP_SCHEMA"; }
trap cleanup EXIT

rm -rf "$TMP_DIR"
sed "s#output   = \"../src/generated/prisma\"#output   = \"../$TMP_DIR\"#" \
  prisma/schema.prisma > "$TMP_SCHEMA"

npx prisma generate --schema "$TMP_SCHEMA" >/dev/null

copied=0
for entry in "$TMP_DIR"/*; do
  name="$(basename "$entry")"
  case "$name" in
    query_engine-*.node|libquery_engine-*) continue ;;
  esac
  cp -r "$entry" "$TARGET/"
  copied=$((copied + 1))
done

# The generated client embeds the output directory it was generated for, and
# resolves the query engine relative to it. Without rewriting those references
# the client looks for the engine in .prisma-tmp at runtime and dies with
# "Prisma Client could not locate the Query Engine for runtime windows".
node - "$TARGET" "$TMP_DIR" <<'NODE'
const fs = require("fs");
const path = require("path");

const [target, tmpDir] = process.argv.slice(2);
const tmpName = path.basename(tmpDir);
const relTarget = target.replace(/\\/g, "/");

let patched = 0;
for (const file of ["index.js", "edge.js", "schema.prisma"]) {
  const full = path.join(target, file);
  if (!fs.existsSync(full)) continue;

  let s = fs.readFileSync(full, "utf8");
  if (!s.includes(tmpName)) continue;

  // Three escapings appear: a posix relative path, a bare name, and a
  // JSON-escaped Windows absolute path.
  s = s.split(`../${tmpName}`).join(`../${relTarget}`);
  s = s.split(`\\\\${tmpName}`).join(`\\\\${relTarget.replace(/\//g, "\\\\")}`);
  s = s.split(tmpName).join(relTarget);

  fs.writeFileSync(full, s);
  patched++;
}
console.log(`  repointed ${patched} file(s) at ${relTarget}`);
NODE

if grep -rq "$(basename "$TMP_DIR")" "$TARGET" 2>/dev/null; then
  echo "ERROR: generated client still references $TMP_DIR." >&2
  echo "Stop the dev server and run 'npx prisma generate' instead." >&2
  exit 1
fi

echo "Prisma client updated ($copied entries; engine binary left in place)."
