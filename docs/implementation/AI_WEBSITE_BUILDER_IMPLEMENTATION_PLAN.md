# KoraAI Website Builder: phased implementation plan

Created: 2026-11-05  
Status: core editor, page/navigation management, AI proposals, releases/history, media/brand and Board implemented locally; production and remaining business-module phase gates remain open  
Target application: `AI-Website-Builder`  
Design source: `business_owner-dashboard-koraAI`  
Backend source: `backendKoraAi`  
Visual reference: `business_owner_pages_65_to_365.pdf`

## 1. Objective and scope

Turn the existing AI website builder into the KoraAI business-owner website workspace: generate, edit, preview, publish and manage websites. This file owns website Phases 0-13, including website-specific media, brand, bookings, chatbot, content, commerce, SEO, analytics, domains and Board review. Match the dashboard design system and reuse `backendKoraAi`.

The remaining PDF features are planned in [WORKSPACE_FEATURES_IMPLEMENTATION_PLAN.md](WORKSPACE_FEATURES_IMPLEMENTATION_PLAN.md). Together the two files cover the full PDF; completing this file alone completes the website release, not the full workspace.

This document is the feature roadmap and execution checklist. The PDF remains the detailed visual specification; reopen the relevant full-size screens before implementing each feature. Implementation is underway; see `AI-Website-Builder/KORA_WEBSITE_BUILDER.md` for the current verified scope and configuration.

Delivery boundaries:

- Core release: Phases 0–6, a complete create/edit/preview/publish/manage-pages journey.
- Business website release: Phases 7–9, media, brand, bookings, content and operational integrations.
- Extended release: Phases 10–12, analytics, custom domains and collaborative review.
- Phase 13 verifies and rolls out the website release. Run relevant checks within every phase.
- The companion workspace plan owns Phases 14-27 and the full-PDF acceptance gate. Phase IDs remain continuous across the files to preserve dependencies and coverage references.
- Share business records, sessions, design tokens and backend services across both plans; do not duplicate completed features.

## 2. Reference map

The supplied PDF contains 301 image-based pages. Text extraction does not expose screen labels. Review performed: individual visual inspection of PDF pages 1–20 and 301, with a closer editor review of 2–15, plus contact-sheet survey of pages 1–300. All 301 pages have a feature-phase assignment in Section 2 of the companion workspace plan. Detailed screens must still be reopened at implementation time; thumbnail review is not a field-by-field specification.

All page numbers below are **1-based positions in this supplied PDF**. Based on the filename, the corresponding original page is PDF position + 64; treat that as an inferred source-page mapping.

| PDF pages | Feature group | Planned use |
| --- | --- | --- |
| 1 | Workspace overview | Integration reference; implementation in companion Phase 14 |
| 2–4 | Main editor, initial prompt, Kora working | Core shell and generation flow |
| 5–8 | Preview, tablet, mobile, fullscreen | Device preview and fullscreen |
| 9–11 | Code view, selected element properties, structure/layers | Editing tools |
| 12 | Board review, comments, AI review | Later collaboration phase |
| 13–15 | Review/publish, versions, publish success | Versioned publishing and Website Hub handoff |
| 16–18 | Website overview, publish management, publish history | Website Hub |
| 19–25 | Pages, page detail, navigation, Ask Kora, create-page choices | Page management |
| 26–29 | Services, products, bookings, booking configuration | Business integrations |
| 30–31 | Website chatbot and configuration | Chatbot integration |
| 32–33 | Orders and order detail | Commerce integration |
| 34–35 | Content list and content editing | Structured content management |
| 36–41 | Blogs, article detail, AI/manual/template creation | Blog management |
| 42–44 | SEO, page audit, redirects | SEO tools |
| 45–46 | Website and page analytics | Measured analytics |
| 47–48 | Domains and connection flow | Custom domain setup |
| 49-74 | Media and brand workspace | Website subset in Phase 7; full module in companion Phase 15 |
| 75-301 | Other workspace modules, settings, onboarding and handoff | Companion Phases 14-27 and complete page ledger |

Useful later references: brand settings 213–214, website settings 228, permissions 215–217, usage 248–250, appearance/accessibility/language 271–273.

## 3. What exists today

### 3.1 Builder frontend and runtime

`AI-Website-Builder` uses Next.js 15.3.4, React 19, Tailwind 4, Radix/shadcn components, TanStack Query, tRPC, Clerk, Prisma/PostgreSQL, Inngest and E2B.

Relevant working areas identified in source:

