# Validation evidence

The imported Vinext/D1 implementation previously passed 70 API, 31 workflow and 28 browser checks, including ten automated accessibility audits. Those results apply to the earlier hosting stack, not this migrated backend.

Current migration validation uses actual local Supabase PostgreSQL, PostgREST and GoTrue containers with real password sessions. Next.js build, type checking and lint passed. The migrated application passed 70 API checks, 31 workflow checks, 30 desktop/mobile browser checks (including twelve automated WCAG audits) and 15 direct Supabase security checks. Browser sign-in initially exposed a mismatch between the browser Origin and Next's normalized listener URL; comparing against incoming Host resolved it, and the complete browser suite passed. An initial parallel workflow run failed a shared candidate-count assertion; rerunning sequentially passed. Full API/workflow/browser regression results are generated in ignored `tests/*-results.json`; live suites must run sequentially because they share count assertions.

Coverage: reusable module create/edit, frozen assessment content, ten-minute validation, signed-out candidate completion, autosave/resume and clocks, fixed typing time, overall expiry, objective scoring, human review persistence, duplicate/concurrent submissions, preview separation, owner isolation, guest rejection, malformed input and hidden answer keys. Browser tests exercise desktop/mobile and automated WCAG checks, including the new sign-in form.

Local CLI health-check limitation: the slim GoTrue container's wget health probe follows inherited HTTP proxy settings and receives 403. Direct local GoTrue health responds 200, and the application uses direct loopback fetches. Startup uses the CLI's documented ignore-health-check option followed by explicit functional health and database checks; an unavailable API still fails readiness.

Hosted Supabase Auth, table permissions/RLS, public Vercel access, real admin authentication, synthetic password recovery and access isolation have been verified on https://training-app-ashy-eight.vercel.app. The recovery check used an admin-generated link and sent no email; actual mailbox delivery remains unverified. Temporary Auth users and isolation fixtures were removed. Real-device and assistive-technology testing remain separate from automated browser checks.

## Supplied core assessment

The source document is converted into four editable modules and an overall assessment, with keys B/A/B/C. `tests/typing-metrics.mjs` covers the documented Unicode/prefix-alignment metric, interior omissions, insertions, empty input, an unfinished tail, correction to exact text, elapsed-time speed, longest-prefix tie-breaking and stable answer IDs after reordering. The measured passage contains 706 characters and 128 words.

`tests/core-workflow.py` exercises the real local API and PostgreSQL: shared deadlines, returning to earlier answers, confidential payloads, deliberate typing, rejected restarts and partial early finish, exact-passage early completion, locked typing, separate four-decision results, duplicate submission, five human criteria with evidence, review history, immutable assignments, recorded extra time and expiry preserving saved work. It passed 25 checks, including measured-module reuse in a blank assessment and legacy typing within a shared timer.

`tests/core-browser.mjs` exercises both desktop and mobile against Next's production server. It passed 20 checks (including fourteen automated WCAG audits), covering editable timing and all five rubric criteria, signed-out completion, developing case facts, typing practice/start, a normal 60-second desktop sample, mobile typing refresh with technical-review flag, writing autosave, response review, decision counts and persisted human review history. Axe runs after finite UI transitions settle, retaining all zero-violation assertions. Its source is deliberately restricted to local QA; hosted verification uses a separately scoped private copy and removes only explicitly tracked synthetic IDs.

The core is a pilot work sample. Automated correctness and accessibility checks do not establish predictive validity, screen-reader usability or appropriate hiring cutoffs. No hiring decision, percentile, universal speed cutoff or automatic writing grade is generated.

## Interactive typing upgrade

The new shared typing component runs in both the core and earlier candidate journeys. `tests/typing-metrics.mjs` compares 14,641 alignments against an independent full-matrix oracle to verify the memory-efficient scorer preserves the published prefix metric and tie-breaking. It also checks word-level correction, misplaced punctuation, extra spaces/characters, cursor movement, Unicode and line endings.

The updated core browser suite passed 32 checks, including sixteen automated WCAG audits. The additional typing suite passed twelve checks and two WCAG audits, covering both legacy timer modes, an editable alternative passage, automatic target scoring, adding a library module through the assessment builder and an early completion whose speed uses the exact server duration. Its typing checks use real browser keystrokes, check wrong/correct word transitions, move the selection back to earlier text, verify paste/drop rejection and keyboard navigation, follow the caret through a long passage, compare live accuracy/errors with the documented metric, preserve both deadlines, lock input after completion and compare saved speed/accuracy/errors against confirmed text and server duration. Desktop uses normal 60-second expiry; mobile exercises refresh and exact early completion. Practice does not start or alter the measured timer.

