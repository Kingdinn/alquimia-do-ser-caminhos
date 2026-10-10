-- Optional Google Calendar integration. Apply only after review; no existing journal writes change.
-- Secrets remain AES-256-GCM ciphertext even for the service role. This schema is NOT exposed by PostgREST.
create schema if not exists alquimia_private;
create table alquimia_private.calendar_connections (
  owner uuid primary key references auth.users(id) on delete cascade,
  credentials text,
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and octet_length(data::text) < 250000),
  lease_id uuid,
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  check (credentials is null or (left(credentials, 3) = 'v1.' and length(credentials) < 24000))
);
create table alquimia_private.calendar_oauth_states (
  owner uuid primary key references auth.users(id) on delete cascade,
  nonce_hash text not null,
  session_hash text not null,
  expires_at timestamptz not null,
  consumed boolean not null default false
);
alter table alquimia_private.calendar_connections enable row level security;
alter table alquimia_private.calendar_oauth_states enable row level security;
revoke all on alquimia_private.calendar_connections, alquimia_private.calendar_oauth_states from public, anon, authenticated, service_role;

-- Sole access is this server-only RPC. No authenticated/anon caller can obtain even encrypted credentials.
-- The server verifies the session and passes its owner; the service key never reaches a browser.
create function public.alquimia_calendar_state(p_owner uuid, p_action text, p_payload jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare item alquimia_private.calendar_connections%rowtype; consumed_count integer; next_data jsonb;
begin
  if p_owner is null then raise exception 'authentication_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('alquimia-calendar:' || p_owner::text, 0));
  select * into item from alquimia_private.calendar_connections where owner = p_owner;
  if p_action = 'oauth_begin' then
    insert into alquimia_private.calendar_oauth_states(owner, nonce_hash, session_hash, expires_at)
      values(p_owner, p_payload->>'nonce', p_payload->>'session', now() + interval '10 minutes')
      on conflict(owner) do update set nonce_hash = excluded.nonce_hash, session_hash = excluded.session_hash, expires_at = excluded.expires_at, consumed = false;
    return 'true'::jsonb;
  elsif p_action = 'oauth_consume' then
    update alquimia_private.calendar_oauth_states set consumed = true where owner = p_owner
      and nonce_hash = p_payload->>'nonce' and session_hash = p_payload->>'session' and expires_at > now() and consumed = false;
    get diagnostics consumed_count = row_count;
    return to_jsonb(consumed_count = 1);
  elsif p_action = 'read' then
    if item.owner is null then return null; end if;
  elsif p_action = 'connect' then
    -- The consumed attempt still has to exist: disconnect/new authorization invalidates in-flight callbacks.
    if not exists(select 1 from alquimia_private.calendar_oauth_states where owner = p_owner
      and nonce_hash = p_payload->>'nonce' and session_hash = p_payload->>'session' and expires_at > now() and consumed = true) then raise exception 'invalid_oauth_state'; end if;
    if item.lease_until > now() then raise exception 'calendar_busy'; end if;
    if item.credentials is not null and item.data->>'googleSubject' is distinct from p_payload->'data'->>'googleSubject' then raise exception 'different_google_account'; end if;
    if item.data->>'googleSubject' = p_payload->'data'->>'googleSubject' then
      next_data := item.data || jsonb_build_object('timeZone', p_payload->'data'->>'timeZone', 'errorCode', null, 'syncedVersion', -1);
    else next_data := p_payload->'data'; end if;
    insert into alquimia_private.calendar_connections(owner, credentials, data)
      values(p_owner, p_payload->>'credentials', next_data)
      on conflict(owner) do update set credentials = excluded.credentials, data = excluded.data, lease_id = null, lease_until = null, updated_at = now();
    delete from alquimia_private.calendar_oauth_states where owner = p_owner;
    select * into item from alquimia_private.calendar_connections where owner = p_owner;
  elsif p_action = 'acquire' then
    if item.credentials is null or item.lease_until > now() then return null; end if;
    update alquimia_private.calendar_connections set lease_id = (p_payload->>'lease')::uuid, lease_until = now() + interval '45 seconds', updated_at = now() where owner = p_owner returning * into item;
  elsif p_action = 'checkpoint' then
    if item.lease_id is distinct from (p_payload->>'lease')::uuid or item.lease_until <= now() or item.credentials is null then raise exception 'calendar_lease_lost'; end if;
    update alquimia_private.calendar_connections set data = p_payload->'data', credentials = p_payload->>'credentials', lease_until = now() + interval '45 seconds', updated_at = now() where owner = p_owner returning * into item;
  elsif p_action = 'release' then
    update alquimia_private.calendar_connections set lease_id = null, lease_until = null where owner = p_owner and lease_id = (p_payload->>'lease')::uuid;
    return 'true'::jsonb;
  elsif p_action = 'disconnect' then
    if item.lease_until > now() then raise exception 'calendar_busy'; end if;
    delete from alquimia_private.calendar_oauth_states where owner = p_owner;
    update alquimia_private.calendar_connections set credentials = null, lease_id = null, lease_until = null,
      data = data || jsonb_build_object('errorCode', null), updated_at = now() where owner = p_owner;
    return 'true'::jsonb;
  else raise exception 'invalid_calendar_operation';
  end if;
  return jsonb_build_object('data', item.data, 'credentials', item.credentials,
    'syncing', item.lease_until > now(), 'lease', item.lease_id);
end;
$$;
revoke all on function public.alquimia_calendar_state(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.alquimia_calendar_state(uuid, text, jsonb) to service_role;
comment on function public.alquimia_calendar_state(uuid, text, jsonb) is 'Server-only Calendar storage and fenced lease. No plaintext provider tokens.';