- `src/modules/home/ui/components/`: initial prompt, project list, model/framework choices.
- `src/modules/projects/ui/views/project-view.tsx`: current chat-left / preview-right layout; needs the reference's central canvas / right assistant arrangement.
- `src/modules/projects/ui/components/`: messages, activity, project header, history and attachments.
- `src/modules/preview/`: preview state, inspector bridge, element selection, targeted editing, sandbox status and project event stream.
- `src/components/code-editor.tsx` and `file-explorer.tsx`: existing code tools.
- `src/lib/project-files.ts`, `checkpoints.ts`, `sandbox/`: canonical source files, version conflict handling and sandbox lifecycle.
- `src/modules/publish/`, `src/inngest/functions/publish.ts`: existing static export/share workflow.
- `prisma/schema.prisma`: project files, checkpoints, edits, messages, events, attachments and publish attempts.

These are source-level observations, not proof that every feature currently works in a running deployment. Establish the baseline in Phase 0.

### 3.2 Dashboard design source

Use these sources in order:

1. `business_owner-dashboard-koraAI/app/(dashboard)/owner.css`: current neutral, near-black owner shell, `--nv-*` tokens, navigation, panels and compact controls.
2. `components/layout/sidebar.tsx`, `header.tsx`, and `app/(dashboard)/layout.tsx`: shell behavior and account/navigation patterns.
3. `components/owner/assistant-*.tsx` and `app/(dashboard)/assistant/assistant.css`: Kora conversations and project interactions.
4. `components/ui/`: accessible primitives and control behavior.
5. `lib/dashboard-theme.tsx`, `lib/dashboard-i18n.tsx`, `components/kora-orb.tsx`: theme, language and Kora identity.

Important: `app/globals.css` also contains older navy `--dashboard-*` tokens and broad light-theme overrides. The current owner shell uses `--nv-*`. Port a scoped token/component layer, rather than copying the entire stylesheet and its global selectors.

The dashboard currently intentionally excludes Workspace in `lib/owner-navigation.ts`. Preserve that boundary during the website release. Phase 14 in the companion plan introduces the full workspace entry/handoff required by the PDF, after route/session ownership is decided; add navigation deliberately rather than duplicating dashboard modules in the editor.

### 3.3 Existing backend

Implemented website data and controllers are in:

- `backendKoraAi/model/novyaWorkspace.model.js`
- `backendKoraAi/controller/novyaWorkspace.controller.js`
- `backendKoraAi/route/novyaWorkspace.route.js`
- Public rendering: `route/novyaPublicSites.route.js`
- Public booking: `route/novyaPublicBooking.route.js`
- Tenant resolution: `utils/novyaTenancy.js`
- Business route patterns: `route/novyaBusiness.route.js`

Models include `NvWebsite`, `NvSitePage`, `NvSiteService`, `NvSiteProduct`, `NvSiteOrder`, `NvBlogPost`, `NvDomain`, `NvRedirect`, `NvAsset`, `NvCollection` and `NvBrandKit`.

**Critical access finding:** workspace routes are currently mounted under `/api/v1/novya/workspace`, behind `protect`, `isAdmin`, `platform.administer` and workspace permissions. They are not business-owner APIs. Existing website CRUD is not automatically tenant-scoped, and several direct handlers query by ID alone. Add a business-owner facade with tenant checks; do not remove the platform-admin boundary.

**Critical content finding:** the builder stores application source files in PostgreSQL, whereas Kora's website backend stores sanitized page HTML/CSS in MongoDB. These formats are not interchangeable. Existing backend generation creates a single page synchronously; it does not provide the staged proposals, durable conversation history or detailed progress shown in the PDF.

## 4. Architecture and integration decisions

### 4.1 Recommended default

Keep `AI-Website-Builder` as the website frontend and use `backendKoraAi` as the authority for business websites, pages, brand references, settings, public snapshots and publishing.

For the first Kora website release, use the backend's sanitized HTML/CSS page format. Add a renderer/editor adapter in the builder so preview, direct edits and code edits work against that format. Preserve the existing Next.js/E2B project mode for existing projects, behind an explicit legacy/advanced path. Do not silently convert or delete existing projects.

This avoids sending generated React/Next.js source to an API that expects HTML/CSS, and avoids publishing two divergent copies of one website. Existing inspector/source-edit code is reusable only where its assumptions match the selected content mode. Phase 0 must prove this with a small round trip before the UI implementation grows.

If arbitrary Next.js application generation must become the primary Kora mode later, implement a separately scoped artifact/build integration. It must support immutable exports, asset paths, page navigation and public hosting; this is not a field mapping to `NvSitePage.html`.

### 4.2 Ownership rules

