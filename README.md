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

Admins sign in with Supabase email/password and must appear in the server's `ASSESS_ADMIN_EMAILS` allowlist. Reusable modules are stored separately from assessments. Editing a library module does not rewrite saved assessments or issued attempts. Default scenarios take about ten minutes. Assessors can change the shared work timer or each section’s time limit; there is no ten-minute policy cap.

Preview test creates a separate, owner-protected preview. Create candidate link creates a bearer link with editable expiry (seven days by default); the candidate completes that assigned attempt without signing in. New assessments default to one question at a time and forward-only navigation. Both options are editable under Candidate settings. Question progress is stored on the server; refresh resumes the current question without resetting its timers, and earlier answers cannot be changed when going back is disabled. Server clocks, revision checks, autosave and immutable submitted results protect refresh/resume, time limits and duplicate submissions. Written responses have human review rubrics and are not automatically graded.

The server-only Supabase credential accesses PostgreSQL. Row-level security is enabled and both anonymous and authenticated browser roles have no access to assessment content, answer keys or results. The Next API checks admin identity/ownership and strips scoring keys from candidate responses.

See [DEPLOYMENT_HANDOFF.md](DEPLOYMENT_HANDOFF.md), [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) and [QA.md](QA.md). The production website is https://training-app-ashy-eight.vercel.app. The app account is jaredsbuddy@outlook.com; enter that email on /login and use Forgot password? to choose a password. The Supabase dashboard login is separate.

## Customer-service core assessment

The supplied assessment is preserved in `content/customer-service-core-v1.json` as an administrative import source, including confidential answer keys. It is not imported by application client code or served as a public asset. Importing it is an explicit administrator operation; application startup never seeds assessments, modules or candidates. The editable database records, rather than this file, drive the workspace.

The core comprises CS01 customer updates, CS02 typing, CS03 delivery policy and CS06 customer email. The shared work timer is 530 seconds, with a planned 60-second introduction and 20 seconds for transitions already included in timed work: 590 seconds planned overall. Section budgets are guidance. The supplied core presents one question at a time with backward navigation disabled; assessors can change both options. Typing has interactive unscored practice and a deliberate typing task (60 seconds by default). Its reference follows the caret, marks correct and incorrect words/characters and scrolls with the current position. Live WPM, accuracy and character errors update as candidates type; corrections are allowed, paste/drop is blocked by default and expiry locks the input. Final speed/accuracy is recalculated from saved text and server duration, with optional exact-passage early completion and a technical-review flag after interruption. The passage and practice text remain editable in the module library. Typing duration, early completion and paste permission are editable module settings. A new measured module defaults to shared timing; an explicit assessor choice of separate section timers is preserved. Tool policy, spelling tools, data-use notice and link expiry are editable under Candidate settings for either timer mode. Legacy target scoring remains available.

In Module library, edit each module's content, policy, choices, keys, timing, typing passage or writing criteria. Edit the assessment to change its copies and administration settings. Existing assignments retain their original content and configuration. Human reviewers enter five individually anchored 0–3 ratings with evidence; revisions preserve previous ratings and reviewer identity. No automatic writing grade or hiring verdict is produced.

Extra work time can be assigned when generating a link. A technical restart requires an administrator to create a fresh candidate link and revoke the affected original link where appropriate; both records remain available for review. No diagnosis is requested. The support email is optional; without it candidates are directed to the person who supplied their link. Assessment replies, including the pretend customer email, are saved in the app and are never sent as email.

Additional local verification:

```sh
npm run test:core
npm run test:core:browser
npm run test:settings
npm run test:question-flow
```

Run these sequentially with the other suites. For production-mode local QA, stop the local dev server, run `npm run build:local`, then `npm run start:local`. These commands explicitly use the isolated local QA configuration even when hosted variables are injected into the cloud environment. Standard `npm run build` remains the Vercel production build.
