begin;
create table public.request_boards (
  tenant_id uuid primary key references public.tenants(id),
  owner uuid not null,
  columns jsonb not null,
  revision integer not null default 1 check (revision > 0),
  foreign key (owner, tenant_id) references public.tenants(owner_id, id)
);
create table public.workspace_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.request_boards(tenant_id),
  owner uuid not null,
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '' check (length(description) <= 10000),
  column_id text not null,
  assignee_id uuid references public.workspace_members(id),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  position double precision not null default 0,
  archived boolean not null default false,
  revision integer not null default 1 check (revision > 0),
  created_at bigint not null,
  updated_at bigint not null,
  foreign key (owner, tenant_id) references public.tenants(owner_id, id),
  unique (id, tenant_id)
);
create index workspace_requests_board_order on public.workspace_requests(tenant_id, archived, column_id, position);
create table public.request_images (
  id uuid primary key,
  tenant_id uuid not null,
  owner uuid not null,
  request_id uuid not null,
  object_path text not null unique,
  name text not null check (length(name) between 1 and 150),
  bytes integer not null check (bytes between 1 and 3145728),
  created_at bigint not null,
  foreign key (owner, tenant_id) references public.tenants(owner_id, id),
  foreign key (request_id, tenant_id) references public.workspace_requests(id, tenant_id) on delete cascade,
  check (object_path = tenant_id::text || '/' || request_id::text || '/' || id::text || '.webp')
);
create index request_images_request on public.request_images(tenant_id, request_id, created_at);

-- Validate columns at the database boundary too, including direct session writes.
create function private.guard_request_board() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if jsonb_typeof(new.columns) <> 'array' or jsonb_array_length(new.columns) not between 1 and 12 then
    raise exception 'Use between one and twelve columns';
  end if;
  if exists(select 1 from jsonb_array_elements(new.columns) c
    where jsonb_typeof(c) <> 'object' or coalesce(c->>'id','') !~ '^[a-zA-Z0-9-]{1,50}$'
      or length(trim(coalesce(c->>'name',''))) not between 1 and 60)
    or (select count(distinct c->>'id') from jsonb_array_elements(new.columns) c) <> jsonb_array_length(new.columns) then
    raise exception 'Invalid columns';
  end if;
  if tg_op = 'UPDATE' and exists(select 1 from public.workspace_requests r
    where r.tenant_id = new.tenant_id and not r.archived
      and not exists(select 1 from jsonb_array_elements(new.columns) c where c->>'id' = r.column_id)) then
    raise exception 'Move the requests before removing their column';
  end if;
  return new;
end;
$$;
create function private.guard_workspace_request() returns trigger
language plpgsql security invoker set search_path = '' as $$
declare board jsonb;
begin
  select b.columns into board from public.request_boards b where b.tenant_id = new.tenant_id for share;
  if not new.archived and not exists(select 1 from jsonb_array_elements(board) c where c->>'id' = new.column_id) then
    raise exception 'Choose an existing column';
  end if;
  if new.assignee_id is not null and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
    and not exists(select 1 from public.request_assignees(new.owner) m where m.id = new.assignee_id and m.status = 'active') then
    raise exception 'Choose an active user in this business';
  end if;
  return new;
end;
$$;

-- A minimal directory for assignments; it does not expose emails or Auth data.
create function public.request_assignees(business_owner uuid)
returns table(id uuid, name text, status text)
language sql stable security definer set search_path = '' as $$
  select m.id, m.name, m.status from public.workspace_members m
  where m.workspace_owner = business_owner
    and private.can_access_business(business_owner, array['admin','editor','viewer']);
$$;
revoke all on function public.request_assignees(uuid) from public, anon;
grant execute on function public.request_assignees(uuid) to authenticated, service_role;
revoke all on function private.guard_request_board(), private.guard_workspace_request() from public, anon, authenticated;
create trigger board_tenant before insert or update on public.request_boards for each row execute function private.set_record_tenant('owner');
create trigger board_columns before insert or update on public.request_boards for each row execute function private.guard_request_board();
create trigger request_tenant before insert or update on public.workspace_requests for each row execute function private.set_record_tenant('owner');
create trigger request_fields before insert or update on public.workspace_requests for each row execute function private.guard_workspace_request();
create trigger image_tenant before insert or update on public.request_images for each row execute function private.set_record_tenant('owner');

do $$ declare tbl text; begin
  foreach tbl in array array['request_boards','workspace_requests','request_images'] loop
    execute format('alter table public.%I enable row level security', tbl);
    execute format('revoke all on public.%I from anon, authenticated', tbl);
    execute format('grant select, insert, update, delete on public.%I to authenticated, service_role', tbl);
    execute format('create policy request_read on public.%I for select to authenticated using ((select private.can_access_business(owner, array[''admin'',''editor'',''viewer''])))', tbl);
    execute format('create policy request_insert on public.%I for insert to authenticated with check ((select private.can_access_business(owner, array[''admin'',''editor''])))', tbl);
    execute format('create policy request_update on public.%I for update to authenticated using ((select private.can_access_business(owner, array[''admin'',''editor'']))) with check ((select private.can_access_business(owner, array[''admin'',''editor''])))', tbl);
    execute format('create policy request_delete on public.%I for delete to authenticated using ((select private.can_access_business(owner, array[''admin'',''editor''])))', tbl);
  end loop;
end $$;

-- Private storage has no browser policies. Authenticated image responses are
-- served only after checking the current business and live session permissions.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('workspace-request-images', 'workspace-request-images', false, 3145728, array['image/webp']);
commit;
