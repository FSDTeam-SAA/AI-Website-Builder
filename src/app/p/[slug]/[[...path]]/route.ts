import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { getAppOrigin } from "@/lib/env";
import { cacheControlFor, contentTypeFor, getStorage } from "@/lib/storage";

/**
 * Public share serving.
 *
 * Static export bytes live in blob storage, so a shared link keeps working
 * forever — it does not depend on a sandbox being alive. HTML is streamed
 * through this origin so the URL stays branded and OG tags can be injected;
 * everything else is redirected to the storage CDN when one is configured, so
 * we do not pay egress twice for assets.
 */

export const dynamic = "force-dynamic";

function notFound(message: string) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Not found</title>` +
      `<div style="font:16px/1.6 system-ui;max-width:34rem;margin:20vh auto;padding:0 1.5rem;text-align:center">` +
      `<h1 style="font-size:1.25rem;margin:0 0 .5rem">Site not found</h1>` +
      `<p style="color:#666;margin:0">${message}</p></div>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

/** Candidate storage keys for a requested path, in priority order. */
function candidateKeys(prefix: string, segments: string[]): string[] {
  const path = segments.join("/");
  if (!path) return [`${prefix}/index.html`];
  if (/\.[a-z0-9]+$/i.test(path)) return [`${prefix}/${path}`];
  return [`${prefix}/${path}/index.html`, `${prefix}/${path}.html`];
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; path?: string[] }> },
) {
  const { slug, path = [] } = await context.params;

  const project = await prisma.project.findUnique({
    where: { shareSlug: slug },
    select: {
      id: true,
      name: true,
      isPublic: true,
      publishStatus: true,
      publishBlobPrefix: true,
    },
  });

  if (!project || !project.publishBlobPrefix) {
    return notFound("This link doesn't point to a published site.");
  }
  if (!project.isPublic) {
    return notFound("This site is not public.");
  }

  const segments = path.filter((p) => p && p !== "." && p !== "..");
  const storage = await getStorage();
  const prefix = project.publishBlobPrefix;

  const isDocument = segments.length === 0 || !/\.[a-z0-9]+$/i.test(segments.join("/"));

  // Redirect non-document assets to the CDN when the driver exposes one.
  if (!isDocument) {
    const key = `${prefix}/${segments.join("/")}`;
    const direct = storage.publicUrl(key);
    if (direct) return NextResponse.redirect(direct, 308);
  }

  for (const key of candidateKeys(prefix, segments)) {
    const object = await storage.get(key);
    if (!object) continue;

    let body: Buffer | string = object.body;

    if (key.endsWith(".html")) {
      // A directory document is served WITHOUT a trailing slash, because Next
      // normalises `/p/slug/` to `/p/slug`. Relative URLs in the page therefore
      // resolve against the parent — `styles/main.css` became `/p/styles/main.css`
      // and 404'd, so every published site rendered unstyled. A <base> pins
      // resolution to the document's own directory, which fixes stylesheets,
      // scripts, images and relative fetches in one go.
      const base = key.endsWith("/index.html")
        ? `/p/${slug}/${segments.length ? `${segments.join("/")}/` : ""}`
        : null;

      body = injectMeta(object.body.toString("utf8"), {
        title: project.name,
        url: `${getAppOrigin()}/p/${slug}${segments.length ? `/${segments.join("/")}` : ""}`,
        base,
      });

      // Sampled so a busy page doesn't hammer the database.
      if (segments.length === 0 && Math.random() < 0.25) {
        prisma.project
          .update({ where: { id: project.id }, data: { viewCount: { increment: 4 } } })
          .catch(() => {});
      }
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": object.contentType || contentTypeFor(key),
        "cache-control": cacheControlFor(key),
        // Published sites are meant to be embeddable.
        "x-frame-options": "ALLOWALL",
        "referrer-policy": "no-referrer-when-downgrade",
        "x-content-type-options": "nosniff",
      },
    });
  }

  const fallback = await storage.get(`${prefix}/404.html`);
  if (fallback) {
    return new NextResponse(fallback.body, {
      status: 404,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  return notFound("That page doesn't exist in this site.");
}

/** Add share metadata and the directory base without disturbing the markup. */
function injectMeta(
  html: string,
  opts: { title: string; url: string; base?: string | null },
): string {
  let out = html;

  // Must come before anything that carries a URL, so it goes directly after
  // <head>. Skipped when the document already declares its own base.
  if (opts.base && !/<base\b/i.test(out)) {
    const tag = `<base href="${escapeAttr(opts.base)}">`;
    out = /<head[^>]*>/i.test(out)
      ? out.replace(/<head[^>]*>/i, (head) => `${head}${tag}`)
      : `${tag}${out}`;
  }

  if (out.includes('property="og:title"')) return out;

  const tags = [
    `<meta property="og:title" content="${escapeAttr(opts.title)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${escapeAttr(opts.url)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="generator" content="Vibe">`,
  ].join("");

  return out.includes("</head>") ? out.replace("</head>", `${tags}</head>`) : out;
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
