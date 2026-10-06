begin;
-- Server-owned durable scoring leases. Existing results, rubrics and tenant RLS
-- stay intact; browser clients may read status but cannot forge job state.
alter table public.attempts add column ai_scoring jsonb not null default '{}'::jsonb;
alter table public.attempts add constraint attempts_ai_scoring_valid check (
  jsonb_typeof(ai_scoring) = 'object'
);
revoke update (ai_scoring) on public.attempts from anon, authenticated;
commit;
