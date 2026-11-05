# KoraAI Workspace Features: phased implementation plan

Created: 2026-11-05  
Status: feature roadmap; implementation has not started  
Applications: existing owner dashboard and expanded workspace frontend  
Design source: `business_owner-dashboard-koraAI`  
Backend: `backendKoraAi`  
Visual reference: `business_owner_pages_65_to_365.pdf`

This file owns the non-website workspace modules: overview, full media/brand library, marketing, automations, office, management, inventory, finance, workspace/global settings, help/support and onboarding. The website editor and Website Hub have their own [AI_WEBSITE_BUILDER_IMPLEMENTATION_PLAN.md](AI_WEBSITE_BUILDER_IMPLEMENTATION_PLAN.md).

Phase IDs are continuous across the two files: website Phases 0-13 are defined in the linked website plan; workspace Phases 14-27 are defined here. References to earlier phases mean shared prerequisites, not duplicated implementation tasks. The ledger retains website pages as cross-references so full-PDF coverage stays auditable in one place.

The PDF contains 301 image-based pages. Review completed: full-size pages 1-20 and 301, plus contact-sheet survey of 1-300. Detailed field/action contracts must still be reviewed at full resolution before each phase. PDF page positions are 1-based; original-page numbers inferred from the filename equal position + 64.

## 1. Full-PDF architecture and shared requirements

The combined scope of both plans is a full business workspace. Keep editor tooling focused while introducing sibling feature modules. Use `AI-Website-Builder` for the editor and workspace surfaces that do not already exist. Reuse owner-dashboard screens/services for existing account, team, scheduling, assistant, help and onboarding functionality, extending them to match the PDF where needed. In Phase 0 record a route ownership matrix and deployment/session strategy. Phase 14 implements the workspace entry. Do not build competing customer, service, inventory, payment or preference stores in both applications.

Before each module begins, review its full-size PDF pages and produce a screen contract containing every visible tab, field, table column, card, menu, modal, drawer, toggle, validation, navigation target and primary/secondary action. Track repeated Ask Kora, Create, manual/AI/template choices, details panels and notification variants as functional states, not decorative screenshots.

Shared work applying to **all** phases:

- [ ] Authenticated cross-app navigation, organization selection, capability-based navigation and entitlement checks.
- [ ] Global search, notifications/read state, account menu, breadcrumbs/back behavior and workspace settings entry.
- [ ] Shared Kora entry points: contextual Ask Kora menu, prompt modal, persistent conversation drawer, resource context and proposed actions requiring the correct capability.
- [ ] Creation pattern with manual/AI/template options wherever shown; save drafts, validate, cancel safely and reopen results.
- [ ] Consistent list/grid/calendar/board views where shown; search, filters, sorting, pagination, row selection and detail panels.
- [ ] Loading, empty, partial-data, error/retry, stale-data, permission-denied, conflict and provider-unavailable states.
- [ ] Accessible keyboard/touch interactions, focus return, reduced motion, readable contrast, localization, currency/date/number/timezone formatting.
- [ ] Server-side field validation, safe files/URLs, reference ownership, audit records and revision/idempotency controls for consequential operations.
- [ ] Real measured data and provider-confirmed states. Persistence of settings must be distinguished from enforcement of settings.
- [ ] Background jobs with durable status, progress, failure/retry, cancellation where supported and reconnect after reload.
- [ ] Shared asset references, revision history and retention so deleting or replacing an item does not corrupt dependent published content.

The existing `/novya/*` admin endpoints are **reuse candidates only**. Do not point owner screens at them directly or relax their authorization. Inventory existing `/business/*` services first, then implement tenant-scoped missing contracts. An endpoint/model name does not establish feature completeness.

## 2. Full-PDF coverage ledger

Every page belongs to a primary feature phase below. Shared capabilities may also be delivered in earlier phases. Screen names for surveyed pages are feature labels; confirm exact tab/field copy against full-size pages in the owning phase.

