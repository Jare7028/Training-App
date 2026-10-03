begin;
-- Hiring decisions are assessor metadata. Candidate content, clocks and results
-- remain untouched; previews have no hiring workflow.
alter table public.attempts add column hiring jsonb not null
  default '{"stage":"Unassigned","notes":"","revision":0}'::jsonb;
alter table public.attempts add constraint attempts_hiring_valid check (
  jsonb_typeof(hiring) = 'object'
  and hiring ?& array['stage','notes','revision']
  and jsonb_typeof(hiring->'stage') = 'string'
  and length(trim(hiring->>'stage')) between 1 and 50
  and jsonb_typeof(hiring->'notes') = 'string'
  and length(hiring->>'notes') <= 5000
  and jsonb_typeof(hiring->'revision') = 'number'
  and (hiring->>'revision') ~ '^(0|[1-9][0-9]{0,8})$'
);
-- Retain existing tenant RLS and the restricted candidate-column grants.
grant update (hiring) on public.attempts to authenticated;
commit;
