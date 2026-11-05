# NOVYA Website Builder

Next.js frontend for `backendKoraAi`. The backend owns business authentication, subscriptions, websites, AI generation, media and published releases.

## Local development

Use Node.js 22 LTS. Start the backend separately, then run:

```sh
npm ci
```

Copy `env.example` to `.env.local` and configure:

```dotenv
KORA_BACKEND_URL=http://localhost:5009/api/v1
```

```sh
npm run dev
```

Open http://localhost:3000/website-builder. The root URL redirects there.

## Vercel

Use the Next.js framework preset, install command `npm ci`, build command `npm run build` and the default output directory. Set `KORA_BACKEND_URL` to the deployed HTTPS backend URL ending in `/api/v1`, then redeploy. Production cannot reach your computer through localhost.

This frontend needs no database URL, Prisma generation, Clerk keys, E2B, Inngest or AI provider keys. Configure provider credentials only in `backendKoraAi`.

The thin Next.js `/api/kora/*` proxy keeps the session token in an HttpOnly cookie and checks write origins. `/site/*` forwards published website content from the backend. This requires a Next.js deployment, not a static export; business logic and persistence stay in the backend.

## Verification

```sh
npm run lint
npm run typecheck
npm run build
npm run test:website-builder
```

Browser tests require the sibling backend dependencies. They run a disposable backend on port 4311 and frontend on 4310 without customer data or paid AI requests.

See [feature details](KORA_WEBSITE_BUILDER.md) and [implementation plans](docs/implementation/README.md).