| PDF pages | Required screen/feature coverage | Primary phase |
| --- | --- | --- |
| 1 | Workspace overview, creation/activity/schedule/finance summaries | 14 |
| 2–4 | Editor, initial prompt, generation state | 2–3 |
| 5–8 | Preview, tablet/mobile and fullscreen | 4 |
| 9–11 | Code, properties, layers/structure | 4–5 |
| 12 | Board, comments, AI review | 12 |
| 13–15 | Publish review, versions, success/handoff | 6 |
| 16–18 | Website overview, publish management and history | 6 |
| 19–25 | Pages, page detail, navigation, Kora menu/modal/chat, creation choices | 5 |
| 26 | Website services | 8 |
| 27 | Website products | 9C |
| 28–29 | Bookings and configuration | 8 |
| 30–31 | Chatbot overview/configuration/test | 9A |
| 32–33 | Orders and order detail | 9D |
| 34–35 | Content and content detail/edit | 9B |
| 36–41 | Blogs, detail, Kora variants and create dialog | 9B |
| 42–44 | SEO, page audit, redirects | 10 |
| 45–46 | Analytics overview/page detail | 10 |
| 47–48 | Domains and domain connection | 11 |
| 49–53 | Media overview/library, asset details/usage/version history | 15 |
| 54–59 | Media menus, replacement, Kora and add/upload/import flows | 15 |
| 60–63 | Collections, collection detail/create, sharing/permissions | 15 |
| 64–70 | Brand assets, identity, logos, colors, typography, voice, add asset | 15 |
| 71–74 | Generated media, storage overview/management/selection | 15 |
| 75–76 | Marketing overview and campaigns | 16A |
| 77–86 | Campaign detail, brief, content, audience, channels, budget, schedule, links, performance, create | 16A |
| 87–90 | Trend Spy views and followed insights | 16B |
| 91–94 | Social grid/calendar/accounts and create flow | 16C |
| 95–102 | Email campaigns, content/audience/delivery/schedule/performance and create | 16D |
| 103–108 | Audiences, segment details/criteria/usage/history and create | 16E |
| 109–113 | Marketing analytics and channel/audience/report views | 16F |
| 114–117 | Automations overview/create/builder and run history | 17 |
| 118–121 | Office overview, documents, variants and create | 18A |
| 122–123 | Document editor and version history | 18A |
| 124–125 | Sheets list/editor | 18B |
| 126–127 | Presentations list/editor | 18C |
| 128 | Office imports/exports | 18D |
| 129–133 | Management overview, contextual Kora and creation patterns | 19A |
| 134–141 | Customers, record tabs, add/edit, appointments, documents, payments, notes | 19B |
| 142–147 | Leads list/board/detail, add/edit and convert to customer | 19C |
| 148–154 | Services list/detail/create, pricing/booking/availability/marketing | 19D |
| 155–163 | Products list/detail/create, variants/inventory/pricing/media/shipping/relations | 20A |
| 164–170 | Inventory, item detail, adjustments and movement views | 20B |
| 171–173 | Locations/storage, add location and stock transfer | 20B |
| 174–176 | Discounts overview/edit/create | 20C |
| 177–180 | Customer groups overview/detail/create/edit | 20D |
| 181 | Management imports/exports | 20E |
| 182 | Finance overview | 21A |
| 183–189 | Invoices/detail/create/preview/send, credit notes and credit-note preview | 21B |
| 190–193 | Transactions/detail/matching/unmatched | 21C |
| 194–197 | Expenses/detail/create/reimbursement payout | 21D |
| 198–201 | Banking/account detail/connect/sync | 21E |
| 202–207 | Reports, profit/loss, cash flow, revenue, expense and tax summaries | 21F |
| 208–210 | Workspace settings overview, business/locations and profile | 22A |
| 211–212 | Opening hours, location detail and exceptions | 22A |
| 213–214 | Brand settings, identity and voice | 22A |
| 215–217 | Team/permissions, role detail, employee access/apps | 22B |
| 218–219 | AI assistant configuration, knowledge/data | 22C |
| 220–225 | Integrations overview/catalog/provider/connect/API-webhooks/sync activity | 22D |
| 226–233 | Creative, automation, website, media, marketing, office, management and finance settings | 22E |
| 234 | Workspace notifications | 22F |
| 235–243 | Data management, import wizard/results, exports and sync jobs/errors/detail | 23A |
| 244–247 | Data/privacy, retention/residency, consent and privacy requests | 23B |
| 248–250 | Usage/limits, usage detail and limit behavior | 23C |
| 251–254 | Workspace security, authentication/sessions, boundaries and audit | 23D |
| 255–257 | Custom fields overview/create/edit | 23E |
| 258–260 | Global settings, profile and account security | 24A |
| 261–263 | Active sessions, two-factor setup, connected accounts | 24A |
| 264–268 | Subscription, billing history, plans, plan confirmation and payment method | 24B |
| 269–270 | Personal notifications and schedule | 24C |
| 271–273 | Appearance, accessibility, language/region | 24C |
| 274–276 | Personal AI, memory/privacy and data/export | 24D |
| 277 | Global settings account-menu variant | 24A |
| 278–280 | Help center, search and article | 25A |
| 281–283 | Support list, new request and request detail/reply | 25B |
| 284–287 | Onboarding welcome, learning method, source import and reviewed business facts | 26 |
| 288–290 | Priorities, business foundation and operating model | 26 |
| 291–295 | Availability, model confirmation, team, AI authority and calendars | 26 |
| 296–300 | Knowledge, customer channels, testing, launch checks and ready state | 26 |
| 301 | Final dashboard handoff and owner overview | 26/14 |

