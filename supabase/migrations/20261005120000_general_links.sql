begin;
create table public.general_links (
  id text primary key,
  owner uuid not null references auth.users(id),
  tenant_id uuid not null references public.tenants(id),
  assessment_id text not null,
  share_token text not null unique check (share_token ~ '^[a-f0-9]{64}$'),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at bigint not null,
  expires_at bigint not null,
  revoked integer not null default 0 check (revoked in (0,1)),
  foreign key (assessment_id, tenant_id) references public.assessments(id, tenant_id),
  unique (id, tenant_id)
);
create index general_links_owner_created on public.general_links(owner, created_at desc);
create trigger record_tenant before insert or update on public.general_links
  for each row execute function private.set_record_tenant('owner');
alter table public.general_links enable row level security;
revoke all on public.general_links from anon, authenticated;
grant select, insert on public.general_links to authenticated;
grant update (revoked) on public.general_links to authenticated;
grant select, insert, update, delete on public.general_links to service_role;
create policy business_read on public.general_links for select to authenticated
  using ((select private.can_access_business(owner, array['admin','editor','viewer'])));
create policy business_insert on public.general_links for insert to authenticated
  with check ((select private.can_access_business(owner, array['admin','editor'])));
create policy business_update on public.general_links for update to authenticated
  using ((select private.can_access_business(owner, array['admin','editor'])))
  with check ((select private.can_access_business(owner, array['admin','editor'])));
alter table public.attempts add column general_link_id text;
alter table public.attempts add foreign key (general_link_id, tenant_id)
  references public.general_links(id, tenant_id);
create index attempts_general_link on public.attempts(general_link_id);

-- Serialise registrations with link closure; a browser retry reuses its private
-- token hash. Names are labels, never identities or lookup credentials.
create function public.register_general_candidate(link_token text, candidate_name text, attempt_hash text)
returns text language plpgsql security invoker set search_path = '' as $$
declare link public.general_links; existing public.attempts; attempt_id text;
  current_ms bigint := floor(extract(epoch from clock_timestamp()) * 1000);
begin
  if link_token !~ '^[a-f0-9]{64}$' or attempt_hash !~ '^[a-f0-9]{64}$'
    or length(btrim(candidate_name)) not between 1 and 80 then
    raise exception 'Invalid registration';
  end if;
  select * into link from public.general_links where share_token = link_token for update;
  if not found or link.revoked = 1 or link.expires_at <= current_ms then return null; end if;
  select * into existing from public.attempts where token_hash = attempt_hash;
  if found then
    if existing.general_link_id = link.id then return existing.id; end if;
    return null;
  end if;
  attempt_id := gen_random_uuid()::text;
  insert into public.attempts(id, owner, tenant_id, assessment_id, general_link_id,
    token_hash, alias, snapshot, status, created_at, expires_at)
  values (attempt_id, link.owner, link.tenant_id, link.assessment_id, link.id,
    attempt_hash, btrim(candidate_name), link.snapshot, 'not-started', current_ms,
    current_ms + coalesce((link.snapshot->'config'->>'linkExpiryDays')::bigint,7) * 86400000);
  return attempt_id;
end;
$$;
revoke all on function public.register_general_candidate(text,text,text) from public, anon, authenticated;
grant execute on function public.register_general_candidate(text,text,text) to service_role;
commit;