| Concern | Authority / rule |
| --- | --- |
| User identity | Kora backend user and authenticated business session; Clerk identity alone is insufficient |
| Organization and capabilities | Server-resolved tenant and active membership; never trust a requested organization ID without validation |
| Website/pages/settings | Kora MongoDB models |
| Legacy generated apps | Existing Prisma `Project.files` and checkpoints until explicitly migrated |
| New Kora edit proposals/chat/jobs | Proposed backend records linked to tenant, website, page, actor and base revision |
| Published content | Immutable Kora website snapshot selected by `publishedVersion` |
| Assets | Kora asset records and approved storage URLs |
| Bookable service/price/availability | Existing business `Service` and booking systems |
| Commerce payments/stock | Existing verified business/payment records; website CRUD is not a payment engine |
| Unsaved UI state | Local editor state; server revisions determine persisted state |

Use a session adapter consistent with dashboard authentication. If apps remain on separate origins, implement a secure session handoff or backend-supported short-lived exchange; never put bearer tokens in navigation URLs. A Next.js server-side API adapter can forward authenticated requests without exposing backend credentials. Preserve CSRF/origin protection and verify backend JWTs server-side.

## 5. API reuse and gap map

Existing paths below are **platform-admin paths**, not frontend integration targets for owners. Let `A = /api/v1/novya/workspace`. Proposed owner API base: `B = /api/v1/business/website-builder`; `B` does not exist yet.

| Feature | Existing contract | Owner work / remaining gap |
| --- | --- | --- |
| Website list/create/detail/update/delete | `GET/POST A/websites`, `GET/PATCH/DELETE A/websites/:id` | Tenant-scoped facade, field allowlists, safe deletion/archive policy |
| Overview | `GET A/websites/:id/overview` | Counts exist; traffic/conversion metrics do not follow from those counts |
| Generation | `POST A/websites/:id/generate` with `prompt`, optional `pageTitle`, `slug` | Existing call persists immediately; add proposed-change workflow and later durable jobs |
| Pages | `GET/POST A/pages`, `GET/PATCH/DELETE A/pages/:id`; list filter `website_id` | Parent ownership, unique slugs, ordering, homepage behavior, unsaved state |
| Theme/booking/chatbot config | `PATCH A/websites/:id`; fields `theme`, `brandKit_id`, `config` | Explicit nested validation, reference ownership and separate runtime capabilities |
| Publish/history/rollback | `POST A/websites/:id/publish`, `GET .../versions`, `POST .../rollback/:version` | Validations, conflict protection, consistent revision snapshots and restore behavior |
| Page restoration | `POST A/pages/:id/restore/:version` | CSS-only history coverage, version detail/list contract and safe undo |
| SEO audit | `GET A/websites/:id/seo-audit` | Basic heuristic audit exists; advanced audit/metadata rendering needs work |
| Catalog/orders/blogs/redirects/domains | CRUD under `A/site-services`, `site-products`, `site-orders`, `blogs`, `redirects`, `domains` | Tenant scope, validated lifecycle actions, public presentation |
| AI blog draft | `POST A/blogs/draft` | Registered after `/blogs/:id` POST pattern; verify routing so `draft` is not handled as an ID |
| Domain verification | `POST A/domains/:id/verify` | Real TXT lookup exists; custom-host routing and certificate provisioning are separate work |
| Media/brand | `A/media/assets`, `media/upload`, `media/collections`, `media/brand-kits` | Owner facade and organization-scoped references/uploads |
| Public website | `GET /api/v1/public-sites/:slug/:page` | Snapshot delivery exists; homepage, navigation/asset links, SEO and host resolution need verification |
| Public bookings | `/api/v1/public-booking/*` | Existing hold/contact/verification/payment/finalize flow; wire UI to actual contract |
| Live progress, cancellation, conversation persistence | No equivalent website-specific contract verified | Add durable job/conversation records and reconnectable events/polling |
| Apply/review/discard AI edits | No staged proposal contract verified | Add isolated proposals with revision checks; generation must not overwrite live drafts unexpectedly |
| Board, comments, approvals, scheduling | Not established by inspected website contracts | New persisted features; later phase |
| Analytics, redirects serving, SSL automation | Data/CRUD alone is insufficient | Instrumentation and operational integrations required |

API conventions to keep: `{ success, message, data }`, and paginated responses with `meta: { total, page, limit, pages }`. Frontend adapters normalize Mongo `_id` values and backend error shapes. Keep typed contracts and query-key conventions in one module.

Backend fixes to address before exposing owner features:

