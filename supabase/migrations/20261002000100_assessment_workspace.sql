-- An empty workspace. There is deliberately no candidate or assessment seed.
begin;
create table public.assessments (
  id text primary key,
  owner uuid not null references auth.users(id),
  title text not null,
  description text not null,
  status text not null check (status in ('draft','ready')),
  modules jsonb not null check (jsonb_typeof(modules) = 'array'),
  updated_at bigint not null,
  revision integer not null default 1 check (revision > 0)
);
create index assessments_owner_updated on public.assessments(owner, updated_at desc);
create table public.modules (
  id text primary key,
  owner uuid not null references auth.users(id),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  updated_at bigint not null,
  revision integer not null default 1 check (revision > 0)
);
create index modules_owner_updated on public.modules(owner, updated_at desc);
create table public.attempts (
  id text primary key,
  owner uuid not null references auth.users(id),
  assessment_id text not null references public.assessments(id),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  alias text not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  status text not null check (status in ('not-started','in-progress','completed')),
  created_at bigint not null,
  started_at bigint,
  deadline bigint,
  section_started_at bigint,
  current_index integer not null default 0 check (current_index >= 0),
  answers jsonb not null default '{}'::jsonb,
  result jsonb,
  review jsonb,
  expires_at bigint not null,
  revoked integer not null default 0 check (revoked in (0,1)),
  demo integer not null default 0 check (demo = 0),
  revision integer not null default 1 check (revision > 0)
);
create index attempts_owner_created on public.attempts(owner, created_at desc);
create table public.preview_attempts (like public.attempts including all);
alter table public.preview_attempts add foreign key (owner) references auth.users(id);
alter table public.preview_attempts add foreign key (assessment_id) references public.assessments(id);
create index preview_attempts_owner_created on public.preview_attempts(owner, created_at desc);

-- Only the Next server can access answer keys, snapshots or candidate results.
-- No browser role can read or mutate these tables, even when authenticated.
alter table public.assessments enable row level security;
alter table public.modules enable row level security;
alter table public.attempts enable row level security;
alter table public.preview_attempts enable row level security;
revoke all on public.assessments, public.modules, public.attempts, public.preview_attempts from anon, authenticated;
grant select, insert, update, delete on public.assessments, public.modules, public.attempts, public.preview_attempts to service_role;
commit;
