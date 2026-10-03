begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 100),
  slug text not null unique,
  created_at timestamptz not null default now(),
  unique (owner_id, id)
);
create table public.global_admins (
  user_id uuid primary key references auth.users(id),
  created_at timestamptz not null default now()
);
create table public.tenant_admin_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id),
  tenant_id uuid not null references public.tenants(id),
  action text not null check (action = 'switch-tenant'),
  created_at timestamptz not null default now()
);

-- Preserve every existing workspace and its records, including issued links.
insert into public.tenants (owner_id, name, slug)
select owners.owner, case when lower(u.email) = 'jaredsbuddy@outlook.com' then 'Resolvable' else 'Workspace' end,
  case when lower(u.email) = 'jaredsbuddy@outlook.com' then 'resolvable' else 'workspace-' || owners.owner::text end
from (
  select owner from public.assessments union select owner from public.modules
  union select owner from public.attempts union select owner from public.preview_attempts
  union select workspace_owner from public.workspace_members
) owners join auth.users u on u.id = owners.owner;

insert into public.global_admins(user_id)
select id from auth.users where lower(email) = 'jaredsbuddy@outlook.com'
  and email_confirmed_at is not null and not is_anonymous;

do $$
declare tbl text; owner_column text;
begin
  foreach tbl in array array['assessments','modules','attempts','preview_attempts','workspace_members'] loop
    owner_column := case when tbl = 'workspace_members' then 'workspace_owner' else 'owner' end;
    execute format('alter table public.%I add column tenant_id uuid', tbl);
    execute format('update public.%I r set tenant_id = t.id from public.tenants t where t.owner_id = r.%I', tbl, owner_column);
    execute format('alter table public.%I alter column tenant_id set not null', tbl);
    execute format('alter table public.%I add foreign key (%I, tenant_id) references public.tenants(owner_id, id)', tbl, owner_column);
    execute format('create index %I on public.%I(tenant_id)', tbl || '_tenant', tbl);
  end loop;
end;
$$;
alter table public.assessments add unique (id, tenant_id);
alter table public.attempts add foreign key (assessment_id, tenant_id) references public.assessments(id, tenant_id);
alter table public.preview_attempts add foreign key (assessment_id, tenant_id) references public.assessments(id, tenant_id);

-- Keep compatibility with the existing owner fields; derive tenant IDs in the
-- database and forbid reassigning records or memberships to another business.
create function private.set_record_tenant() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare record_owner uuid; expected uuid;
begin
  record_owner := (to_jsonb(new)->>tg_argv[0])::uuid;
  if tg_op = 'UPDATE' and (new.tenant_id is distinct from old.tenant_id
    or (to_jsonb(new)->>tg_argv[0]) is distinct from (to_jsonb(old)->>tg_argv[0])) then
    raise exception 'Records cannot move between businesses';
  end if;
  select t.id into expected from public.tenants t where t.owner_id = record_owner;
  if expected is null or (new.tenant_id is not null and new.tenant_id <> expected) then
    raise exception 'Invalid business';
  end if;
  new.tenant_id := expected;
  return new;
end;
$$;
revoke all on function private.set_record_tenant() from public, anon, authenticated;
do $$
declare tbl text;
begin
  foreach tbl in array array['assessments','modules','attempts','preview_attempts','workspace_members'] loop
    execute format('create trigger record_tenant before insert or update on public.%I for each row execute function private.set_record_tenant(%L)', tbl,
      case when tbl = 'workspace_members' then 'workspace_owner' else 'owner' end);
  end loop;
end;
$$;

-- This internal lookup avoids recursive membership policies. The caller's
-- verified identity and live stored permissions are checked on every request.
create function private.can_access_business(business_owner uuid, allowed_roles text[])
returns boolean language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from auth.users u where u.id = auth.uid()
      and u.email_confirmed_at is not null and not u.is_anonymous
  ) and (
    exists (select 1 from public.global_admins g where g.user_id = auth.uid())
    or exists (select 1 from public.workspace_members m
      where m.id = auth.uid() and m.workspace_owner = business_owner
        and m.status = 'active' and m.role = any(allowed_roles))
  );