- Scope every website lookup by resolved organization; child resources must resolve through an owned parent website, including assets, brand kits, versions, domains and jobs.
- Explicitly allowlist fields. Clients must not write `org_id`, audit identity, publish snapshots, published versions or other server-owned lifecycle fields.
- Existing generation upserts by slug and can overwrite a draft; preserve the prior revision and require an explicit proposal/apply step for changes.
- Current page history snapshots when HTML changes; CSS-only edits need version history too.
- Current site rollback upserts snapshot pages but does not remove pages absent from that snapshot. Define full restoration semantics and perform a consistent operation.
- Snapshot website theme/config/SEO/navigation along with pages; current publish snapshots contain page content only. Decide how related assets/config are frozen.
- Public rendering has restrictive CSP (`form-action 'none'`, no script allowance). It also does not currently emit stored SEO fields in the HTML head. Design booking/chatbot integrations and metadata delivery explicitly.
- Review HTML, CSS and URL sanitization together. Embedded editor inspection requires an approved bridge; do not enable generated scripts to make inspection work.
- Site deletion does not visibly cascade child records in the inspected CRUD. Define archive/delete behavior and asset retention.

## 6. Design system contract

Use the dashboard's current owner-shell palette, with semantic aliases inside the builder:

| Token | Dark | Light |
| --- | --- | --- |
| Canvas/background | `#080b0f` | `#f5f6f8` |
| Sidebar/header | `#050607` | `#ffffff` |
| Panel | `#090f15` | `#ffffff` |
| Raised surface | `#10161d` | `#eff1f5` |
| Border | `#202730` | `#dce0e7` |
| Main text | `#eff0f3` | `#171d28` |
| Muted text | `#8d929c` | `#697483` |

Retain restrained blue/violet Kora accents, subtle gradients, outlined controls, rounded panels and compact Lucide icons. Use Kora product assets from the repository; NOVYA labels and the barber sample in the PDF are reference content, not a branding/content requirement.

Two shell modes:

- Website Hub: expanded navigation and dashboard-style header, metric cards, lists and detail panels.
- Editor: narrow tool rail, project/status top bar, optional left tool drawer, central canvas, right Kora panel. Code stays inside the editor; Board is a separate review mode later.

Use approximately a 48–56 px editor rail and 320–360 px assistant as starting dimensions, then tune against the full-size PDF. These are proposed responsive dimensions, not measured PDF tokens. On small screens, tools and assistant become drawers/tabs. The editor itself must remain usable on a narrow viewport, independently of its simulated website viewport.

Carry over theme behavior (`kora-dashboard-theme`, `data-dashboard-theme`) through an adapter; avoid competing `.dark` and dashboard-theme providers. Use accessible control sizes and readable text even where thumbnail labels appear tiny. Provide keyboard navigation, visible focus, reduced motion, labeled icon buttons and focus-managed dialogs.

## 7. Phase-by-phase execution

Each phase should be a reviewable feature increment. All checkboxes start pending. Dependencies are release gates, not suggestions to build the whole system in one change.

### Phase 0 — Baseline, contracts and content-mode proof

Depends on: nothing.  
Outcome: verified architecture and an executable first feature slice.

- [ ] Record build/typecheck/lint status for both frontends and relevant backend tests, with required environment variable names only.
- [ ] Capture current builder routes and screenshots; establish a regression fixture for an existing generated app.
- [ ] Verify owner authentication/session flow, organization context and website entitlement behavior.
- [x] Define the owner facade contract and capability names; reuse existing tenant patterns.
- [ ] Prove create website → generate sanitized HTML/CSS → retrieve → render isolated preview → edit → reload round trip.
- [x] Confirm static website mode as the default new Kora mode; document the legacy Next.js path and migration boundary.
- [ ] Record missing contracts, model additions, deployment assumptions and component inventory.

Done when: the round trip works for an authorized owner, another organization cannot access it, and the implementation boundaries are recorded. Do not begin a broad runtime migration without this proof.

### Phase 1 — Owner access and website API foundation

Depends on: Phase 0.  
Outcome: frontend can safely load and mutate real Kora website data.

- [ ] Add `B` routes using shared website services/models while retaining admin routes.
- [ ] Enforce active membership, read/write capabilities, website entitlements, organization assignment and parent ownership.
- [ ] Add explicit validation, pagination/filtering and normalized error handling.
- [ ] Implement builder session adapter and website API/query hooks; invalidate queries by organization and website.
- [x] Add authorized website list/create/detail, page list/create/update and brand reference reads as the initial contract slice.
- [ ] Provide real loading, empty, denied, expired-session and retry states.

Done when: an owner can create/reopen a website without Clerk being treated as Kora authentication, and cross-tenant/list/child-ID attacks are rejected by backend tests.

### Phase 2 — Shared design language and editor shell

Depends on: Phases 0–1. PDF: 2–4, 9–11, 16–20.

- [ ] Add scoped Kora tokens and adapt existing UI primitives; support dark/light modes.
- [ ] Build Website Hub shell and editor shell with right-side assistant and optional left drawer.
- [ ] Add project title, draft/saved/saving/error status, page selector and account/back navigation.
- [ ] Adapt Kora orb, dialogs, tooltips, toasts, badges and assistant cards from dashboard patterns.
- [ ] Make panel resizing/collapse, local scroll regions and narrow-screen drawers work.
- [ ] Keep unavailable Board/publish tools disabled or hidden until backed by working features.

