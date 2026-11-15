# NOVYA Website Builder frontend

This is the Next.js frontend for `backendKoraAi`. The user retired the original Vibe runtime. Do not reintroduce a second database, authentication provider, AI provider pipeline or sandbox backend here.

## Commands

- `npm ci`
- `npm run dev` (port 3000)
- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test:website-builder` (requires sibling backend dependencies)

## Architecture

- `src/modules/website-builder/`: editor, pages, media, brand, Board and release UI.
- `src/lib/kora/client.ts`: browser API adapter and types.
- `src/lib/kora/server.ts`: thin server proxy helper and HttpOnly session cookie.
- `src/app/api/kora/[...path]/route.ts`: allowlisted API proxy with write origin checks.
- `src/app/site/[slug]/[[...page]]/route.ts`: public delivery from backend releases.
- `KORA_BACKEND_URL` is server-only and includes `/api/v1`.
- Business records, permissions, AI generation and billing live in `backendKoraAi`.

Keep tokens out of browser-readable storage and URLs. Preserve sandbox isolation and revision checks. Use backend APIs for persisted changes. Database and provider credentials belong only in the backend. Frontend work requires no database migrations or resets.

Development uses `.next-dev`, browser tests use `.next-browser-tests`, production uses `.next`. Keep those caches separate. Browser tests use a disposable database fixture and deterministic generation.

The retired legacy runtime remains recoverable from Git history if explicitly requested; it is no longer part of the deployed app.
