# Production readiness

The app has been adapted for Next.js on Vercel with Supabase PostgreSQL and verified Supabase user sessions. It no longer trusts caller-supplied platform identity headers. No local mock login exists in the application.

The Supabase/Vercel setup in DEPLOYMENT_HANDOFF.md is connected and the administrator account is provisioned. Complete a low-stakes pilot before consequential hiring use. Release review includes:

- Apply both PostgreSQL migrations, check all five tables, privileges and RLS. Browser roles must not access memberships, keys, snapshots or candidate responses directly.
- Configure the server credential and initial owner emails in `ASSESS_ADMIN_EMAILS`. Verified owners bootstrap on first access; stored memberships then control access. Disable public registration while keeping email/password authentication available.
- Configure production callback URLs, the real admin app account and email delivery. Test invitations and password recovery. Default Supabase email restrictions may require SMTP for assessors outside the organisation owner address.
- Permit unauthenticated candidate paths through Vercel deployment protection, while keeping admin pages and APIs protected by the app.
- Verify the live desktop/mobile workflow, timer expiry, refresh/resume, duplicate submissions and separate-user access. Local QA is evidence about the app, not evidence that hosted configuration works.

Candidate links are sensitive bearer credentials: seven-day expiry, server-stored SHA-256 hashes, revocation and no-referrer headers are implemented. Writing requires human judgement and evidence notes. Each owner has a separate workspace with Admin, Editor and Viewer memberships. Admins manage accounts and share one-time setup links without automatic email delivery. Verify role changes, suspension, setup links and cross-workspace isolation on the deployed origin before release.

No real applicant records were imported from the prototype. No candidates or assessments are automatically seeded. Buddy's supplied four-module core assessment has been implemented as editable content with versioned assignment snapshots, separate typing observations and evidence-based human rubrics. The source JSON contains administrative keys and must not be served publicly. This repository does not contain a live deployment identity or management token.
