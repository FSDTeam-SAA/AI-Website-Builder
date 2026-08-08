/**
 * Rules shared by every code-writing agent.
 *
 * Extracted so the build prompt and the surgical-edit prompt cannot drift apart
 * on environment facts — a mismatch there produces code that works in one mode
 * and breaks in the other.
 */
export const ENVIRONMENT_RULES = `
Environment:
- You are working inside a running Next.js 15 app at /home/user. You are already in that directory.
- The dev server is ALREADY RUNNING on port 3000 with hot reload. Never start, restart, or build it.
- All Shadcn UI components are pre-installed and imported from "@/components/ui/*".
- Tailwind CSS v4 and PostCSS are preconfigured. Lucide React icons are available.
- Shadcn's dependencies (radix-ui, lucide-react, class-variance-authority, tailwind-merge, clsx) are already installed — never reinstall them.
- Install anything else with the terminal tool: npm install <package> --yes
- Never edit package.json or package-lock.json directly. Use the terminal.

File paths:
- All tool paths are repo-relative: "app/page.tsx", "app/components/hero.tsx".
- NEVER pass absolute paths like "/home/user/app/page.tsx".
- NEVER use the "@" alias in tool paths — "@" is only for imports inside code.
- To inspect a Shadcn component, read "components/ui/button.tsx".

Read-only paths (the platform manages these; writing to them will be refused):
- next.config.ts
- instrumentation-client.ts
- vibe/** and public/vibe-*
These power the live preview and the visual editor. Leave them alone.

Code rules:
- TypeScript only. Production quality — no TODOs, no placeholder stubs.
- Add "use client" as the VERY FIRST LINE of any file using hooks, browser APIs, or event handlers.
- Style exclusively with Tailwind utility classes. Never create or edit .css/.scss/.sass files.
- Import "cn" from "@/lib/utils" — never from "@/components/ui/utils" (that path does not exist).
- Import each Shadcn component from its own path (@/components/ui/button), never grouped.
- Use the real Shadcn API. If unsure of a prop or variant, read the component file first — do not guess.
- Use relative imports for your own components ("./hero", "./task-card").
- PascalCase component names, kebab-case filenames, named exports.
- Split large screens into multiple components rather than one enormous file.
- Semantic HTML, ARIA where it matters, responsive by default.

Content rules:
- Use only static/local data. No external API calls, no network requests at runtime.
- Do not reference image URLs (local or remote). Use emojis, CSS gradients, and
  divs with aspect-video / aspect-square plus a background colour as placeholders.

The published site is exported as a static build. To keep that working:
- Do not add route handlers (app/api/**), server actions, or middleware.
- Do not use cookies(), headers(), or export dynamic = "force-dynamic".
- Any dynamic route ([id]) MUST export generateStaticParams().
- If you use next/image, pass explicit width and height.
`.trim();

export const TASK_SUMMARY_RULES = `
When the task is fully complete — after ALL tool calls have finished — reply with
exactly this and nothing else:

<task_summary>
A short, high-level description of what you created or changed.
</task_summary>

Rules for the summary:
- Print it once, only at the very end. Never between tool calls.
- Do not wrap it in backticks. Do not add commentary before or after it.
- This is the ONLY way to signal that you are finished.
`.trim();
