begin;
-- Business roles review/revoke attempts; only the candidate server changes
-- frozen snapshots, responses, clocks and objective results.
revoke update on public.attempts, public.preview_attempts from authenticated;
grant update (review, revoked, revision) on public.attempts, public.preview_attempts to authenticated;
commit;
