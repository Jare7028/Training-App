# Validation evidence

The imported Vinext/D1 implementation previously passed 70 API, 31 workflow and 28 browser checks, including ten automated accessibility audits. Those results apply to the earlier hosting stack, not this migrated backend.

Current migration validation uses actual local Supabase PostgreSQL, PostgREST and GoTrue containers with real password sessions. Next.js build, type checking and lint passed. The migrated application passed 70 API checks, 31 workflow checks, 30 desktop/mobile browser checks (including twelve automated WCAG audits) and 15 direct Supabase security checks. Browser sign-in initially exposed a mismatch between the browser Origin and Next's normalized listener URL; comparing against incoming Host resolved it, and the complete browser suite passed. An initial parallel workflow run failed a shared candidate-count assertion; rerunning sequentially passed. Full API/workflow/browser regression results are generated in ignored `tests/*-results.json`; live suites must run sequentially because they share count assertions.

Coverage: reusable module create/edit, frozen assessment content, ten-minute validation, signed-out candidate completion, autosave/resume and clocks, fixed typing time, overall expiry, objective scoring, human review persistence, duplicate/concurrent submissions, preview separation, owner isolation, guest rejection, malformed input and hidden answer keys. Browser tests exercise desktop/mobile and automated WCAG checks, including the new sign-in form.

Local CLI health-check limitation: the slim GoTrue container's wget health probe follows inherited HTTP proxy settings and receives 403. Direct local GoTrue health responds 200, and the application uses direct loopback fetches. Startup uses the CLI's documented ignore-health-check option followed by explicit functional health and database checks; an unavailable API still fails readiness.

Hosted Supabase configuration, Vercel deployment, real email delivery, real-device/assistive-technology testing and production-origin isolation remain unverified. The current session's proxy rejects external Supabase API requests. No deployed-site readiness claim is made.
