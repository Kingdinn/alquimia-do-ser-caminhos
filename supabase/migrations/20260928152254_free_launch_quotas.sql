-- All account writes use the user's JWT. This schema must stay out of the
-- Data API's exposed schemas; public wrappers below remain security invoker.
create schema if not exists alquimia_private;
revoke all on schema alquimia_private from public, anon, authenticated;
grant usage on schema alquimia_private to authenticated;

alter table public.alquimia_images
  add column state text not null default 'ready'
    check (state in ('reserved', 'ready', 'deleting')),
  add column created_at timestamptz not null default now();

alter table public.alquimia_journals
  add constraint alquimia_journal_size check (octet_length(body::text) <= 614400);

-- A client cannot manufacture reservations, change their owner/key/state, or
-- remove metadata while leaving uncounted Storage objects behind.
revoke all on public.alquimia_images from public, anon, authenticated;
grant select on public.alquimia_images to authenticated;
drop policy own_images on public.alquimia_images;
create policy own_images_read on public.alquimia_images
  for select to authenticated using ((select auth.uid()) = owner);

-- One transaction lock serializes quota, journal references and image state
-- changes, including Storage INSERT and direct Data API journal writes.
create function alquimia_private.lock_owner()
returns uuid language plpgsql security invoker set search_path = '' as $$
declare account uuid := auth.uid();
begin
  if account is null then raise exception 'authentication_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('alquimia:' || account::text, 0));
  return account;
end;
$$;

