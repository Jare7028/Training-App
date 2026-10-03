begin;
-- One account belongs to one owner's workspace. Assessment ownership remains
-- unchanged so existing separate workspaces cannot be merged accidentally.
create table public.workspace_members (
  id uuid primary key references auth.users(id),
  workspace_owner uuid not null references auth.users(id),
  email text not null check (length(email) between 3 and 254),
  name text not null check (length(name) between 1 and 100),
  role text not null check (role in ('admin', 'editor', 'viewer')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at bigint not null,
  revision integer not null default 1 check (revision > 0),
  constraint workspace_owner_retains_access check (
    id <> workspace_owner or (role = 'admin' and status = 'active')
  ),
  unique (workspace_owner, email)
);
create index workspace_members_owner_created on public.workspace_members(workspace_owner, created_at desc);
alter table public.workspace_members enable row level security;
revoke all on public.workspace_members from anon, authenticated;
grant select, insert, update, delete on public.workspace_members to service_role;
commit;