The final release passed 48 hosted browser checks: 36 for the complete desktop/mobile core journey and twelve for both legacy timer modes and editable module reuse, including eighteen automated WCAG audits. Its API regression passed 70 checks and the expanded local core workflow passed 25. All tracked hosted QA attempts, previews, assessments and the temporary library module were removed; the actual four core modules and assessment were preserved. Screenshots and machine-readable reports are retained under ignored test-results and private runtime directories; no real candidate records are used for QA.

The original low-time countdown colour failed WCAG contrast (3.84:1) in the legacy typing test; its darker warning colour now passes. Incremental Next builds retained the old global stylesheet despite updated source. Removing only generated `.next` output after stopping the local server, then rebuilding, corrected the served asset. The release checks verify the actual served styles as well as the build result. The preserved responsive sign-in page also passed desktop/mobile WCAG audits.

## Candidate connection recovery (local QA)

`npm run test:reliability` exercises four controlled network failures against the local Next.js production server and real local Supabase. A delayed typing-interruption acknowledgement previously replaced keystrokes entered after reload with the earlier saved text. The candidate now keeps those edits, accepts the server's interruption metadata and revision, and autosaves the newer text without moving either deadline. A failed start now displays an accessible error beside the Start button; if the start reached the server but its response was lost, Reload saved state resumes the original timer. Recovery text uses a higher-contrast colour after the new mobile error-state audit exposed the previous 3.64:1 contrast.

The regression suite checks a rejected start and successful retry, a committed start with a lost response and deadline-preserving resume, and real browser keystrokes entered while the interruption response is delayed. It verifies the final text in Supabase, both unchanged deadlines, the retained technical-review flag, mobile reflow, a zero-violation WCAG audit and no browser page errors. Fixtures are restricted to generated loopback configuration; cleanup deletes only the exact synthetic IDs created by that run.

Initial verification at `c31e36d` passed the production build, typecheck, lint, three network-failure regressions, 70 API checks, 25 core workflow checks, 32 core browser checks and twelve legacy/reused typing checks. The scorer also matched all 14,641 reference alignments. These checks use isolated local fixtures. They are not authenticated production QA, and do not change authentication, scoring rules or production data. Run the database-backed suites sequentially as above.

### PR #2 review verification

The three tests submitted at `c31e36d` were rerun unchanged against a separately built `ef1db70` checkout. Both start-recovery tests failed because their alerts were missing; the typing test failed because `Case 2048 is open.` reverted to `Case `. All three passed against the exact `c31e36d` build.

An additional delayed-response test exposed a remaining display issue at `c31e36d`: the typing countdown jumped from 57 seconds back to 60 when an old `serverNow` timestamp arrived. The client now keeps its monotonic elapsed-time estimate when a response carries an older timestamp. Server deadlines and scoring rules are unchanged. The fourth regression observes both visible countdowns after the delayed acknowledgement and verifies that neither gains time.

At review time, `main` remained at `ef1db70`. The exact `c31e36d` Vercel preview build was Ready, but the repository had no GitHub Actions workflows or PR-triggered workflow runs; a green preview-build status is not evidence that the regression suites ran in CI. Production rollout and authenticated production QA remain separate from these local results.

The review rerun also caught an intermittent failure in the existing desktop typing-focus assertion: the one-shot animation-frame callback could run before the input was mounted. Typing focus now follows the committed active-typing state in an effect, rather than racing the DOM update. The existing two-second focus assertion was retained unchanged.

The legacy browser rerun exposed a fixture collision: repeated runs left identically named synthetic library modules, so its broad selector matched multiple buttons. The fixture now has a run-specific title and an exact selector. Earlier local fixtures are preserved.

After the review corrections, the production build, typecheck, lint, four recovery regressions, 25 core workflow checks, 32 core browser checks and twelve legacy/reuse browser checks passed. The scoring reference comparison also passed all 14,641 alignments. The unchanged desktop focus assertion passed; no timeouts or accessibility assertions were relaxed.


## Customer journey audit and navigation recovery

Audited from merged `main` at `90bb2c5` using only the loopback Next.js/Supabase fixtures. The existing desktop/mobile journey passed 30 browser checks, including module creation/editing, assessment building, candidate-link generation, signed-out completion, answer persistence and human-result review. The workflow suite passed 31 checks covering owner isolation, immutable assessment copies, preview separation, expiry/revocation and result/review persistence.

A controlled delayed section-navigation response reproduced silent answer loss: the writing field accepted `Initial customer reply. Extra detail.` while the server had saved only `Initial customer reply.`. When navigation finished, the extra text disappeared. The regression failed against the unchanged `90bb2c5` application; its output is retained locally under ignored `test-results/reliability/navigation-before-fix.log`.

Flexible assessment questions and writing are now temporarily locked only while changing sections. Regular autosave still permits editing. Both successful and failed navigation release the lock. Two added browser regressions check accepted writing against persisted answers during delayed navigation, editing after returning, disabled choices during an outstanding request, and editing/saving/retrying after a rejected navigation. The six recovery checks pass against the production build with local Supabase; their exact synthetic records are removed after the run.

