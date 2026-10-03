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

`db:start` uses the official Supabase CLI and its digest-verified slim container images. The CLI's local authentication health check runs wget through inherited proxy settings in this cloud environment and receives a proxy 403 even though GoTrue is available. The documented `--ignore-health-check` option keeps the containers running; `scripts/local-ready.mjs` independently requires a successful authentication health response, queries all eleven database tables and checks private image storage. A failed functional check still fails startup.

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
npm run test:modules
npm run test:candidate-tools
npm run test:supabase
npm run test:accounts
npm run test:tenants
npm run test:clean
```

Run the live QA suites sequentially against the local development server: they share a workspace and check candidate counts. Browser QA requires Chromium at `/usr/bin/chromium` or `CHROMIUM_PATH`. Tests refuse non-loopback application URLs; local setup and cleanup refuse non-local Supabase databases. Never connect these fixtures to applicant data.

## Product behaviour

Team members sign in with Supabase email/password. `ASSESS_ADMIN_EMAILS` bootstraps existing verified accounts as owners of their separate workspaces; after that, the database membership controls access. Apply all repository migrations before starting the app.

Admins can open **Accounts & permissions** to add accounts, change roles and suspend or restore access. New accounts get a one-time setup link to share directly with the account holder; creating an account does not send an email. Existing accounts with no workspace can join using their current password. Accounts already belonging to another workspace cannot be moved through this screen. Replacement setup links are available until password setup is complete; configured users reset their own passwords from sign-in.

| Role | Access |
| --- | --- |
| Admin | Manage team accounts and all assessment work |
| Editor | Edit assessments/modules, create/revoke candidate links, preview and review candidates |
| Viewer | Read assessments, modules and candidate results |

Each account belongs to one workspace. Added team members share the inviting Admin's workspace; existing owner workspaces remain separate. The owner retains Admin access, and Admins cannot change their own access. Roles and suspension are checked from the database on every protected request, including existing sessions. Authenticated users can read only their own membership; tenant Admins can read their team. Membership changes go through the server. User-editable profile metadata cannot grant permissions.

Choose **Create module** in Module library, then **Questions**, **Typing** or **Written response**. Each opens a blank editor for your own content. Questions have editable choices, correct answers and explanations; writing tasks have custom review criteria, rating ranges and anchors. Save the module to reuse it in assessments. **Add module** in the assessment builder offers the same blank types, saved library modules and optional presets.

Reusable modules are stored separately from assessments. Editing a library module does not rewrite saved assessments or issued attempts. Default scenarios take about ten minutes. Assessors can change the shared work timer or each section’s time limit; there is no ten-minute policy cap.

Preview test creates a separate, owner-protected preview. Create candidate link creates a bearer link with editable expiry (seven days by default); the candidate completes that assigned attempt without signing in. New assessments default to one question at a time and forward-only navigation. Both options are editable under Candidate settings. Question progress is stored on the server; refresh resumes the current question without resetting its timers, and earlier answers cannot be changed when going back is disabled. Server clocks, revision checks, autosave and immutable submitted results protect refresh/resume, time limits and duplicate submissions. Written responses have human review rubrics and are not automatically graded.

Workspace reads and writes use the signed-in Supabase session and database row-level policies. Anonymous access is denied; verified members can access only their own business, with Editor/Admin roles required for writes. The service credential is reserved for candidate bearer links, account provisioning and server-side expiry scoring. The Next API also checks verified identity, current role and workspace ownership, and strips scoring keys from candidate responses.

See [DEPLOYMENT_HANDOFF.md](DEPLOYMENT_HANDOFF.md), [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) and [QA.md](QA.md). The production website is https://training-app-ashy-eight.vercel.app. The app account is jaredsbuddy@outlook.com; enter that email on /login and use Forgot password? to choose a password. The Supabase dashboard login is separate.

The assessment list uses a full-width table with one row per assessment, its duration and module count, and separate candidate-link, preview and edit actions. Rows wrap on smaller screens. Candidate results live in Candidate review. Library cards show concise metadata; full instructions remain editable in the module editor. Writing criteria expand individually, with scoring guidance available during review.

## Business signup and tenants

`/signup` collects a business name, contact name, email and password (at least 12 characters). Hosted signup confirms the account automatically and signs the user in immediately, without sending a verification email. The database creates a new business and its first Admin together. Retries reuse the same tenant; matching names or email domains never join another business. New businesses start empty. Signed-in users who still need to finish setup can use `/onboarding`.

The business migration preserves existing owner fields, assessments, modules, results and candidate links while adding permanent tenant IDs and matching foreign keys. The existing `jaredsbuddy@outlook.com` workspace becomes **Resolvable** (`resolvable`). The verified account receives a separately stored global admin role. Global admins use the business selector to open one tenant at a time; switching is logged and old-tab mutations are rejected. Business Admins cannot grant global admin access.

Hosted signup enables Supabase Auth **Allow new users to sign up** and disables required email confirmation, as requested by the user. SMTP and a custom domain are not prerequisites for account creation or login. Password-reset email delivery remains a separate, paused setup. Local configuration still uses confirmation and local Mailpit so the existing tenant QA suite can verify that flow as well as API and database isolation, role escalation attempts, stale-tab protection and global switching. Local settings do not update hosted Auth configuration.

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


## Requests

Open **Requests** in the sidebar to create, edit and assign cards to active users in the selected business. Drag cards between columns or change the Column field in the request editor. Edit columns to rename, add or reorder them. Search and assignment filters, priorities and archiving are available. Viewers can read requests and images; Admins and Editors can change them.

Paste a screenshot into an open request editor, or use Add images. Images and request details are saved in Supabase, with private, session-protected image access. Large images are resized before upload, and the server validates and normalises them. Local development now starts Supabase Storage too. Apply `20261003143000_requests_board.sql` after the business tenant migrations; it creates an empty board schema and a private bucket, with no sample requests. Run `npm run test:requests` for the loopback-only clipboard, persistence and isolation checks.

## Analytics

Open **Analytics** for assessment and Requests reports. Recharts 3.8.0 supplies the interactive, keyboard-accessible charts under its MIT license; see [OPEN_SOURCE_NOTICES.md](OPEN_SOURCE_NOTICES.md). The chart bundle loads when Analytics opens. No external analytics account, tracking script, data warehouse or new database migration is required.

Assessment reports filter the cohort by candidate-link creation date (UTC) and assessment. They show current progress, completion, question-weighted objective accuracy, writing review outcomes, snapshot-specific module results, measured typing medians, human criterion ratings and work time. Previews are excluded. The server reads every page of the tenant's records, including historical assignments beyond the candidate screen's 200-record limit. Written work never receives an automatic grade; typing never becomes a hiring verdict. Interrupted typing and not-scorable writing ratings are excluded from numeric summaries. Empty measurements display a dash.

Requests reports filter by request creation date and use the business's current custom columns, assignees, priorities and archive state. No column name implies completion. Counts include inactive assignees still holding cards. All reports offer custom dates, refresh, readable chart data and CSV export with spreadsheet-formula protection. Definitions are available in a collapsed section.

`GET /api/analytics` uses the signed-in Supabase session and existing business RLS, checks stale tenant headers and returns private/no-store aggregates. It exposes no candidate aliases, answers, scoring keys, bearer tokens, image paths or reviewer notes. Admin, Editor and Viewer can read it; suspension revokes access. Run `npm run test:analytics` for metric and loopback-only API/browser checks; synthetic records are tracked and removed by exact IDs.

## Candidate management

Candidate review supports assessment, review-status and hiring-stage filters. Select 2–4 candidates to compare objective points, typing measurements and human rubric ratings. Different assigned content or settings are flagged. **Export CSV** exports the current filtered results; it excludes answers, keys, notes and candidate links and escapes spreadsheet formulas. Candidate reads use complete keyset pagination, including older records beyond the former 200-candidate screen limit.

Open a candidate to save **Hiring decision**: a stage and private follow-up notes. Choose a suggested stage or a custom name. Admins and Editors can save; Viewers can read, compare and export. Hiring metadata has its own revision so assessor updates do not interrupt candidate progress or alter submitted results. Stale notes are rejected with a conflict.

Assessment and module **More actions → Duplicate** opens an independent editable copy; assessment copies start as drafts. Module library supports search and type filters. Originals and existing candidate snapshots remain unchanged.

Apply `20261003201000_candidate_hiring.sql` once after the existing tenant and restricted-column migrations. It adds assessor metadata and its restricted update grant to attempts; it does not rewrite assessment snapshots, answers or clocks. Supabase management access is available through the GitHub Actions repository secret; the dedicated database workflow verifies or applies only this checked-in migration, records its version transactionally, and prints no credentials or applicant data. See [COMPETITOR_REVIEW.md](COMPETITOR_REVIEW.md) for the public first-party research and remaining gaps.
