# Setup & testing guide

Read this before running the refactored app. Two steps are blocking.

---

## 1. Rotate your leaked credentials (blocking, do this first)

`env.example` was tracked in git and commit `1a1270b` replaced its placeholders
with **live secrets**. They are in your repository history:

- `DATABASE_URL` (Neon, includes the password)
- `OPENAI_API_KEY`
- `E2B_API_KEY`
- `CLERK_SECRET_KEY`

Rotate all four at Neon / OpenAI / E2B / Clerk. `env.example` has been scrubbed
back to placeholders and `.gitignore` now warns about the gap (`.env*` does not
match `env.example` — no leading dot), but **scrubbing the file does not remove
the values from history.**

---

## 2. Build the E2B template (blocking for click-to-edit)

The visual editor lives inside the sandbox image, so it needs a new template.
Requires Docker running plus an E2B login.

```bash
npm i -g @e2b/cli
e2b auth login

cd sandbox-templates/nextjs
e2b template build --name vibe-nextjs-v3 --cmd "/compile_page.sh"
```

Then put the template name in `.env`:

```
E2B_TEMPLATE_ID="vibe-nextjs-v3"
```

Until you do this, `E2B_TEMPLATE_ID` falls back to the old `vibe-nextjs-test-2`.
Everything still works — persistent sandboxes, the previewer, AI editing,
publishing — but element selection falls back to heuristic source matching
instead of exact `file:line` mapping, and inline text editing will more often
route through the AI path.

---

## 3. Database

Already migrated. Your `DATABASE_URL` pointed at a Neon database containing a
**different application's** `tasks` and `users` tables and no Vibe tables at all,
so the app could not have run against it. Vibe's tables now live in a dedicated
`vibe` Postgres schema (`&schema=vibe` was appended to `DATABASE_URL`), leaving
`public` untouched.

```bash
npx prisma migrate status   # should report "up to date"
npx prisma studio           # opens against the vibe schema
```

If you move to a different database, run `npx prisma migrate deploy`.

---

## 4. Environment

New variables (see `env.example` for the full list):

| Variable | Default | Purpose |
|---|---|---|
| `E2B_TEMPLATE_ID` | `vibe-nextjs-test-2` | Sandbox template |
| `AI_MODEL_CODE` | `gpt-4.1` | Main build agent |
| `AI_MODEL_EDIT` | `gpt-4.1` | Surgical edit agent |
| `AI_MODEL_FAST` | `gpt-4o-mini` | Titles and replies |
| `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` / `GROK_API_KEY` | — | Optional; unlocks those models |
| `STORAGE_DRIVER` | `db` | `db` (Postgres, zero infra) or `s3` |
| `USAGE_ENFORCEMENT` | `false` | Records credits without blocking |

`NEXT_PUBLIC_APP_URL` **must** be exact — the sandbox inspector only accepts
postMessage traffic from origins on its allowlist, and this is what populates it.

---

## 5. Run it

```bash
npm run dev     # web on :3000, Inngest dev server on :8288
```

---

## Durability, ownership and editing (round 2)

**Your files are in Postgres**, not just the sandbox. `Project.files` is the canonical
tree; the sandbox is a disposable runtime rebuilt from it.

Two defects that could lose work are now fixed:

- **Terminal-created files.** Previously only `package.json` / `package-lock.json` were
  read back from the sandbox, so anything produced by a shell command —
  `npx shadcn add chart`, any scaffolding CLI — existed only in the sandbox and was
  destroyed on the next rehydrate. Every run now diffs the sandbox against a per-template
  baseline (`TemplateBaseline`) and imports whatever is genuinely new.
- **No history.** `Project.files` was overwritten in place. Every build now writes a
  gzipped full-tree `Checkpoint`, and **History** in the project header restores any of
  them. Restoring snapshots the current state first, so it's reversible, and it *deletes*
  files added since the checkpoint rather than leaving orphans behind.

Getting your code out:

