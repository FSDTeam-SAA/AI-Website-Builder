import "server-only";

import { serverEnv } from "@/lib/env";

export interface StorageObjectBody {
  body: Buffer;
  contentType: string;
}

export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<StorageObjectBody | null>;
  exists(key: string): Promise<boolean>;
  deletePrefix(prefix: string): Promise<void>;
  /**
   * A URL the browser can fetch directly, when the driver has a public CDN.
   * Returning null makes the app stream the bytes instead.
   */
  publicUrl(key: string): string | null;
}

/** Minimal content-type table — avoids a dependency for a dozen extensions. */
const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  map: "application/json; charset=utf-8",
  webmanifest: "application/manifest+json",
};

export function contentTypeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

/** Static assets are content-hashed by Next and safe to cache forever. */
export function cacheControlFor(path: string): string {
  if (path.includes("/_next/static/")) return "public, max-age=31536000, immutable";
  if (/\.(?:png|jpe?g|gif|webp|avif|svg|ico|woff2?|ttf|otf)$/i.test(path)) {
    return "public, max-age=86400";
  }
  return "public, max-age=0, must-revalidate";
}

let cached: StorageDriver | null = null;

/**
 * Resolve the configured driver.
 *
 * Imported dynamically so the AWS SDK is never pulled in when running on the
 * default `db` driver — which is the common case, and a ~3MB saving.
 */
export async function getStorage(): Promise<StorageDriver> {
  if (cached) return cached;

  if (serverEnv().STORAGE_DRIVER === "s3") {
    const { createS3Driver } = await import("./s3");
    cached = createS3Driver();
  } else {
    const { createDbDriver } = await import("./db");
    cached = createDbDriver();
  }
  return cached;
}
