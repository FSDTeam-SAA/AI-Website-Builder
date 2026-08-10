#!/usr/bin/env node
/**
 * Static file server for STATIC_HTML projects.
 *
 * Serves /home/user/site on port 3000 and injects the inspector into every HTML
 * response. Injection happens here rather than in the generated markup because
 * the agent rewrites index.html freely — a <script> tag it owns would not
 * survive the first regeneration, and click-to-edit would silently stop working.
 *
 * Plain CommonJS with no dependencies so it runs in the sandbox as-is.
 */

const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const ROOT = process.env.VIBE_SITE_ROOT || "/home/user/site";
const PORT = Number(process.env.PORT || 3000);
const INSPECTOR_PATH = "/__vibe/inspector.js";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".webmanifest": "application/manifest+json",
};

/** Resolve a request path inside ROOT, refusing anything that escapes it. */
function resolveSafe(pathname) {
  const decoded = decodeURIComponent(pathname.split("?")[0]);
  const resolved = path.resolve(ROOT, `.${decoded}`);
  if (resolved !== ROOT && !resolved.startsWith(ROOT + path.sep)) return null;
  return resolved;
}

function findFile(target) {
  try {
    const stat = fs.statSync(target);
    if (stat.isFile()) return target;
    if (stat.isDirectory()) {
      const index = path.join(target, "index.html");
      if (fs.existsSync(index)) return index;
    }
  } catch {
    // Fall through to the extension-less retry below.
  }

  // "/about" -> "/about.html"
  if (!path.extname(target) && fs.existsSync(`${target}.html`)) return `${target}.html`;
  return null;
}

function injectInspector(html) {
  const tag = `<script src="${INSPECTOR_PATH}" defer></script>`;
  if (html.includes(INSPECTOR_PATH)) return html;
  if (html.includes("</body>")) return html.replace("</body>", `${tag}</body>`);
  if (html.includes("</html>")) return html.replace("</html>", `${tag}</html>`);
  return html + tag;
}

const server = http.createServer((req, res) => {
  const pathname = url.parse(req.url || "/").pathname || "/";
  // Lets the control plane distinguish this server from the Next scaffold an
  // older sandbox template may still have running on the same port.
  res.setHeader("x-vibe-static-server", "1");

  if (pathname === INSPECTOR_PATH) {
    const bundle = "/home/user/vibe/inspector.bundle.js";
    if (fs.existsSync(bundle)) {
      res.writeHead(200, {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-store",
      });
      fs.createReadStream(bundle).pipe(res);
    } else {
      // No inspector built — the preview still works, only click-to-edit is off.
      res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
      res.end("/* vibe inspector unavailable */");
    }
    return;
  }

  const target = resolveSafe(pathname);
  if (!target) {
    res.writeHead(403, { "content-type": "text/plain" });
    res.end("Forbidden");
    return;
  }

  const file = findFile(target);
  if (!file) {
    const notFound = path.join(ROOT, "404.html");
    if (fs.existsSync(notFound)) {
      const html = injectInspector(fs.readFileSync(notFound, "utf8"));
      res.writeHead(404, { "content-type": MIME[".html"] });
      res.end(html);
      return;
    }
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(
      `<!doctype html><meta charset="utf-8"><title>Not found</title>` +
        `<div style="font:16px/1.6 system-ui;margin:20vh auto;max-width:32rem;text-align:center">` +
        `<h1 style="font-size:1.25rem">404</h1><p style="color:#666">${pathname}</p></div>`,
    );
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";

  if (ext === ".html") {
    const html = injectInspector(fs.readFileSync(file, "utf8"));
    res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    res.end(html);
    return;
  }

  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  fs.createReadStream(file).pipe(res);
});

fs.mkdirSync(ROOT, { recursive: true });
server.listen(PORT, () => {
  console.log(`vibe static server on :${PORT} serving ${ROOT}`);
});
