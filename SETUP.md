# Setup and deployment

1. Use Node.js 22 LTS and run `npm ci`.
2. Copy `env.example` to `.env.local`.
3. Set `KORA_BACKEND_URL` to the backend API, including `/api/v1`.
4. Run `npm run dev`, or `npm run build` and `npm start` for production.

For Vercel, use the Next.js preset, `npm ci`, `npm run build` and its default output directory. Set the publicly reachable HTTPS backend URL in the project environment, then redeploy. Do not use localhost in Vercel production.

Sign in with an existing Kora business account. Entitlements are checked by the backend. Store database credentials, AI keys, media credentials and payment secrets only in `backendKoraAi`.

## Published content security

Generated sites support semantic HTML and CSS. Arbitrary website JavaScript, forms, plugins and server-side generated code are not supported. HTML is sanitized on storage and public rendering. Both public serving routes send a CSP sandbox without script or same-origin permissions, block scripts/forms/objects, and send `Referrer-Policy: no-referrer`. HTTPS images and fonts remain permitted; they can contact third-party servers.

The editor preview uses a sandboxed iframe. Only the editor-owned bridge script is authorized by its nonce; generated website scripts are not allowed. API writes require the builder origin, the session cookie is HttpOnly, and backend operations enforce organization capabilities and website ownership.

For production, serve customer content from a separate site/domain with no Naneo authentication cookies. The CSP sandbox strengthens browser isolation on the existing `/site` path, but does not provision separate hosting, containers or databases. Domain routing, cookie scope and production infrastructure require deployment verification. Do not enable arbitrary generated scripts by relaxing these policies.

AI follow-ups include up to twelve recent messages from the same organization, website and page, with proposal review state. This context is sent to the selected AI provider with the current draft. Only applying a proposal changes the draft; publishing remains a separate review step.

Prisma/PostgreSQL, Clerk, tRPC, E2B and Inngest were removed from this frontend. Their prior source remains in Git history. No database migration or database data changes are part of this cleanup.
