import { gzipSync, gunzipSync } from "zlib";

import { prisma } from "@/lib/db";

import type { StorageDriver } from "./index";

/**
 * Zero-infrastructure driver: published sites live gzipped in Postgres.
 *
 * This exists so publishing works out of the box without provisioning a bucket.
 * A typical exported site is a few megabytes compressed, which Postgres handles
 * comfortably; switch STORAGE_DRIVER to "s3" once traffic justifies a CDN.
 */
export function createDbDriver(): StorageDriver {
  return {
    async put(key, body, contentType) {
      const gzipped = gzipSync(body, { level: 9 });
      await prisma.storageObject.upsert({
        where: { key },
        create: { key, contentType, gzipped, size: body.byteLength },
        update: { contentType, gzipped, size: body.byteLength },
      });
    },

    async get(key) {
      const row = await prisma.storageObject.findUnique({ where: { key } });
      if (!row) return null;
      return {
        body: gunzipSync(Buffer.from(row.gzipped)),
        contentType: row.contentType,
      };
    },

    async exists(key) {
      const row = await prisma.storageObject.findUnique({
        where: { key },
        select: { key: true },
      });
      return !!row;
    },

    async deletePrefix(prefix) {
      await prisma.storageObject.deleteMany({ where: { key: { startsWith: prefix } } });
    },

    publicUrl() {
      // Served through the app; there is no direct URL.
      return null;
    },
  };
}
