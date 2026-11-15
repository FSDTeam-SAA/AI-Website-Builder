# NOVYA website builder

This repository is the Next.js frontend for `backendKoraAi`. The backend owns accounts, entitlements, MongoDB records, AI provider calls, media and immutable published releases. The original Vibe database, agent and sandbox runtime has been retired from this deployment. No database records were changed by that cleanup.

## Run and deploy

Install with `npm ci`, copy `env.example` to `.env.local`, set `KORA_BACKEND_URL` including `/api/v1`, and run `npm run dev`. Open `/website-builder`; `/` redirects there.

For Vercel, use the Next.js preset, `npm ci`, `npm run build` and its default output directory. Configure a publicly reachable HTTPS backend API URL. Do not use localhost in production. The frontend needs no database, Clerk, sandbox, job-runner or AI-provider credentials. See [SETUP.md](SETUP.md).

The `/api/kora/*` route is a thin allowlisted proxy, with an HttpOnly session cookie and write origin checks. Tokens never enter browser-readable storage or navigation URLs. Authentication and organization permissions are checked by the backend. `/site/*` forwards published release content. These routes require Next.js server functions; this is not a static export deployment.

## Implemented features

- Website overview, page grid/list/search, page settings/SEO, duplication/deletion and navigation ordering.
- Canvas and source views, desktop/tablet/mobile preview, fullscreen and static ZIP export.
- AI model selection, page generation and persisted edit proposals with apply/review/discard.
- Media selection/upload through backend storage, image descriptions and brand kits.
- Board comments, resolution and AI review proposals.
- Versioned page restoration, publish review, immutable public releases, release rollback and unpublish.

AI generation defaults to OpenAI on the backend. Configure `OPENAI_API_KEY`, `WEB_BUILDER_PROVIDER` and `WEB_BUILDER_MODEL` in `backendKoraAi` only; its `website-builder.env.example` documents optional providers. Uploads require the backend's Cloudinary configuration. Live provider calls require separate operational verification.

## Editor interactions

Double-click or right-click an element to inspect it. Typography controls load computed styles and change only edited fields: font size/presets, family/weight, line height, letter spacing, alignment and color. Appearance controls include background, corners and padding. Links use validated protocols; images support descriptions. Select inner text to edit containers with nested markup safely.

Open Sections to drag rows or use move buttons. Reordering stays inside the original parent. The right-click menu supports duplicate, move, parent selection and confirmed delete. Changes enter local undo/redo and remain drafts until Save. Saving preserves the current page's local history; switching or reloading starts a new history. Ctrl/Cmd+S saves, Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z redoes, including inside the canvas. Text inputs keep native text undo.

Generated content is sanitized by the backend. Preview frames have opaque origins; only the fixed editor bridge is allowed by nonce CSP. Optimistic revisions reject stale writes. Published snapshots remain unchanged by later drafts. Concurrent backend quotas and publication require transaction-capable MongoDB.

## Verification

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test:website-builder`

Browser tests require dependencies in the sibling backend. They start a disposable database/backend on 4311 and isolated frontend on 4310, use real test login and deterministic generation, and do not load backend `.env` or use customer accounts. Screenshots stay in ignored `test-results/`.

Remaining business modules, production SSO/delegated organization selection, durable generation accounting and hosting integrations are tracked in the [implementation plans](docs/implementation/README.md). Planned sidebar tools do not imply those modules are complete. Retired legacy source remains recoverable from Git history.
