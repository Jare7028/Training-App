<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Existing Supabase management access

The user has saved `SUPABASE_ACCESS_TOKEN` in GitHub Actions repository secrets for `Jare7028/Training-App`. Reuse it through `.github/workflows/supabase-management.yml`; the token stays on the GitHub runner. A missing local environment variable or a 403 when listing repository secrets does not mean the saved credential is missing. Do not ask the user to supply it again for that reason.

Run `gh workflow run supabase-management.yml --repo Jare7028/Training-App --ref main -f operation=verify`, then inspect the workflow run with `gh run list` and `gh run view --log`. The workflow exposes only safe status values. Extend the workflow for other authorized Supabase Management API operations as needed, keeping credentials and full configuration responses out of logs and artifacts. Target the existing project `nzoumetzzfvxavxdmjis`. Never copy the management token into application environment variables or frontend code.

Access was verified on 2026-10-03. The user explicitly requested immediate signup and login without confirmation emails. Use `operation=enable_signup_without_confirmation` for that configuration. Do not restore required email confirmation or make SMTP/domain setup a signup prerequisite unless the user asks. Supabase auto-confirms new accounts; keep existing database/session permission checks and tenant isolation. Use current workflow output to check live settings.

For the candidate hiring metadata schema, use the narrow `.github/workflows/supabase-database.yml` workflow with `operation=verify` or `operation=apply`. It uses the same repository secret, applies only `20261003201000_candidate_hiring.sql`, records the migration transactionally and verifies the column, constraint and restricted grant. If connected Supabase MCP lists tools but denies database operations, use this existing runner credential rather than requesting another token. Do not replay base, business or Requests migrations, reset real passwords or print database responses or credentials.

The same database workflow supports `migration=unsaved_previews` for `20261003220000_unsaved_previews.sql`. It allows standalone/unsaved preview snapshots by making only the preview assessment reference nullable; real candidate references and access policies remain unchanged. Use the explicit target when verifying or applying it. Builder previews render the actual Candidate component in a full-screen dialog, preserve unsaved editor changes, and use protected preview records. Run `npm run test:preview` plus question-flow/reliability checks when changing these paths.

The database workflow also supports `migration=account_usernames` for `20261005090000_account_usernames.sql`. It adds a protected, globally unique normalised username to existing memberships without changing existing email credentials or records. Verify/apply only this explicit target; repeated applies verify without replaying SQL. New team accounts use Admin-set username/password, immediate confirmed Auth identities and the existing tenant/role checks. Pending legacy accounts can have a password set directly; never reset confirmed accounts or the real owner as part of QA. Run `npm run test:usernames` and `npm run test:accounts` for changes to account provisioning or sign-in.

Admin password changes are explicitly requested by the user. The `change-password` account action supports confirmed staff in the selected workspace, preserving role/status/identity and requiring Admin, same origin and tenant checks. Owner and caller passwords use the personal signed-in password page instead. Do not change real credentials during QA; create and clean exact synthetic identities. Run `test:passwords`, `test:usernames` and `test:accounts` sequentially.

Mobile layouts have a dedicated `npm run test:mobile` suite covering touch controls, readable inputs, viewport-bounded dialogs, wrapped tabs, sticky save actions/clear notifications and collapsed module navigation at 320/390/667/768px. Builder entry and page navigation reset the previous list scroll position without resetting on each edit. Preserve the separate protected full-screen candidate preview and actual candidate navigation. Layout suites share local fixtures: run sequentially, with `test:clean` before analytics empty-state checks. Never broaden local cleanup to hosted records. Physical Safari/software keyboards require separate device verification.

`npm run build` now uses `scripts/build.mjs`, clearing only this checkout's generated `.next` output before Next compilation. `build:local` calls the same script with its guarded loopback QA environment. Stop only the owned local Next server before rebuilding; do not delete runtime credentials, source, dependencies or data. This fixes observed hosted stale CSS alongside fresh components; verify loaded CSS and the exact live deployment, not only the Git commit or build status.
