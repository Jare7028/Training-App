begin;
alter table public.workspace_members add column username text;
alter table public.workspace_members add constraint workspace_username_valid
  check (username is null or username ~ '^[a-z0-9][a-z0-9._-]{2,39}$');
create unique index workspace_username_unique on public.workspace_members(username) where username is not null;
-- Existing SELECT/RLS and service-only membership writes remain unchanged.
commit;
