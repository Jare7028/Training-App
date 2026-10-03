<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Existing Supabase management access

The user has saved `SUPABASE_ACCESS_TOKEN` in GitHub Actions repository secrets for `Jare7028/Training-App`. Reuse it through `.github/workflows/supabase-management.yml`; the token stays on the GitHub runner. A missing local environment variable or a 403 when listing repository secrets does not mean the saved credential is missing. Do not ask the user to supply it again for that reason.

Run `gh workflow run supabase-management.yml --repo Jare7028/Training-App --ref main -f operation=verify`, then inspect the workflow run with `gh run list` and `gh run view --log`. The workflow exposes only safe status values. Extend the workflow for other authorized Supabase Management API operations as needed, keeping credentials and full configuration responses out of logs and artifacts. Target the existing project `nzoumetzzfvxavxdmjis`. Never copy the management token into application environment variables or frontend code.

Access was verified on 2026-10-03. The user explicitly requested immediate signup and login without confirmation emails. Use `operation=enable_signup_without_confirmation` for that configuration. Do not restore required email confirmation or make SMTP/domain setup a signup prerequisite unless the user asks. Supabase auto-confirms new accounts; keep existing database/session permission checks and tenant isolation. Use current workflow output to check live settings.