Coverage rule: all integer page positions 1–301 must appear in this ledger, without gaps. A page is implemented only after its detailed screen contract and behavior checks pass. A range entry does not waive any intermediate screen.

## 3. Workspace implementation phases

### Phase 14 — Full workspace entry and overview

Depends on: 1–2; validate website summaries after 6. PDF: 1 and 301.

- [ ] Establish workspace route ownership, authenticated dashboard/workspace handoff and back navigation; add the Workspace entry shown in the final dashboard reference.
- [ ] Build workspace navigation for Overview, Creative/editor, Automations, Website, Media, Marketing, Office, Management, Finance and Workspace Settings.
- [ ] Implement global search, notification/account menus and creation entry; connect only routes that actually work.
- [ ] Build active creations, scheduled content, live website status, recent creations/activity, upcoming activities and finance summaries from authorized data.
- [ ] Reuse/extend owner overview for the final onboarding handoff: real schedule, staff, occupancy and actionable insights.

Done when: the same authenticated organization moves between dashboard, workspace and editor, overview cards link to correct records, and figures agree with source modules. Aggregates for modules not yet delivered remain explicitly unavailable until their phases finish.

### Phase 15 — Complete media and brand workspace

Depends on: 7 and 14. PDF: 49–74.

- [ ] Implement complete media overview/library with grid/list, type/tag/folder filters, selection, details, usage and version history.
- [ ] Support add/upload/import, replacement, contextual Kora actions and generated-media workflows with durable generation jobs and provider failure recovery.
- [ ] Implement collection creation/detail, asset membership, sharing permissions and revocation; shared links require intentional scope/expiry.
- [ ] Complete brand kit overview/detail tabs for identity, logo variants, named color roles, typography scales and voice rules, including add/edit actions.
- [ ] Add storage quotas, real size accounting, largest/unused asset views, bulk actions and deletion impact review.
- [ ] Add owner-safe adapters for existing media controllers; fill missing sharing, version retrieval/restore, rights/metadata and generation contracts.

Done when: upload → collection/share → brand use → replace/version recovery works, unauthorized assets stay inaccessible, and storage usage changes accurately after allowed deletions. Phase 7 in the website plan covers only the website media subset; this phase completes the media workspace.

### Phase 16 — Complete marketing workspace

Depends on: 14–15; campaign relations can consume management records after 19–20. PDF: 75–113.