$$;
revoke all on function private.can_access_business(uuid, text[]) from public, anon;
grant execute on function private.can_access_business(uuid, text[]) to authenticated;

alter table public.tenants enable row level security;
alter table public.global_admins enable row level security;
alter table public.tenant_admin_audit enable row level security;
revoke all on public.tenants, public.global_admins, public.tenant_admin_audit from anon, authenticated;
grant select on public.tenants, public.global_admins, public.workspace_members to authenticated;
grant select, insert, update, delete on public.tenants, public.global_admins, public.tenant_admin_audit to service_role;
grant usage, select on sequence public.tenant_admin_audit_id_seq to service_role;
create policy tenant_read on public.tenants for select to authenticated
  using ((select private.can_access_business(owner_id, array['admin','editor','viewer'])));
create policy global_admin_self on public.global_admins for select to authenticated
  using (user_id = (select auth.uid()));
create policy member_read on public.workspace_members for select to authenticated
  using (id = (select auth.uid()) or (select private.can_access_business(workspace_owner, array['admin'])));

do $$
declare tbl text;
begin
  foreach tbl in array array['assessments','modules','attempts','preview_attempts'] loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl);
    execute format('create policy business_read on public.%I for select to authenticated using ((select private.can_access_business(owner, array[''admin'',''editor'',''viewer''])))', tbl);
    execute format('create policy business_insert on public.%I for insert to authenticated with check ((select private.can_access_business(owner, array[''admin'',''editor''])))', tbl);
    execute format('create policy business_update on public.%I for update to authenticated using ((select private.can_access_business(owner, array[''admin'',''editor'']))) with check ((select private.can_access_business(owner, array[''admin'',''editor''])))', tbl);
    execute format('create policy business_delete on public.%I for delete to authenticated using ((select private.can_access_business(owner, array[''admin'',''editor''])))', tbl);
  end loop;
end;
$$;

-- Tenant creation is atomic and idempotent. No submitted owner, tenant or role
-- is accepted. It always creates a new business for the verified caller.
create function private.create_business(business_name text, contact_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare caller uuid := auth.uid(); email_address text; business uuid;
begin
  if caller is null then raise exception 'Sign in first'; end if;
  select u.email into email_address from auth.users u where u.id = caller
    and u.email_confirmed_at is not null and not u.is_anonymous;
  if email_address is null then raise exception 'Verify your email first'; end if;
  if business_name is null or length(trim(business_name)) not between 1 and 100
    or contact_name is null or length(trim(contact_name)) not between 1 and 100 then
    raise exception 'Enter a business and contact name';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(caller::text, 0));
  select m.tenant_id into business from public.workspace_members m where m.id = caller;
  if business is not null then return business; end if;
  select t.id into business from public.tenants t where t.owner_id = caller;
  if business is null then
    insert into public.tenants(owner_id, name, slug)
      values(caller, trim(business_name), 'business-' || gen_random_uuid()::text) returning id into business;
  end if;
  insert into public.workspace_members(id, workspace_owner, tenant_id, email, name, role, status, created_at)
    values(caller, caller, business, lower(email_address), trim(contact_name), 'admin', 'active', (extract(epoch from now()) * 1000)::bigint);
  return business;
end;
$$;
revoke all on function private.create_business(text, text) from public, anon;
grant execute on function private.create_business(text, text) to authenticated;
create function public.create_business(business_name text, contact_name text)
returns uuid language sql security invoker set search_path = '' as $$
  select private.create_business(business_name, contact_name);
$$;
revoke all on function public.create_business(text, text) from public, anon;
grant execute on function public.create_business(text, text) to authenticated;
commit;
