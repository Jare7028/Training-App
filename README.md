# Training-App — Resolvable Assess

Customer-service recruitment assessments with an editable module library, timed public candidate links, automatic objective scoring and human writing review.

The application now uses standard Next.js 16, Supabase PostgreSQL and Supabase Auth. Vercel hosts the website. It no longer depends on the separate ChatGPT-hosted prototype or Cloudflare D1.

## Local development

Use Node 22.13 or newer and Docker. From this repository:

```sh
npm ci --include=dev --include=optional
npm run db:start
npm run db:migrate
npm run test:setup
npm run dev:local
```

`db:start` uses the official Supabase CLI and its digest-verified slim container images. The CLI's local authentication health check runs wget through inherited proxy settings in this cloud environment and receives a proxy 403 even though GoTrue is available. The documented `--ignore-health-check` option keeps the containers running; `scripts/local-ready.mjs` independently requires a successful authentication health response and queries all four database tables. A failed functional check still fails startup.

`test:setup` refuses non-loopback databases, creates only three local test accounts, and writes an ignored `.env.local`. It never seeds sample candidates or assessments. `dev:local` explicitly isolates these test variables from any hosted-project variables injected by the cloud. Local QA password: `Local-QA-Only-57!Password`; emails: `recruiter@qa.invalid`, `second@qa.invalid`, `guest@qa.invalid`. Only the first two are authorised admins. These fixtures must never be deployed.

To use a real Supabase project instead, set the variables shown in `.env.example`. Preserve any existing `.env.local`; the QA setup deliberately refuses to overwrite a manually configured file. Vercel's Supabase integration may supply `NEXT_PUBLIC_SUPABASE_ANON_KEY`, which is accepted instead of `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

## Checks

```sh
npm run typecheck
npm run lint
npm run build
npm run test:api
npm run test:workflow
npm run test:browser
npm run test:supabase
npm run test:clean
```

Run the live QA suites sequentially against the local development server: they share a workspace and check candidate counts. Browser QA requires Chromium at `/usr/bin/chromium` or `CHROMIUM_PATH`. Tests refuse non-loopback application URLs; local setup and cleanup refuse non-local Supabase databases. Never connect these fixtures to applicant data.

## Product behaviour

Admins sign in with Supabase email/password and must appear in the server's `ASSESS_ADMIN_EMAILS` allowlist. Reusable modules are stored separately from assessments. Editing a library module does not rewrite saved assessments or issued attempts. Default scenarios take nine minutes; the server rejects assessments longer than ten minutes.

Preview test creates a separate, owner-protected preview. Create candidate link creates a seven-day bearer link; the candidate completes that assigned attempt without signing in. Server clocks, revision checks, autosave and immutable submitted results protect refresh/resume, time limits and duplicate submissions. Written responses have human review rubrics and are not automatically graded.

The server-only Supabase credential accesses PostgreSQL. Row-level security is enabled and both anonymous and authenticated browser roles have no access to assessment content, answer keys or results. The Next API checks admin identity/ownership and strips scoring keys from candidate responses.

See [DEPLOYMENT_HANDOFF.md](DEPLOYMENT_HANDOFF.md), [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) and [QA.md](QA.md). A successful local build is not a deployed website. Buddy's replacement assessment remains queued until its source is available.