create function alquimia_private.reserve_image(image_mime text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare account uuid; image_id uuid := gen_random_uuid(); object_name text;
begin
  account := alquimia_private.lock_owner();
  if image_mime is null or image_mime not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception 'invalid_image_type';
  end if;
  if (select count(*) from public.alquimia_images where owner = account) >= 12 then
    raise exception 'image_quota_exceeded';
  end if;
  object_name := account::text || '/' || image_id::text;
  insert into public.alquimia_images (id, owner, object_key, mime, state)
    values (image_id, account, object_name, image_mime, 'reserved');
  return jsonb_build_object('id', image_id, 'object_key', object_name);
end;
$$;

create function alquimia_private.complete_image(image_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare account uuid; item public.alquimia_images%rowtype;
begin
  account := alquimia_private.lock_owner();
  select * into item from public.alquimia_images where id = image_id and owner = account;
  if not found or item.state = 'deleting' then raise exception 'image_not_available'; end if;
  if not exists (select 1 from storage.objects
    where bucket_id = 'alquimia-vision' and name = item.object_key) then
    raise exception 'image_upload_incomplete';
  end if;
  update public.alquimia_images set state = 'ready' where id = image_id and owner = account;
  return true;
end;
$$;

create function alquimia_private.begin_image_delete(image_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare account uuid; object_name text;
begin
  account := alquimia_private.lock_owner();
  select object_key into object_name from public.alquimia_images
    where id = image_id and owner = account;
  if not found then return null; end if;
  if exists (select 1 from public.alquimia_journals
    where owner = account and body->'images' @> jsonb_build_array(jsonb_build_object('id', image_id::text))) then
    raise exception 'image_in_use';
  end if;
  update public.alquimia_images set state = 'deleting' where id = image_id and owner = account;
  return object_name;
end;
$$;

create function alquimia_private.finish_image_delete(image_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare account uuid; item public.alquimia_images%rowtype;
begin
  account := alquimia_private.lock_owner();
  select * into item from public.alquimia_images where id = image_id and owner = account;
  if not found then return true; end if;
  if item.state <> 'deleting' then raise exception 'image_delete_not_started'; end if;
  if exists (select 1 from storage.objects
    where bucket_id = 'alquimia-vision' and name = item.object_key) then
    raise exception 'image_delete_incomplete';
  end if;
  if exists (select 1 from public.alquimia_journals
    where owner = account and body->'images' @> jsonb_build_array(jsonb_build_object('id', image_id::text))) then
    raise exception 'image_in_use';
  end if;
  delete from public.alquimia_images where id = image_id and owner = account;
  return true;
end;
$$;

create function alquimia_private.can_upload_image(object_name text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare account uuid;
begin
  account := alquimia_private.lock_owner();
  return exists (select 1 from public.alquimia_images
    where owner = account and object_key = object_name and state = 'reserved');
end;
$$;

-- The trigger also protects writes made directly through the Data API. Once
-- deletion begins, no other tab can save a reference to the disappearing file.
create function alquimia_private.validate_journal_images()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare account uuid;
begin
  account := alquimia_private.lock_owner();
  if new.owner <> account then raise exception 'invalid_journal_owner'; end if;
  if octet_length(new.body::text) > 614400 then raise exception 'journal_too_large'; end if;
  if jsonb_typeof(new.body->'images') is distinct from 'array' then raise exception 'invalid_images'; end if;
  if jsonb_array_length(new.body->'images') > 12 then raise exception 'invalid_images'; end if;
  if exists (select 1 from jsonb_array_elements(new.body->'images') image
    where not exists (select 1 from public.alquimia_images i
      where i.id::text = image->>'id' and i.owner = account and i.state = 'ready')) then
    raise exception 'image_not_available';
  end if;
  return new;
end;
$$;
create trigger alquimia_validate_journal_images
  before insert or update on public.alquimia_journals
  for each row execute function alquimia_private.validate_journal_images();

create function public.alquimia_reserve_image(image_mime text)
returns jsonb language sql security invoker set search_path = '' as $$
  select alquimia_private.reserve_image(image_mime);
$$;
create function public.alquimia_complete_image(image_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select alquimia_private.complete_image(image_id);
$$;
create function public.alquimia_begin_image_delete(image_id uuid)
returns text language sql security invoker set search_path = '' as $$
  select alquimia_private.begin_image_delete(image_id);
$$;
create function public.alquimia_finish_image_delete(image_id uuid)
returns boolean language sql security invoker set search_path = '' as $$
  select alquimia_private.finish_image_delete(image_id);
$$;

create or replace function public.alquimia_save_journal(payload jsonb, expected_version integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare result integer; account uuid;
begin
  account := alquimia_private.lock_owner();
  if expected_version is null or expected_version < 0 or payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'invalid_journal';
  end if;
  if octet_length(payload::text) > 614400 then raise exception 'journal_too_large'; end if;
  if expected_version = 0 then
    insert into public.alquimia_journals (owner, body, version)
      values (account, payload, 1) on conflict (owner) do nothing returning version into result;
  else
    update public.alquimia_journals set body = payload, version = version + 1
      where owner = account and version = expected_version returning version into result;
  end if;
  return result;
end;
$$;

revoke all on all functions in schema alquimia_private from public, anon, authenticated;
grant execute on function alquimia_private.lock_owner(),
  alquimia_private.reserve_image(text), alquimia_private.complete_image(uuid),
  alquimia_private.begin_image_delete(uuid), alquimia_private.finish_image_delete(uuid),
  alquimia_private.can_upload_image(text) to authenticated;
revoke all on function public.alquimia_reserve_image(text), public.alquimia_complete_image(uuid),
  public.alquimia_begin_image_delete(uuid), public.alquimia_finish_image_delete(uuid),
  public.alquimia_save_journal(jsonb, integer) from public, anon, authenticated;
grant execute on function public.alquimia_reserve_image(text), public.alquimia_complete_image(uuid),
  public.alquimia_begin_image_delete(uuid), public.alquimia_finish_image_delete(uuid),
  public.alquimia_save_journal(jsonb, integer) to authenticated;

update storage.buckets set public = false, file_size_limit = 1048576,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
  where id = 'alquimia-vision';
drop policy alquimia_private_images on storage.objects;
create policy alquimia_image_read on storage.objects for select to authenticated
  using (bucket_id = 'alquimia-vision' and exists (
    select 1 from public.alquimia_images i
    where i.owner = (select auth.uid()) and i.object_key = name));
create policy alquimia_image_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'alquimia-vision' and alquimia_private.can_upload_image(name));
create policy alquimia_image_delete on storage.objects for delete to authenticated
  using (bucket_id = 'alquimia-vision' and exists (
    select 1 from public.alquimia_images i
    where i.owner = (select auth.uid()) and i.object_key = name and i.state = 'deleting'));
-- Deliberately no UPDATE policy: an existing object cannot be overwritten.