- **Download ZIP** — `/api/projects/<id>/download`, built server-side from the canonical
  tree (the old button could only zip what the browser had already loaded). Add
  `?checkpointId=` to export an older version; the History dialog has per-version
  download buttons.
- **Duplicate** — forks files plus conversation into an independent project.

Editing:

- The **Code** tab is now a real editor (CodeMirror). Ctrl/Cmd+S saves to the database
  *and* the live sandbox, so the preview hot-reloads exactly like an AI edit. Create,
  rename and delete files from the tree. Platform files (`next.config.ts`,
  `instrumentation-client.ts`, `vibe/**`, lockfiles) are refused with an explanation.
  Editing locks while a generation is running, so the two can't clobber each other.
- **Model picker** in the project header, per project. Models without a configured API
  key appear disabled rather than hidden.
- **Stop** button on a running generation.

---

## What to test, in order

1. **New project** — type a prompt on the home page. Watch the chat: it should
   show real agent steps (`Wrote app/page.tsx`, `npm install …`), not rotating
   canned phrases.

2. **Iteration — the single most important check.** Send a follow-up like
   "make the header dark blue". In the Inngest UI (`localhost:8288`) confirm the
   second run **reconnects** to the existing sandbox rather than creating one,
   and that the follow-up *modifies* the page instead of regenerating the app.
   This is the defect that most defined the old behaviour.

3. **Sleep and wake** — kill the sandbox from the E2B dashboard (or wait 30 min)
   and reload the project. Expect "Your preview is asleep" and a Wake button that
   rebuilds the app from `Project.files`, including any npm packages the agent
   installed mid-session.

4. **Previewer** — device presets, zoom, the route bar tracking in-iframe
   navigation, fullscreen. Open the console drawer, trigger a runtime error, and
   use **Fix with AI**.

5. **Click-to-edit** — press the pointer icon, hover to see outlines, click an
   element. The selection bar should name the element *and* its source file.
   Type "make this green and larger" and confirm the agent used `editFile`
   (visible in the activity trace) and touched only that file.

6. **Inline text edit** — press the `T` icon, double-click a heading, retype it,
   press Enter. Expect a repaint in under a second, **no Inngest run**, and a new
   `Edit` row in the database. Then try editing text inside a `.map()` — it
   should decline to guess and hand off to the AI path instead.

7. **Publish** — Share → Publish. Watch `BUILDING → LIVE`, then open `/p/<slug>`
   **in a logged-out incognito window**. Kill the sandbox and reload the share —
   it must still work, because it is served from storage, not from a sandbox.

8. **Limits** — with `USAGE_ENFORCEMENT=false` nothing blocks, but the credits
   widget should move. Flip to `true` to confirm the cap throws.

---

8. **Nothing is lost** — ask the agent to run `npx shadcn@latest add chart` and use it.
   Confirm `components/ui/chart.tsx` shows up in the Code tab, then kill the sandbox,
   wake it, and confirm the app still works. Before this it vanished on rehydrate.

9. **Restore** — make three turns, open **History**, restore to the first. Files added
   in turns 2 and 3 must be **gone**, not just overwritten. Then restore the automatic
   "Before restoring…" checkpoint to come back.

10. **Own your code** — hit `/api/projects/<id>/download`, unzip, `npm install && npm run
    dev`. It should boot. Then duplicate a project and confirm the copy is independent.

11. **Editor** — open a file in the Code tab, edit, Ctrl/Cmd+S. The preview should
    hot-reload in about a second. Try saving `next.config.ts` — it must be refused.
    Start a generation and confirm the editor locks.

---

## Known gaps (deferred, as agreed)

- No GitHub sync — export is ZIP + duplicate.
- No automated tests and no CI.
- `USAGE_ENFORCEMENT` ships `false`; the limiter is wired but not enforcing.
- OG images for share links are basic meta tags, not a generated image.
- The static-export fallback for projects whose build fails (revive-proxy mode)
  is not implemented — a failed publish surfaces the build log and a
  "Fix with AI" button instead.
- README still describes the old architecture.