- [ ] 16A Campaigns: overview/list/create plus detail tabs for brief, content variants, target audience, channels, budget, schedule, linked items and measured performance. Persist drafts and approvals; separate planned budget from verified spend.
- [ ] 16B Trend Spy: following/watchlist, source categories, insight details, freshness and proposed campaign actions. Define real source ingestion/licensing and failure/stale states; CRUD records alone do not establish trend discovery.
- [ ] 16C Social: grid/calendar views, account connections, manual/AI/template creation, media reuse, preview, schedule, provider publish and delivery/retry status.
- [ ] 16D Email: campaign creation, subject/content previews, audiences, sender authentication, test send, unsubscribe/suppression, schedule, delivery/bounce/click metrics and deduplication.
- [ ] 16E Audiences: segment rules, previewed counts, membership, campaign usage, history and add/edit; enforce marketing consent in targeting and sending.
- [ ] 16F Analytics: date/channel/campaign/audience reports using actual provider/event data with correct denominators, attribution and empty states.
- [ ] Implement contextual Kora menu/modal/chat and creation choices throughout the screen variants.
- [ ] Reuse workspace campaign/audience/social/email/trend models and controller logic through tenant-scoped services; add durable provider jobs, scoped credentials and event verification where absent.

Done when: a consented audience can receive an explicitly submitted test campaign through a configured provider, status reflects provider evidence, and analytics are reproducible. Missing provider credentials may block operational validation but do not remove features from the roadmap. No external sends occur as part of writing this plan.

### Phase 17 — Automation builder and runs

Depends on: 14 and the modules used by selected triggers/actions. PDF: 114–117.

- [ ] Implement automation overview, manual/AI/template creation, workflow builder, trigger/action/condition configuration and step inspector.
- [ ] Persist versioned definitions; validate graph structure, cycles, input references, capabilities and permitted action types.
- [ ] Support validation-only tests, explicit activation, pause, safe execution, run history and per-step results/errors.
- [ ] Reuse `/business/automations` and `novyaAutomationRuntime.js`; reconcile the workspace admin runner with the owner runtime rather than creating a second execution engine.
- [ ] Add missing definition edit/detail and run-detail contracts, durable scheduling, event deduplication, retry/cancellation semantics and execution-time tenant/entitlement checks.

Done when: an approved version executes a real supported trigger, creates exactly one expected effect on replay, and run details distinguish completed, failed and unsupported steps. This is the complete workspace automation scope.

### Phase 18 — Office documents, sheets, presentations and transfers

Depends on: 14–15. PDF: 118–128.

- [ ] 18A Documents: overview/library/search, manual/AI creation, rich-text editor, formatting, save/rename, sharing, version list/compare/restore and preview/export.
- [ ] 18B Sheets: workbook list/create/open, grid editing, data types, basic formulas/recalculation, formatting, tabs and import/export with documented format limitations.
- [ ] 18C Presentations: deck list/create/open, slide navigation, text/media editing, ordering, speaker notes/presentation view and export.
- [ ] 18D Imports/exports: supported format selection, upload validation, asynchronous job status, results/downloads and retry.
- [ ] Extend existing `office/docs` services/models; independently specify sheet/deck structures and conversion services. Generic document CRUD does not prove spreadsheet or presentation editing exists.
- [ ] Prevent hostile document content and spreadsheet formula injection in exported data; enforce version and sharing permissions.

Done when: each artifact type can be created, edited, reopened, shared under the correct permission and exported with verified content/layout.

### Phase 19 — Management, customers, leads and services

Depends on: 14; share records with 8–9. PDF: 129–154.