Done when: the shell matches the relevant PDF composition, works at desktop/tablet/mobile app widths, and loads real website/page context without changing existing legacy projects.

### Phase 3 — Prompt, generation and Kora conversation

Depends on: Phases 1–2. PDF: 3–4, 2, 22–25.

- [ ] Implement website-focused prompt entry, brand context selection and project continuation.
- [ ] Connect initial generation to the existing backend generation service.
- [ ] Persist website conversation, operation status and generated draft/proposal links.
- [ ] Show truthful pending/working/success/failure states. A synchronous request gets an indeterminate indicator, not invented percentages.
- [ ] Add durable background jobs/events when needed for reconnect, staged progress and cancellation. Reuse existing worker patterns where suitable.
- [ ] Support follow-up prompts, selected-page/element context and retry without creating duplicate pages/runs.
- [ ] Add base revision, idempotency and stale-response protection.

Done when: prompt → draft preview → follow-up conversation survives reload, failures are recoverable, and generation cannot accidentally overwrite a newer user edit. Display Stop only after actual cancellation exists; voice input is deferred unless implemented end to end.

### Phase 4 — Responsive preview and direct editing

Depends on: Phase 3. PDF: 5–11.

- [ ] Add desktop/tablet/mobile sizes, zoom/reset and fullscreen preview. Initial reference presets include 768 × 1024 tablet and 390 × 844 mobile.
- [ ] Render canonical page HTML/CSS with an isolated preview adapter and controlled assets/navigation.
- [ ] Adapt element selection to stable backend-preserved node/block IDs; verify any `data-*` IDs survive sanitization.
- [ ] Add selected element Content/Style/Layout controls and selected-context Kora prompts.
- [ ] Add page/layer structure, section insertion/reordering and focused navigation.
- [ ] Reuse code editor UI for HTML/CSS mode; preserve existing source-file editor for legacy app mode.
- [ ] Implement debounced save, saved/error status, revision conflicts and selection refresh after rerender.
- [ ] Implement AI proposed edits with Review/Apply/Discard; discarding leaves the accepted draft intact.

Done when: text, style and structural edits persist, code and canvas stay consistent, preview cannot access parent-app secrets, and device controls do not merely scale an unchanged desktop layout. Only report responsive/accessibility checks that actually ran.

### Phase 5 — Pages, navigation and reusable starting points

Depends on: Phase 4. PDF: 19–25, 11.

- [ ] Build page grid/list, search/filter, detail panel and open-in-editor actions.
- [ ] Add manual creation, Kora-assisted creation and a small versioned template catalog.
- [ ] Support rename, duplicate, slug validation, page kind, delete/archive and unsaved changes.
- [ ] Add navigation visibility/order, homepage selection and internal link validation.
- [ ] Define single draft/published/changed status vocabulary across list and editor.
- [ ] Normalize template/AI output to the same HTML/CSS/block contract.

Done when: a multi-page website can be created and reopened, navigation links resolve in preview, and page changes are scoped to the correct website. A useful release fixture is Home, Services, About, Contact and a legal page.

### Phase 6 — Versions, publish review and Website Hub

Depends on: Phase 5. PDF: 13–18, 14.

- [ ] Add page/site revision lists, named checkpoints, compare and restore with a backup of the current draft.
- [ ] Fix CSS-only history and full-snapshot restore semantics; cover pages removed or added after a version.
- [ ] Separate draft save, preview and public publish; public pages must stay on the selected immutable release.
- [ ] Build review dialog with actual checks, included pages, change summary and actionable blockers.
- [ ] Publish through Kora's backend and show the real public URL, timestamp and Website Hub handoff.
- [ ] Add publish history, rollback and unpublished-change indicators.
- [ ] Make public homepage, page links, asset paths and stored SEO metadata render correctly.
- [ ] Add unpublish lifecycle handling with explicit confirmation and preserved history.

Done when: generate → edit → publish → change draft → view unchanged live site → republish → rollback succeeds without E2B remaining alive. Core release is complete at this point. Do not present custom-domain SSL or scheduled publishing as ready yet.

### Phase 7 — Media, brand and theme controls

Depends on: Phase 6. PDF: 49–70, 213–214.

- [ ] Expose organization-scoped asset/brand APIs and integrate image/logo/font selection.
- [ ] Add upload validation/progress, asset metadata, alt text and replacement/version history.
- [ ] Add brand kit selection and theme editing for color, typography, buttons, spacing and approved logo assets.
- [ ] Apply brand settings consistently to generation context and page rendering; keep app UI theme separate from customer website theme.
- [ ] Track asset usage, avoid breaking published snapshots on replacement/deletion, and support basic collections/search.

