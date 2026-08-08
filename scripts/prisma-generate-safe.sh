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

echo "Prisma client updated ($copied entries; engine binary left in place)."