- [ ] 19A Overview: management metrics, recent activity, search/filter, contextual Kora actions and create choices.
- [ ] 19B Customers: list/create/edit/detail and all shown tabs; appointments/rescheduling, documents/downloads, payments and private notes with independent access rules.
- [ ] 19C Leads: list/board/detail, add/edit, stages and history; idempotent conversion to customer preserving relationships and preventing duplicates.
- [ ] 19D Services: list/create/detail and pricing, booking, availability, marketing/visibility tabs; staff/location assignment and published state.
- [ ] Reuse owner-scoped customer/lead/service and business APIs first. Platform management organization and customer endpoints must not become owner endpoints without explicit scoping.
- [ ] Connect customer groups/custom fields and website bookings to the same records; prevent deletion from orphaning historical appointments/invoices.

Done when: lead → customer → service booking shares one canonical record chain, private notes/documents honor permissions, and another organization's records never appear in lists, detail tabs or search.

### Phase 20 — Products, inventory, discounts, groups and management transfers

Depends on: 19; Phase 23A supplies shared transfer jobs. PDF: 155–181.

- [ ] 20A Products: list/create/detail and shown variants, media, pricing, stock, marketing, shipping/fulfillment and linked-record tabs.
- [ ] 20B Inventory: stock by item/location/variant, movement history, audited adjustment, locations/storage creation and atomic transfers with stock conservation.
- [ ] 20C Discounts: list/create/edit, eligibility, percentage/fixed amount, validity windows, usage limits and server-side redemption checks.
- [ ] 20D Customer groups: list/detail/create/edit, membership rules and permitted marketing/discount use.
- [ ] 20E Management imports/exports: mapping, validation, preview, job results and downloadable errors.
- [ ] Reuse `novyaBusiness.route.js` products/groups/stock/movements and existing catalog records. Add missing variant, discount and lifecycle contracts after inventorying model support.

Done when: product and stock information is consistent between management and website, replay cannot duplicate stock movements, transfers do not lose stock, discounts validate on the server and import errors leave clear recoverable results.

### Phase 21 — Complete business finance workspace

Depends on: 19–20 for catalog/customer relations; 22D for providers. PDF: 182–207.

- [ ] 21A Overview: receivables, income, expenses, balances, trends and links using the tenant's operational finance records.
- [ ] 21B Invoices/credit notes: list/detail/create/edit drafts, calculated totals/tax/currency, issue/preview/send/download, payment references and linked credit-note lifecycle.
- [ ] 21C Transactions: list/detail, suggested invoice matching, confirm/unmatch, unmatched queue, duplicate handling and reconciliation audit.
- [ ] 21D Expenses/reimbursements: receipts, categories, draft/review/approve, employee claims and provider-confirmed payout states.
- [ ] 21E Banking: account list/detail, provider connect/reconnect, sync status, connection expiry, balances and sync error recovery.
- [ ] 21F Reports: overview, profit/loss, cash flow, revenue, expense and tax summary; date/currency basis, exports and reconciliation to source records.
- [ ] Reuse `/business/finance` for tenant operational invoices/payments; treat `/novya/finance` as platform finance, not an interchangeable owner ledger. Add missing owner expense/bank/report/credit-note services with explicit data ownership.
- [ ] Enforce exact monetary calculations, supported currency precision, immutable issued-document snapshots, fresh authentication where needed, idempotency and verified provider outcomes.

Done when: invoice → verified payment → reconciliation → credit/refund/report flow agrees across views, expense approval cannot be bypassed, and unconfigured banking never appears connected. Delivery does not claim jurisdictional tax certification.

### Phase 22 — Complete workspace settings and integrations

Depends on: 14; implement settings foundations early enough for dependent modules. PDF: 208–234.

- [ ] 22A Business/location/brand: profile, location list/detail, opening hours/exceptions, brand identity and voice; reuse existing business settings and opening-hours services.
- [ ] 22B Team/access: members, invite/revoke, roles, permission matrix, role detail and employee apps; permissions must change server behavior, not just toggle visuals.
- [ ] 22C Assistant/knowledge: model/routing preferences where allowed, approved instructions, scoped sources and assistant execution boundaries.
- [ ] 22D Integrations: overview/catalog/detail, OAuth/connect/disconnect, WhatsApp configuration, API credentials, webhooks, delivery tests and sync/activity. Add actual provider handshakes, scoped secret storage and verified callbacks.
- [ ] 22E Module settings: creative defaults, automation policies, website publishing, media rules, marketing approval/delivery, office defaults, management rules and finance settings. Each shown control needs a validated saved value and runtime consumer.
- [ ] 22F Workspace notifications: event categories, recipients/channels, preferences and delivery status.
- [ ] Reuse `/business/settings`, `/business/team`, `/business/supporter`, `/business/assistant` and existing provider services; admin settings are references for missing services, not shared global storage for owners.

