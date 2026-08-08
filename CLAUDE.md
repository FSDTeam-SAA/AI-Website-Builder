# Vibe — AI Website Builder

An AI website builder: describe an app in chat, watch an agent build it in a live
sandbox, click any element to edit it, and publish a permanent public link.

Originally a fork of the "Vibe" tutorial project (Next.js 15 + tRPC + Prisma +
Clerk + Inngest + E2B). It has since been substantially rewritten — the sections
below describe the current architecture, not the tutorial's.

---

## Commands

```bash
npm run dev          # web on :3000 + Inngest dev server on :8288
npm run build        # production build
npx tsc --noEmit     # typecheck
npx next lint --dir src

npx prisma migrate deploy    # apply migrations (NEVER `migrate dev` — see below)
npx prisma generate
bash scripts/prisma-generate-safe.sh   # regenerate while `npm run dev` is running
```

### Things that will bite you

- **Never run `prisma migrate dev`.** The database is shared with another
  application (`tasks`, `users` tables live in `public`). Vibe's tables are
  isolated in a **`vibe` Postgres schema** via `&schema=vibe` on `DATABASE_URL`.
  `migrate dev` offers to reset the whole schema. Write migration SQL by hand or
  with `prisma migrate diff`, then `migrate deploy`.
- **`prisma generate` fails with EPERM while the dev server runs** — Next holds
  the query-engine DLL open on Windows. Use `scripts/prisma-generate-safe.sh`,
  which generates to a temp dir and copies everything except the engine binary.
- **`next build` and `next dev` fight over `.next`.** If a build fails with
  `PageNotFoundError` on unrelated routes, that's why. Retry or stop the dev
  server.
- **Client components must not import server modules.** Two real build breaks
  came from this: `project-files.ts` pulls in Prisma, and `ai/providers.ts` pulls
  in `@inngest/agent-kit` → OpenTelemetry → `async_hooks`. Dependency-free
  splits exist for exactly this reason — import path helpers from
  `lib/file-paths.ts` and formatters from `lib/ai/format.ts`.

---

## Architecture — the load-bearing ideas

**1. `Project.files` is the canonical file tree.**
A JSON map of `path -> contents` in Postgres. The sandbox is a disposable
runtime rebuilt from it. `Fragment.files` is a *per-turn delta*, not a snapshot —
you cannot reconstruct an app from a Fragment, which is the trap the original
code fell into.

**2. One long-lived sandbox per project, rehydrated on demand.**
`ensureSandbox(projectId)` reconnects if alive, else creates one and replays
`Project.files`. Fixes both broken iteration (the original created a *new empty
sandbox per message*) and dead previews. **Corollary:** `package.json` and
`package-lock.json` must be written and installed *before* source, or a revived
app is module-not-found.

**3. Compile-time `data-vibe-loc` for DOM→source mapping.**
React 19 removed `fiber._debugSource`, so a clicked element carries no file/line
at runtime. A Turbopack loader (`sandbox-templates/nextjs/vibe/loc-loader.cjs`)
splices `data-vibe-loc="path:line:col"` onto JSX opening tags. A runtime
fiber+heuristic descriptor ships alongside as fallback, resolved server-side by
scoring against `Project.files`.

**4. Prompt rules are advisory; tool handlers are law.**
The agent can write any path it's given. Anything the platform depends on
(`next.config.ts`, `instrumentation-client.ts`, `vibe/**`, lockfiles) is
protected by `PROTECTED_PATHS` **inside the tool handler**, which returns an
error string the model can self-correct from.

**5. Static publishing.**
Published sites are static exports in blob storage served at `/p/[slug]` — they
keep working after the sandbox dies. This is why the system prompt forbids route
handlers, server actions and `cookies()`.

---

## Directory map

```
src/
  lib/
    project-files.ts     canonical tree: read/merge/version, optimistic concurrency
    file-paths.ts        path helpers, PROTECTED_PATHS — NO server deps (client-safe)
    code-map.ts          parses files into an exports/routes index for the prompt
    checkpoints.ts       gzipped full-tree snapshots + restore (with deletes)
    framework.ts         NEXTJS vs STATIC_HTML runtime differences
    usage.ts             credits/rate limiting (built, disabled)
    ai/
      providers.ts       model registry: ids, tiers, context windows, pricing
      format.ts          token/cost formatters — NO server deps (client-safe)
      usage-meter.ts     normalises usage across 4 provider response shapes
      token-windows.ts   rolling 5h/24h/7d burn
      vision.ts          image → spec pre-pass via provider REST
    sandbox/
      manager.ts         ensureSandbox, rehydrate, heartbeat, reaper support
      reconcile.ts       imports sandbox-created files back into the DB
      health.ts          checkAppHealth — does the app actually compile/render
    storage/             StorageDriver: db (default) | s3
  inngest/
    functions/
      code-agent.ts      main build/edit run
      surgical-edit.ts   targeted element edit + fix-error
      publish.ts         static export → storage
      sandbox.ts         ensure + reaper + idle sweep crons
    tools/index.ts       agent tools + PROTECTED_PATHS enforcement
    repair.ts            verify-and-repair loop after every run
  modules/
    preview/             previewer, inspector bridge, click-to-edit, activity
    projects/            chat, header, history, model picker, token meter
    publish/             share dialog
    home/                composer, model + framework selectors
sandbox-templates/nextjs/
  vibe/                  inspector, locator, loc-loader, static-server
  e2b.Dockerfile         the sandbox image
```