Done when: owner can upload/select an asset, apply brand settings, regenerate/edit a page and publish without losing referenced media. Full storage administration and media generation studio stay outside this phase.

### Phase 8 — Services and booking integration

Depends on: Phases 6–7. PDF: 26, 28–29.

- [ ] Connect published business services, staff, locations and real availability to website components.
- [ ] Resolve the `NvSiteService` versus business `Service` distinction with explicit IDs/mapping; public booking uses business services.
- [ ] Add booking configuration, lead time, visibility and CTA routing.
- [ ] Build the public booking UI against existing holds/contact/verification/payment/finalize/status contracts.
- [ ] Support timezone display, unavailable slots, expiring holds, approval-required bookings, payment failures and confirmation.
- [ ] Host the interactive booking flow on an approved route/origin compatible with the public renderer CSP; do not assume inline scripts/forms are permitted.

Done when: a real published-service booking creates the expected appointment/request, duplicate finalize does not create duplicate bookings, and another tenant's services cannot be booked through this website.

### Phase 9 — Chatbot, content, blogs, products and orders

Depends on: Phases 6–8. PDF: 27, 30–41.

Deliver in separate increments:

- [ ] 9A Chatbot: configure enabled state, greeting, persona, knowledge and handoff; connect to an actual runtime with test conversation and privacy controls. Map existing Supporter capability where appropriate. A config field alone is not a working chatbot.
- [ ] 9B Content/blogs: persisted content fields, manual/AI/template article creation, preview, slug/SEO, draft/publish lifecycle and public article routes. Add scheduling only with a durable scheduler.
- [ ] 9C Products: website catalog linked to authoritative business products, current prices, media and publication status.
- [ ] 9D Orders: list/detail, validated fulfillment actions and links to verified payment records. Add checkout only when provider verification, totals, stock and idempotency are implemented.

Done when: each enabled feature works from configuration through its public/customer flow. Keep unfinished commerce/scheduling controls hidden. Website order CRUD must never allow a browser to assert that an order was paid.

### Phase 10 — SEO, redirects and analytics

Depends on: Phases 6 and 9B for blog coverage. PDF: 42–46.

- [ ] Extend existing SEO audit with actionable page issues and metadata editing; render title/description/OG/noindex in public HTML.
- [ ] Implement sitemap, canonical URLs, robots handling and slug-change redirect prompts.
- [ ] Add redirect CRUD plus real public-route resolution, loop/conflict validation and status-code behavior.
- [ ] Define analytics event schema, consent behavior, date ranges, tenant isolation and aggregation before showing charts.
- [ ] Measure visits/pageviews and relevant booking/contact conversions; add page-level reporting.
- [ ] Distinguish zero measurements from unavailable/not configured; never seed production charts with PDF sample metrics.

Done when: public output reflects metadata/redirect settings and analytics can be traced to real events. Scores/performance claims must match actual audits; basic SEO heuristics are not a full performance audit.

### Phase 11 — Custom domains and production hosting

Depends on: Phases 6 and 10. PDF: 47–48, 228.

- [ ] Build domain add/connect flow using the existing TXT verification service and actual deployment DNS targets.
- [ ] Add hostname-to-website resolution, primary domain, canonical redirects and domain ownership conflicts.
- [ ] Integrate hosting/certificate provisioning and expose separate DNS, routing and SSL states.
- [ ] Support propagation retries, provider errors, reconnect/disconnect and stable fallback public URLs.
- [ ] Verify CSP, cache invalidation, publish visibility and interactive feature origins on custom domains.

Done when: an owned domain resolves the intended published website over verified HTTPS. TXT verification by itself must not produce a false SSL-ready status.

### Phase 12 — Board review and advanced collaboration

Depends on: Phase 6; other features as needed. PDF: 12–14.

- [ ] Add Board mode with persisted page cards, positions, notes and zoom.
- [ ] Add comments/replies/resolution bound to page and revision, with actor permissions.
- [ ] Add share/reviewer access with revocation and expiry; distinguish view/comment/edit/publish permissions.
- [ ] Add persisted AI review findings, suggested fixes and conversion to edit proposals.
- [ ] Add publish approval workflow and scheduled publishing only with enforced backend transitions/jobs.
- [ ] Decide whether real-time multi-user editing is required; comments/review do not imply simultaneous source editing.

Done when: a reviewer can comment, the owner can resolve/apply a proposal, and unauthorized users cannot edit or publish. This phase does not block the core release.

### Phase 13 — Release checks, migration and rollout

Depends on: all phases selected for the release.

