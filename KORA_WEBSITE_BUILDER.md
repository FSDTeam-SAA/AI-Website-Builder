# Kora website builder

Open `/website-builder`. This mode uses Kora business authentication and the MongoDB website/page models in `backendKoraAi`; it does not require Clerk, Prisma/PostgreSQL, E2B or Inngest to edit static pages.

## Run locally

1. Install dependencies in both `backendKoraAi` and `AI-Website-Builder` with `npm ci`.
2. Configure and run the backend using its existing setup. The account must have a verified email, an active organization and a subscription/plan with the `website` entitlement.
3. Create `.env.local` in `AI-Website-Builder`:

   ```dotenv
   KORA_BACKEND_URL=http://localhost:5000/api/v1
   ```

   Replace the port with the backend's actual port. This is a server-only URL. Use HTTPS in production. No backend signing secrets are needed in the frontend.
4. Run `npm run dev:web` and open `http://localhost:3000/website-builder`.
5. Sign in with the existing business credentials, create a website, and generate a page or create a blank page. Generation uses OpenAI by default. Configure `OPENAI_API_KEY` in `backendKoraAi/.env`, with `WEB_BUILDER_PROVIDER=openai` and `WEB_BUILDER_MODEL=gpt-4.1` (or another model available to your account). See `backendKoraAi/website-builder.env.example`. Anthropic, Gemini and Grok are optional providers carried over from the existing builder registry. Their models appear enabled only when their backend key is configured. The frontend receives availability metadata, never keys; live provider availability still depends on your account. Blank pages do not need an AI key.
6. Use Code to edit HTML/CSS, Canvas to preview and Save to persist. Reopen the website to retrieve saved content.

The builder stores the backend access token in an HttpOnly, SameSite cookie, uses a Secure host-only cookie in production, rejects cross-origin writes and forwards only allowlisted website operations. Authentication is revalidated by the backend on every operation. Expired sessions require sign-in again; refresh-token rotation and cross-app single sign-on are later work. Tokens never appear in navigation URLs or browser-readable storage.

## Core API contract

Base: `/api/v1/business/website-builder`, protected by the existing backend JWT middleware.

| Method | Path | Input / behavior |
| --- | --- | --- |
| GET | `/models` | Provider models, default selection and key availability; no secrets |
| GET | `/context` | Actor, organization and write capability |
| GET | `/websites` | Tenant-scoped paginated list |
| POST | `/websites` | `{ name }`; organization and actor assigned on server |
| GET | `/websites/:siteId` | Owned website, excluding publish snapshots |
| GET | `/brand-kits` | Organization-scoped brand references |
| GET | `/websites/:siteId/pages` | Owned website pages without revision history payloads |
| POST | `/websites/:siteId/pages` | `{ title, slug, html?, css? }` |
| POST | `/websites/:siteId/generate` | `{ prompt, slug, modelId? }`; creates a new draft, never overwrites an existing slug |
| PATCH | `/websites/:siteId/pages/:pageId` | `{ expectedVersion, title?, html?, css? }`; stale revision returns 409 |

Permissions: `website.read` and `website.write` (or `website.*` / owner authority), resolved through existing tenant membership rules. A delegated member must supply the organization header when calling the backend directly. The initial builder UI supports the account's owned organization; delegated-organization selection is not implemented yet. Read-only capability is represented for future session selection.

Both manual and generated HTML pass the same sanitizer as the admin website builder. CSS cannot contain HTML delimiters. The preview uses a sandboxed iframe with a restrictive CSP: generated scripts, forms and access to the parent application are disabled. Page saves preserve previous HTML **and CSS**, and use atomic revision checks. The editor uses explicit saves, local undo/redo and selectable canvas properties. AI edits create proposals that must be reviewed or applied. Publishing creates an immutable release served at `/site/:slug`; later draft changes stay private until published. History supports draft restoration, release rollback and unpublish. Navigation, page SEO, media, brand kits and Board comments persist through the Kora backend. Image upload uses the existing Cloudinary configuration.

## Legacy mode

Existing `/projects/*`, PostgreSQL source files, E2B runtime, checkpoints and `/p/*` public links remain separate. When Clerk keys are configured, the existing home/project flow remains available. Without Clerk configuration, home navigation opens Kora mode and legacy API routes return a configuration error. Do not convert React files into `NvSitePage.html` or reset the shared PostgreSQL database.

## Verification

- Backend: `node --test tests/business-website-builder.test.js` from `backendKoraAi`.
- Frontend: `npx tsc --noEmit`, `npm run lint`, `npm run build`.
- Browser integration: `npx playwright install chromium`, then `npm run test:website-builder` from `AI-Website-Builder`.

Browser tests start an isolated in-memory MongoDB backend on port 4311 and Next.js on port 4310. They use real Kora password login and website persistence with deterministic AI output. They never load backend `.env`, use production databases, send messages or call an AI provider. Test credentials are restricted to this disposable fixture. Browser screenshots are saved under ignored `test-results/`.

## Implementation status and dependencies

Core editor, page management/navigation, proposals, history, publishing, media/brand tools and Board review are implemented. Backend tests exercise tenant boundaries, stale writes, immutable releases and concurrent quotas. MongoDB must support transactions (replica set or Atlas). Browser tests use a disposable replica set and deterministic AI responses. Provider adapter tests verify request routing without sending external requests.

Live OpenAI generation remains unverified until a key is supplied locally. Uploads require Cloudinary configuration. Production owner-session/SSO validation, delegated organization selection, durable generation jobs/accounting and remaining website business modules (bookings, chatbot, commerce/content, analytics and custom domains) remain roadmap work. Disabled sidebar items identify these pending modules; this implementation does not complete the full PDF.

During baseline work, `postcss.config.mjs` contained duplicate declarations plus appended obfuscated code; `api.js` contained a similar appended payload. Both appended blocks were removed without executing them, the normal PostCSS config was restored, and dev/start scripts no longer execute the unrelated API stub. This is a source cleanup, not a forensic audit or a claim about prior execution.

## Canvas interaction tools

Double-click text or right-click an element to inspect it. The properties panel loads its computed typography, supports type sizes and presets, font/weight, line height, letter spacing, colors, alignment, background, corners and padding. Only changed fields are applied. Edit links using approved protocols and add image descriptions. Containers with nested markup require selecting the inner text to preserve their structure.

Open **Sections** to drag rows or use accessible up/down buttons. Reordering stays inside the original parent. The right-click menu supports duplicate, move, select parent and confirmed delete. Changes enter local undo/redo and remain drafts until **Save**. Save preserves the current page's local undo history; switching/reloading pages starts a new local history. Ctrl/Cmd+S saves, Ctrl/Cmd+Z undoes and Ctrl/Cmd+Shift+Z redoes, including inside the canvas. Text inputs retain their own text undo.