---

## What's built

**Agent pipeline**
- Surgical tools: `editFile` (exact search/replace), `searchFiles`, `readFile`
  (line-ranged), `listFiles`, `writeFile`, `terminal` (hardened), `checkApp`.
- `<code_map>` in the prompt so the model jumps to the right file instead of
  paying for search → read → read-again.
- Self-verification: `checkApp` before finishing, plus an automatic
  `verifyAndRepair` pass (max 2 attempts) that scrapes compile errors from the
  dev-server log and fixes them.
- Multi-provider registry (OpenAI / Anthropic / Google / xAI) with tiers
  (light / standard / ultra), real context windows and pricing.
- Per-turn checkpoints; sandbox→DB reconciliation so CLI-created files survive.

**Previewer**
- Device presets, zoom, rotate, route bar, fullscreen, sleep/wake states.
- Console drawer with forwarded errors and one-click "Fix with AI".
- Click-to-edit: inline text editing (deterministic, AST-based, no LLM) and
  targeted AI edits aimed at one element.
- Activity tab streaming the code as it's written.

**Data + ownership**
- Checkpoints with restore (deletes files added since — not overwrite-only).
- Server-side ZIP download, project duplicate, rename, delete.
- CodeMirror editor with save-to-sandbox, file create/rename/delete.
- Token meter: per-message, per-project, and rolling 5h/24h/7d windows.

**Other**
- Image attachments (drag/drop/paste) → vision pre-pass → spec in the prompt.
- Markdown rendering in chat.
- Static HTML projects alongside Next.js.
- Publish to `/p/[slug]`; SSE activity stream; stop button.

---

## Key invariants

- `mergeProjectFiles` is the **only** way to mutate `Project.files`. It bumps
  `filesVersion` and supports `expectedVersion` for optimistic concurrency.
- Every write path must also push to the live sandbox so Fast Refresh repaints.
- Inline text edits are **AST-based** (JSXText / StringLiteral / TemplateElement
  only). Never regex the raw file — that would rewrite class names and imports
  that share the substring.
- The deterministic text-edit path **may fail but must never guess**. Ambiguous?
  Return `needs_ai` and fall through to the model with the locator attached.
- Restore must delete files created after the checkpoint, or it leaves orphans.
- The inspector's parent-origin **allowlist** is authority; the `?vibe_parent=`
  query param is only ever matched against it. E2B preview URLs are public.
- Never `postMessage(…, "*")`. Parent also checks
  `event.source === iframe.contentWindow` — the only unforgeable check.

---

## Pending

**Blocking**
1. **Rotate leaked keys.** `env.example` was committed with live Neon / OpenAI /
   E2B / Clerk credentials in commit `1a1270b`. They're in git history.
2. **Build the E2B template.** `E2B_TEMPLATE_ID` is unset, so it falls back to
   the old `vibe-nextjs-test-2` — no inspector, no static server.
   ```bash
   cd sandbox-templates/nextjs
   e2b template build --name vibe-nextjs-v3 --cmd "/compile_page.sh"
   ```

**Not built**
- Custom domains — needs a hosting decision first (TLS for a customer hostname
  must be terminated by the host: Vercel API, or Caddy on-demand TLS).
- Backend for generated apps (database + auth, Lovable's biggest differentiator).
  Collides with static publishing; needs its own design.
- Tests and CI — none at all.
- Security headers / CSP (`next.config.ts` is still the empty stub).
- Root metadata still says "Create Next App"; no `not-found.tsx`;
  `error.tsx` renders the literal string "Global error".
- README describes the pre-refactor architecture.
- OG image generation for shares (meta tags only).
- Usage enforcement is deliberately `false`.

---

## Conventions

- Comments explain **why**, not what. Prefer noting the failure mode a piece of
  code prevents over restating the code.
- Server-only modules start with `import "server-only"`.
- tRPC procedures are all `protectedProcedure` and scope queries by `userId`.
- Costs shown in the UI are **estimates** from a local price table and are
  labelled as such everywhere.