- [ ] Verify full owner journey and public visitor journey on dark/light and narrow/wide app layouts.
- [ ] Run targeted frontend type/build/lint checks, relevant backend tests and representative browser flows.
- [ ] Test expired sessions, missing entitlement, malformed IDs, wrong organization, retries, concurrent edits and provider failures.
- [ ] Verify draft/live isolation, restore behavior, sanitization, preview messaging and asset privacy.
- [ ] Capture representative screenshots against the corresponding full-size PDF references.
- [ ] Document setup, named environment variables, operational jobs and rollback steps without secrets.
- [ ] Feature-flag the new Kora mode; retain existing project mode and public links during rollout.
- [ ] Provide explicit opt-in migration/export for compatible legacy static content. Keep unsupported generated applications readable and usable through their existing path.

Done when: selected features meet their acceptance criteria, enabled controls all work, and rollout/rollback steps are documented and verified in the target environment.

## 8. Proposed implementation locations

These paths are recommendations, not claims that the modules already exist.

| Application | Proposed area | Responsibility |
| --- | --- | --- |
| Builder | `src/lib/kora/` | Session/backend adapter, contracts, normalized errors |
| Builder | `src/modules/website-builder/` | Website mode routing, state, shell and editor orchestration |
| Builder | `src/modules/website-hub/` | Overview, pages, history and website management |
| Builder | `src/modules/website-builder/ui/` | Tool rail, Kora panel, drawers, properties and review dialogs |
| Builder | Existing `modules/preview`, `components/code-editor.tsx` | Reuse/adapt preview and code tooling behind content-mode adapters |
| Backend | `route/businessWebsiteBuilder.route.js` | Tenant-scoped owner routes mounted in business router |
| Backend | `controller/businessWebsiteBuilder.controller.js` + shared website service | Validation/orchestration with reuse of existing models and logic |
| Backend | Website-related additions to workspace models or dedicated models | Revisions, proposals, conversations, jobs and review records |
| Backend | `tests/business-website-builder*.test.js` | Owner APIs, tenant boundaries and website lifecycles |

Do not upgrade the dashboard's Next.js 16 and builder's Next.js 15 simply to share styles. Port framework-neutral components/tokens first; evaluate dependency upgrades separately.

## 9. Verification and delivery rules

- Source inspection establishes reusable code, not production readiness. Record what was actually run in every phase report.
- Fix or replace the builder's stale `next lint` command before treating it as a release check; use the configured ESLint CLI as appropriate.
- Existing backend `npm test` uses Node's test runner. Start with affected tests, then run the relevant integration suite before release.
- Add behavior tests for tenant isolation, revision conflicts, snapshots, booking/payment replay and public rendering. Do not write snapshot tests that merely reproduce static CSS values.
- Use deterministic AI fixtures/stubs in automated tests; verify one real-provider journey in a configured environment without making every test depend on provider availability.
- Preserve `Project.files` as canonical for legacy app mode. Never reconstruct an application from per-turn fragment deltas.
- Follow `AI-Website-Builder/CLAUDE.md` migration constraints: no Prisma reset or `migrate dev` against the shared database; use reviewed migration SQL/diff and deploy workflow when needed.
- Follow dashboard `AGENTS.md` and installed Next.js documentation before changing dashboard code.
- No secrets, tokens, customer content or production database dumps in this plan or implementation reports.

## 10. Phase tracker and next action

| Phase | Status | Primary dependency | Evidence to record |
| --- | --- | --- | --- |
| 0 Baseline/proof | In progress | None | Baseline, round trip, content-mode decision |
| 1 Owner API | In progress | 0 | Contracts and tenant tests |
| 2 Design/shell | In progress | 1 | Screenshots and responsive checks |
| 3 Kora generation | Pending | 2 | Persisted prompt/retry flow |
| 4 Preview/editing | Pending | 3 | Direct/AI edits and conflict checks |
| 5 Pages/navigation | Pending | 4 | Multi-page fixture |
| 6 Publish/versions/hub | Pending | 5 | Public snapshot and rollback proof |
| 7 Media/brand | Pending | 6 | Asset/brand persistence |
| 8 Booking/services | Pending | 7 | Booking integration tests |
| 9 Business content | Pending | 8 | Enabled feature flows |
| 10 SEO/analytics | Pending | 6, 9B | Public metadata and real event data |
| 11 Domains | Pending | 10 | DNS/routing/HTTPS checks |
| 12 Board/review | Pending | 6 | Permissions and review persistence |
| 13 Release | Pending | Selected scope | Release and rollback report |

For each phase, update this tracker and append a short completion note containing changed files, verified behavior, checks run, unresolved gaps and the next ready phase. Keep checked items tied to working behavior, not just created components.

