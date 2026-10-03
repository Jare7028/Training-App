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

`db:start` uses the official Supabase CLI and its digest-verified slim container images. The CLI's local authentication health check runs wget through inherited proxy settings in this cloud environment and receives a proxy 403 even though GoTrue is available. The documented `--ignore-health-check` option keeps the containers running; `scripts/local-ready.mjs` independently requires a successful authentication health response and queries all five database tables. A failed functional check still fails startup. When upgrading an existing local database, run `npm run db:migrate` to add any missing tables, then repeat the readiness check.

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
npm run test:accounts
npm run test:clean
```

Run the live QA suites sequentially against the local development server: they share a workspace and check candidate counts. Browser QA requires Chromium at `/usr/bin/chromium` or `CHROMIUM_PATH`. Tests refuse non-loopback application URLs; local setup and cleanup refuse non-local Supabase databases. Never connect these fixtures to applicant data.

## Product behaviour

Team members sign in with Supabase email/password. `ASSESS_ADMIN_EMAILS` bootstraps existing verified accounts as owners of their separate workspaces; after that, the database membership controls access. Apply both migrations before starting the app.

Admins can open **Accounts & permissions** to add accounts, change roles and suspend or restore access. New accounts get a one-time setup link to share directly with the account holder; creating an account does not send an email. Existing accounts with no workspace can join using their current password. Accounts already belonging to another workspace cannot be moved through this screen. Replacement setup links are available until password setup is complete; configured users reset their own passwords from sign-in.

| Role | Access |
| --- | --- |
| Admin | Manage team accounts and all assessment work |
| Editor | Edit assessments/modules, create/revoke candidate links, preview and review candidates |
| Viewer | Read assessments, modules and candidate results |

Each account belongs to one workspace. Added team members share the inviting Admin's workspace; existing owner workspaces remain separate. The owner retains Admin access, and Admins cannot change their own access. Roles and suspension are checked from the database on every protected request, including existing sessions. Browser roles cannot read or update memberships directly, and user-editable profile metadata cannot grant permissions.

Reusable modules are stored separately from assessments. Editing a library module does not rewrite saved assessments or issued attempts. Default scenarios take nine minutes; the server rejects assessments longer than ten minutes.

Preview test creates a separate, owner-protected preview. Create candidate link creates a seven-day bearer link; the candidate completes that assigned attempt without signing in. Server clocks, revision checks, autosave and immutable submitted results protect refresh/resume, time limits and duplicate submissions. Written responses have human review rubrics and are not automatically graded.

The server-only Supabase credential accesses PostgreSQL. Row-level security is enabled and both anonymous and authenticated browser roles have no access to memberships, assessment content, answer keys or results. The Next API checks verified identity, current role and workspace ownership and strips scoring keys from candidate responses.

See [DEPLOYMENT_HANDOFF.md](DEPLOYMENT_HANDOFF.md), [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) and [QA.md](QA.md). A successful local build is not a deployed website. Buddy's replacement assessment remains queued until its source is available.