Done when: each setting persists across sessions, is visible to the correct scope, affects its consumer, and cannot alter another organization's integration or access. Module-specific controls must not remain inert preferences.

### Phase 23 — Data operations, privacy, usage, security and custom fields

Depends on: 22 and participating domain modules. PDF: 235–257.

- [ ] 23A Data operations: import sources/formats, mappings, preview validation, error results, confirmation, durable execution, exports, sync job lists/detail/retry and import history. Generalize existing customer import safely to each supported entity.
- [ ] 23B Privacy: data inventory, retention/residency policies, consent purposes/evidence, access/export/deletion requests and status history. Implement workers/enforcement for promised retention and deletion; show actual residency capabilities.
- [ ] 23C Usage: measured usage details, limit policies, alerts, overage/package/pause behavior and billing relationship using existing usage/entitlement services.
- [ ] 23D Security: workspace security overview, authentication/session controls, access boundaries, audit list/detail/filter/export and redaction. Reuse existing MFA/fresh-auth/session mechanisms and preserve audit integrity.
- [ ] 23E Custom fields: overview, create/edit, types/options/defaults, required/visibility rules and values on supported entity forms; schema changes must handle existing records.
- [ ] Add job, policy and entitlement contracts wherever current owner settings only store JSON values. Demonstrate enforcement before marking a control complete.

Done when: imports are resumable/replay-safe, exports contain only permitted data, privacy workflows have auditable outcomes, limits affect real operations and custom fields validate on the server.

### Phase 24 — Complete personal/global settings and billing

Depends on: 22–23; preference foundations may ship earlier. PDF: 258–277.

- [ ] 24A Account: overview/profile, security, active sessions/revoke, actual two-factor enrollment/verification/recovery, connected account linking/disconnection and account menu.
- [ ] 24B Billing: current plan, billing history/invoice download, plans comparison, plan-change preview/confirmation and payment method flow through actual provider contracts.
- [ ] 24C Preferences: personal notification channels/quiet schedule, appearance/density, accessibility, language/region/date/number/timezone; consume preferences across both frontends.
- [ ] 24D Personal AI: approved preferences/instructions, memory listing/edit/delete/disable, privacy controls and personal data export.
- [ ] Reuse owner settings/preferences, user/auth/MFA routes and `/business/billing`. Separate personal identity/preferences from organization billing and workspace policy; personal settings cannot weaken organization restrictions.

Done when: identity changes persist, revoked sessions fail, MFA is enforced server-side, billing reflects verified provider state, and preferences and AI memory controls affect the actual experience.

### Phase 25 — Help center and support

Depends on: 14 and existing owner help/support functionality. PDF: 278–283.

- [ ] 25A Help: category landing, search/results, article view, related content, feedback and appropriate Kora assistance.
- [ ] 25B Support: tenant-owned ticket list/filter, new request, validated attachment upload/download, ticket details/replies/status and notification links.
- [ ] Reuse `/business/help` published articles, feedback and ticket APIs; preserve exclusion of internal support replies and private attachments.
- [ ] Extend existing dashboard components or route to them with the same session; fill PDF interaction gaps rather than duplicating ticket stores.

Done when: search opens a real article, a request/reply persists, closed-ticket behavior is correct and another owner cannot read the ticket or its files.

### Phase 26 — Complete onboarding and final dashboard handoff

Depends on: 14, 19, 22–25; generation/provider paths depend on their owning phases. PDF: 284–301.