**Next implementation instruction:** Continue the open Phase 0/1 gates: validate the configured owner account/provider, add atomic quota reservations and generation usage accounting, establish legacy-runtime regression evidence, and complete organization/session selection. Then refine the shell to full-size PDF screens and proceed to durable generation/proposals and direct editing. See the implementation note below and [KORA_WEBSITE_BUILDER.md](../../KORA_WEBSITE_BUILDER.md). Remaining workspace modules stay in the companion plan.

## 11. Implementation progress: 2026-11-05

First working integration slice delivered at `/website-builder`:

- Tenant-scoped backend context, website list/create/detail, page list/create/generate/save and brand-kit references, using existing MongoDB models and Kora generation service. Platform-admin boundaries remain in place.
- Kora password/MFA sign-in through a server-side adapter with an HttpOnly session cookie, origin-checked writes and an allowlisted API surface.
- Initial dark owner-style shell with central canvas, right Kora panel, website selection, manual/new generated pages, HTML/CSS editing, explicit save/reload and device preview widths.
- Shared HTML sanitizer, isolated script-free preview, optimistic page revisions and history for HTML/CSS saves. New generation cannot overwrite an existing page slug.
- Legacy source files/runtime remain separate. Home routes fall back to Kora mode when Clerk is unconfigured; configured legacy mode remains available.

Validation evidence:

- Existing builder TypeScript baseline and ESLint passed before frontend changes.
- Final production build passed, including type/lint checks. Existing legacy dependencies emit bundling warnings for dynamic requires; they did not fail the build.
- 18 backend checks passed across website builder, backend integration, business setup and opening-hours suites.
- 2 browser integration checks passed using real password login and MongoDB persistence with deterministic AI output: create/generate/edit/save/reload/reopen, sandbox and HttpOnly-cookie checks, logout, narrow-screen overflow, cross-origin write denial and proxy allowlist.
- Reviewed desktop and mobile screenshots in `AI-Website-Builder/test-results/` (ignored artifacts).
- Dashboard application was inspected but not modified; its dependency installation/build baseline and original legacy-runtime screenshots remain open. No live provider or configured customer account was used.

Baseline repair: restored normal PostCSS config after finding duplicate declarations and an appended obfuscated script. Removed a similar appended block from `api.js` and removed its unnecessary execution from dev/start scripts. Neither payload was executed during this work. This does not establish whether either ran before this session.

Open gates: production session/SSO and delegated organization selection; real-provider/account validation; atomic concurrent quota reservations and generation accounting; full design/theme parity; persistent conversations/proposals/jobs; direct element editing; publishing and the remaining phases. Tests validate the initial static-page slice, not the complete roadmap. Phase 0, Phase 1 and Phase 2 remain in progress.

### Sidebar interaction refinement — 2026-11-05

Reordered core navigation, added a distinct active indicator (including settings/publish dialogs), kept collapse state stable across sections, and preserved the selected website when browsing All websites. Navigation remains readable during requests with an explicit progress message and a guard against switching mid-operation. Tools needing a website provide selection guidance. Unimplemented modules are listed under an expandable Planned group rather than disabled buttons. Added desktop/mobile browser coverage for selection, website context, settings focus, and navigation during generation.

### Editor interaction polish — 2026-11-05

Implemented double-click properties and a keyboard-accessible right-click menu for duplication, sibling movement, parent selection and confirmed deletion. Added draggable section ordering with move-button alternatives; all operations use the existing local history and explicit save. Saving now preserves local undo/redo rather than clearing it. Ctrl/Cmd+S and Ctrl/Cmd+Z (Shift for redo) work in the app and sandboxed canvas; input fields keep their native text undo.

Typography reads the actual selected element styles and changes only fields edited by the owner: precise font size, presets, font family/weight, line height, letter spacing, alignment and color. Appearance controls cover background, corner radius and horizontal/vertical padding; links and image descriptions can be edited. Parent containers with nested content cannot be flattened by the text editor. Link protocols and numeric bounds are validated. Generated scripts remain blocked; the editor-owned nonce bridge retains source/token checks and the opaque-origin iframe sandbox.

Refined button sizes/selected states, icon tooltips, toolbar overflow, mobile header layout, property-panel scrolling and section drag feedback. Scope is section ordering within the same parent; arbitrary free-position layout editing remains outside this increment.

Verification: production build (including TypeScript/lint) passed with existing legacy dependency bundling warnings. All six browser integration flows passed, including typography preservation, spacing/link validation, right-click duplication/parent selection, drag and arrow ordering, undo after save, shortcuts inside the iframe, persisted content and narrow-screen overflow. Reviewed desktop and mobile property-panel screenshots. No live customer pages or provider calls were used for these checks.