After the fix, the production build, lint and typecheck passed, followed by all six recovery checks, 32 core browser checks and twelve legacy/reused typing checks. The browser suites include automated WCAG audits, viewport overflow checks, real typing input and persisted human-review evidence.

This audit does not establish real email delivery, authenticated production access, assistive-technology usability with a human screen-reader user, or behavior on physical mobile devices. Browser mobile coverage uses Chromium viewport emulation. No real candidate records, production authentication settings, scoring rules or external invitations were changed.

## Editable assessment rules and reduced copy

Removed the ten-minute validation limit and editor readiness block. Timing mode, work/section budgets, typing duration, exact-passage early completion, paste permission and candidate link expiry are assessor settings stored with reusable modules or assessment configuration. Candidate policy, spelling tools and data-use notice can be edited or left blank in either timer mode. The supplied core keeps its existing defaults. Existing assignments and completed results retain their saved content.

Workspace footers, repeated instructional paragraphs and field explanations were removed; optional administration fields are grouped under Candidate settings. Actual task instructions, reviewer criteria, actionable save errors and preview status remain available.

The release passed typecheck, lint and a fresh production build; 71 API regression checks, 25 core workflow checks, 32 desktop/mobile core browser checks and twelve legacy/module-reuse browser checks. The independent typing oracle passed all 14,641 alignments. Four connection-recovery regressions and fourteen new test:settings checks also passed. Settings coverage exercises the real module editor, a twenty-minute assessment, saved link expiry, signed-out custom-duration typing, enabled paste, disabled early finish enforced by the server, sequential timing, actual-duration results and preserved assignment snapshots. Desktop and mobile settings include automated WCAG audits.

Legacy default section-timer answer payloads remain compatible. Custom/measured typing records server timing metadata. The new sequential test waits for the active input before reading its deadline; it does not assume a button click has already committed the start request. Paste-rejection checks retain the same input/focus assertions using the shortened user-facing message.


## PR #3: both candidate timer modes

The reliability fix now covers flexible section navigation, legacy Save & continue/final submission, and early typing completion in both modes. Text remains selectable while read-only; choices are disabled only during a transition that will replace or lock the answer. Normal autosave stays editable. Failure releases the lock, and the existing request guard prevents duplicate transitions. The legacy Saved status now distinguishes a newer unsaved edit from the snapshot just acknowledged.

The legacy clock now uses a monotonic elapsed-time estimate. Before the fix, a delayed autosave response moved a displayed countdown from 281 to 284 seconds. Server deadlines, grace periods and scoring remain unchanged. The legacy answer-loss and timer regressions failed against `18863fd` (whose legacy component matches the original `90bb2c5` parent). Early-finish fault injection also reproduced accepted keystrokes disappearing in both typing modes before the shared typing input lock was added.

`test:reliability` runs eleven local fault-injection cases. These include keyboard selection and Tab navigation, disabled-radio tab order, arrow/Space recovery after a failed request, repeated activation, persisted writing/choices/typing, and both visible and server timers. Paused and error states receive automated WCAG checks. Exact-ID fixture cleanup is restricted to generated loopback Supabase configuration.

Concurrent main commit `e6cfed2` was merged into this branch before final validation. Its editable rules, server behavior, shortened copy and new settings tests are preserved. PR changes relative to that main commit are confined to candidate transition/clock handling, the shared typing input lock, reliability tests and this evidence. No authentication, scorer or production-data changes are included.

The production origin passed 50 live checks for the configured rules and complete desktop/mobile core journey, including separate protected previews, duplicate submissions and saved human reviews. Only directly tracked synthetic records were removed. A final follow-up makes sequential typing’s displayed section duration, overall deadline and review time budget use the configured measurement window rather than the shared-mode preparation budget; the settings regression asserts all three clocks agree.


## Question display and navigation

New UI-created assessments and the supplied core default to one question at a time with backward navigation disabled. Assessors can edit either setting under Candidate settings. The server owns the current question index, merges answers without dropping earlier choices, hides unavailable questions and rejects earlier-answer edits, section jumps and premature submission. Question changes preserve the shared or section deadline. Issued assignments retain their snapshots; no database migration is needed.

The local release passed fifteen new question-flow checks, including desktop shared timing, mobile section timing, refresh, a lost Next acknowledgement, API bypass attempts, saved objective scores, typing/writing completion, duplicate submission and human review. Two automated WCAG audits and mobile reflow checks passed. Explicitly enabling backward navigation is also covered. The existing reviewable-journey fixtures now explicitly select that configuration, keeping their prior assertions intact.

The regression run passed 71 API checks, 25 core workflow checks, 32 core browser checks, twelve legacy/reuse typing checks, fourteen configurable-settings checks and eleven connection-recovery checks after preserving the newer GitHub navigation and typing-lock fixes. The independent typing oracle passed all 14,641 comparisons. Typecheck, lint and a fresh production build passed.