- [ ] Implement welcome, learning-method choice, manual/imported business information, AI extraction and review before applying facts.
- [ ] Implement priorities, foundation, operating modes, availability, operating-model confirmation, team, AI action authority and calendar connections.
- [ ] Implement knowledge ingestion, phone/WhatsApp/customer-channel choices, real test results, launch checklist, ready state and dashboard handoff.
- [ ] Persist each step with revision checks, back/continue/skip rules, resume and editable confirmed facts; do not create duplicate organizations or accounts on retry.
- [ ] Reuse `/business/setup` and existing dashboard onboarding; identify missing source ingestion, external calendar OAuth, channel activation and provider test contracts explicitly.
- [ ] Distinguish validated local configuration from provider-tested/live readiness. Missing optional integrations must not block unrelated setup; required launch gates must be real.
- [ ] Verify the final page 301 dashboard uses the same organization and shows the configured business state. Existing owners can resume/review without redoing setup unnecessarily.

Done when: a new owner completes or resumes the complete sequence and reaches a working overview; returning owners keep their data and no required provider test is falsely reported as passed.

### Phase 27 — Full-PDF acceptance and production rollout

Depends on: all Phases 0–26, including operational integrations required by enabled features.

- [ ] Complete all detailed screen contracts for pages 1–301 and link each to implemented route/state, backend contract and verification evidence.
- [ ] Revisit every PDF page at full resolution, including menus, modal variants, tab views and final dashboard handoff; record intentional deviations and rationale.
- [ ] Run cross-module scenarios: onboarding → workspace; brand/media → website → publish; lead → customer → booking → invoice; product → stock → order; audience → approved campaign → delivery; automation → effect → run history; support → reply; settings → enforced behavior.
- [ ] Verify all permission/tenant boundaries, entitlement enforcement, preview/public separation, destructive-action confirmations, financial replay protection, private files and provider callbacks.
- [ ] Complete responsive/accessibility/theme/localization checks, performance checks for large lists/editor content, background-job recovery and observable error reporting.
- [ ] Verify backups, migrations, data integrity, export/restore, provider configuration, job schedules, deployment routing and rollback in the intended release environment.
- [ ] Remove placeholder metrics and inert controls; no required feature remains hidden solely to claim full completion.
- [ ] Publish a coverage report with passed/blocked/failing screens and feature flows. External configuration blockers remain open deliverables until resolved; they are not silently waived.

Done when: every PDF page is accounted for and its required feature behavior is verified, all release gates pass and no required phase task remains open. Website-only completion or a thumbnail-based visual match is insufficient for this milestone.

## 4. Backend reuse inventory

| Feature | Inspected reuse candidate | Remaining implementation responsibility |
| --- | --- | --- |
| Workspace summaries | Existing owner overview and workspace models | Tenant-safe cross-module aggregate/links; measured availability/activity |
| Media/marketing/office | `novyaWorkspace.route.js` and `novyaWorkspace.controller.js` | Owner facades, reference scoping, provider workers, missing detailed workflows |
| Automation | `novyaBusinessAutomation.route.js`, `novyaAutomationRuntime.js` | Builder edit/detail/run contracts, supported triggers/actions and scheduling |
| Customers/leads/services | Existing customer/lead/service routes, business catalog APIs | Verify each role boundary and record linkage; complete shown tabs |
| Products/inventory/groups | `novyaBusiness.route.js` and business models | Variant/discount lifecycle and imports; canonical catalog mapping |
| Finance | `novyaBusinessFinance.route.js`; platform finance as separate reference | Owner expenses/banking/reports/credit notes and verified integrations |
| Workspace preferences/data | `businessOwnerSettings.route.js` and controller/utils | Per-entity transfers, policy enforcement, job histories and runtime consumers |
| Team/assistant/knowledge | Business team, assistant, supporter and setup modules | Cross-workspace capabilities, source ownership and missing PDF controls |
| Usage/billing | `novyaBusinessBilling.route.js`, usage/entitlement utilities | Scope-appropriate histories/provider actions and frontend contract coverage |
| Security | Auth, MFA, fresh auth, tenant and access helpers | Session/enrollment UX and enforce every displayed policy |
| Help/support | `businessHelp.route.js` and owner help components | Full screen parity and linked navigation |
| Onboarding | `businessSetup.route.js` and dashboard onboarding | Missing provider ingestion/connect/test contracts; full sequence parity |

