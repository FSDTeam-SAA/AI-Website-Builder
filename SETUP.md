# Setup and deployment

1. Use Node.js 22 LTS and run `npm ci`.
2. Copy `env.example` to `.env.local`.
3. Set `KORA_BACKEND_URL` to the backend API, including `/api/v1`.
4. Run `npm run dev`, or `npm run build` and `npm start` for production.

For Vercel, use the Next.js preset, `npm ci`, `npm run build` and its default output directory. Set the publicly reachable HTTPS backend URL in the project environment, then redeploy. Do not use localhost in Vercel production.

Sign in with an existing Kora business account. Entitlements are checked by the backend. Store database credentials, AI keys, media credentials and payment secrets only in `backendKoraAi`.

Prisma/PostgreSQL, Clerk, tRPC, E2B and Inngest were removed from this frontend. Their prior source remains in Git history. No database migration or database data changes are part of this cleanup.