Any implementation phase must inspect its relevant models/controllers/tests in depth before calling a contract reusable. The expanded inventory is a routing and ownership map, not a claim that these modules are fully backend-complete.

## 5. Workspace tracker and delivery order

All workspace phases are pending. Maintain this tracker here and the Phase 0-13 tracker in the linked website plan. Together they form the full delivery tracker.

| Phase | Status | Dependency | Required completion evidence |
| --- | --- | --- | --- |
| 14 Workspace overview | Pending | 1–2, then 6 | Cross-app handoff and real aggregate links |
| 15 Full media | Pending | 7, 14 | Asset/sharing/version/storage flows |
| 16 Marketing A–F | Pending | 14–15, relevant 19–20 data | Draft/approval/provider delivery/metrics |
| 17 Automations | Pending | 14, selected action modules | Versioned workflow and replay-safe run |
| 18 Office A–D | Pending | 14–15 | Create/edit/reopen/share/export each artifact |
| 19 Management A–D | Pending | 14 | Lead/customer/service shared record flow |
| 20 Catalog A–E | Pending | 19, shared transfer foundation | Stock/discount/import invariants |
| 21 Finance A–F | Pending | 19–20, provider foundation | Verified ledger/document/report flow |
| 22 Workspace settings A–F | Pending | 14; deliver foundations early | Persisted and enforced controls |
| 23 Data/security A–E | Pending | 22, domain contracts | Jobs/policies/limits/security evidence |
| 24 Global settings A–D | Pending | 22–23 | Account/provider/preference verification |
| 25 Help/support A–B | Pending | 14 | Article/ticket/reply/private-file flow |
| 26 Onboarding | Pending | 14, 19, 22–25, required providers | Complete resumable setup/handoff |
| 27 Full release | Pending | 0–26 | All 301 screen contracts and release checks |

Phase numbers group work; they do not require waiting for Phase 21 before building its integration foundation in Phase 22. The recommended execution waves avoid circular dependencies:

1. Baseline and website release: 0–13, with shared identity/preferences/capability contracts defined in 0–1.
2. Workspace foundations: 14; foundational 22A/B/D, 23A job contracts, 23D and 24A/C; reuse existing code before extending it.
3. Media and business records: 15, 19, 20; complete shared transfers as entities become available.
4. Operations: 16, 17, 18, 21 and their module settings/provider integrations.
5. Complete settings/governance/account billing: remaining 22–24; help/support 25 can be completed earlier from existing implementations.
6. Full onboarding 26, then full-PDF acceptance 27.

Split lettered phases into separate reviewable increments. No time estimate is committed before the Phase 0 baseline and relevant per-screen contract review.

## 6. Per-screen completion record

Maintain a root-level `PDF_IMPLEMENTATION_COVERAGE.md` starting in Phase 0, with **301 rows**, one per PDF page. This is a shared planned deliverable for both plans, not a file created by this planning update. The website plan uses its website-page rows; this plan uses the remaining rows and owns full-PDF reconciliation. Each row must contain:

`PDF page | original page (inferred) | screen title | owning phase | application/route | states/actions | backend contracts | missing work | evidence | status`

Allowed statuses: `not started`, `contract reviewed`, `implementing`, `blocked`, `verified`. Update `verified` only when every required state/action for that page is covered. Link repeated patterns to shared evidence while recording the page-specific resource context and differences. Record screenshots, relevant automated checks and manual provider checks separately.

The roadmap is now complete at the feature-group and phase level for the supplied PDF. Exact field-level parity remains an explicit implementation gate for each screen, so later work cannot mistake this planning review for a completed implementation audit.
