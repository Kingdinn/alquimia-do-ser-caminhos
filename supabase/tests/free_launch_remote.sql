-- Hosted Supabase variant: run as postgres after both migrations, on ONE
-- connection. BEGIN/ROLLBACK removes every auth/app fixture and temp helper.
-- No INSERT, UPDATE or DELETE targets Storage. No Storage protection setting
-- or privilege is changed. Only bucket configuration and policy predicates
-- are inspected; this does NOT replace an authenticated Storage HTTP test.
-- Still pending over HTTP: successful upload/finalization, 1 MiB rejection,
-- ready image references, image_in_use, actual object deletion and isolation.
-- Keep free_launch_quotas.sql for the disposable local Storage schema fixture.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/free_launch_remote.sql
begin;

create temporary table quota_remote_state (key text primary key, value jsonb);
grant select, insert, update, delete on quota_remote_state to authenticated;
create function pg_temp.remote_assert(condition boolean, description text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'ASSERTION FAILED: %', description; end if;
end;
$$;
create function pg_temp.remote_expect_error(statement text, expected text)
returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if position(expected in sqlerrm) = 0 then
      raise exception 'Expected error containing %, got %', expected, sqlerrm;
    end if;
    return;
  end;
  raise exception 'Expected failure: %', statement;
end;
$$;

insert into auth.users (id, email, aud, role) values
 ('dc8f9c51-a8cb-45e6-b806-32156608fa11', 'quota-remote-a@example.invalid', 'authenticated', 'authenticated'),
 ('dc8f9c51-a8cb-45e6-b806-32156608fa12', 'quota-remote-b@example.invalid', 'authenticated', 'authenticated');

select pg_temp.remote_assert((select not public and file_size_limit = 1048576
  and allowed_mime_types = array['image/jpeg','image/png','image/webp']
  from storage.buckets where id = 'alquimia-vision'), 'private bucket configured for one MiB');
select pg_temp.remote_assert(not has_table_privilege('authenticated', 'public.alquimia_images', 'INSERT')
  and not has_table_privilege('authenticated', 'public.alquimia_images', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.alquimia_images', 'DELETE'), 'metadata has no direct writes');
select pg_temp.remote_assert(not has_function_privilege('anon', 'public.alquimia_reserve_image(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'alquimia_private.reserve_image(text)', 'EXECUTE'), 'anonymous has no reserve RPC');
select pg_temp.remote_assert((select convalidated from pg_constraint
  where conrelid='public.alquimia_journals'::regclass and conname='alquimia_journal_size'), 'journal size CHECK is validated');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'dc8f9c51-a8cb-45e6-b806-32156608fa11', true);
select set_config('request.jwt.claims', '{"sub":"dc8f9c51-a8cb-45e6-b806-32156608fa11","role":"authenticated"}', true);
insert into quota_remote_state (key, value)
  select 'image-' || n, public.alquimia_reserve_image('image/png') from generate_series(1,12) n;
select pg_temp.remote_assert((select count(*)=12 and bool_and(state='reserved') from public.alquimia_images), 'twelve reservations fit');
select pg_temp.remote_expect_error($q$select public.alquimia_reserve_image('image/png')$q$, 'image_quota_exceeded');
select pg_temp.remote_expect_error($q$select public.alquimia_reserve_image('text/html')$q$, 'invalid_image_type');
select pg_temp.remote_expect_error($q$delete from public.alquimia_images$q$, 'permission denied');
select pg_temp.remote_expect_error($q$update public.alquimia_images set state='ready'$q$, 'permission denied');
select pg_temp.remote_expect_error($q$insert into public.alquimia_images (id,owner,object_key,mime) values
  (gen_random_uuid(),auth.uid(),'arbitrary','image/png')$q$, 'permission denied');
select pg_temp.remote_assert(alquimia_private.can_upload_image((select value->>'object_key' from quota_remote_state where key='image-1')), 'own reservation passes upload predicate');
select pg_temp.remote_assert(not alquimia_private.can_upload_image(auth.uid()::text || '/' || gen_random_uuid()::text), 'unreserved key fails upload predicate');
select pg_temp.remote_expect_error($q$select public.alquimia_complete_image((select (value->>'id')::uuid from quota_remote_state where key='image-1'))$q$, 'image_upload_incomplete');
select pg_temp.remote_expect_error($q$select public.alquimia_finish_image_delete((select (value->>'id')::uuid from quota_remote_state where key='image-1'))$q$, 'image_delete_not_started');

-- Versioned journal writes work without any Storage object fixture.
select pg_temp.remote_assert(public.alquimia_save_journal('{"images":[],"text":"first"}'::jsonb,0)=1, 'first journal save executes authenticated trigger');
select pg_temp.remote_assert(public.alquimia_save_journal('{"images":[]}'::jsonb,0) is null, 'duplicate initial save conflicts');
select pg_temp.remote_assert(public.alquimia_save_journal('{"images":[]}'::jsonb,99) is null, 'stale version conflicts');
select pg_temp.remote_assert((select version=1 and body->>'text'='first' from public.alquimia_journals), 'conflicts preserve saved contents');
select pg_temp.remote_expect_error($q$select public.alquimia_save_journal(jsonb_build_object('images','[]'::jsonb,'text',repeat('é',307200)),1)$q$, 'journal_too_large');
select pg_temp.remote_expect_error($q$update public.alquimia_journals set body=jsonb_build_object('images','[]'::jsonb,'text',repeat('é',307200))$q$, 'journal_too_large');
select pg_temp.remote_expect_error($q$update public.alquimia_journals set body='{}'::jsonb$q$, 'invalid_images');
select pg_temp.remote_expect_error($q$update public.alquimia_journals set body='{"images":null}'::jsonb$q$, 'invalid_images');
select pg_temp.remote_expect_error($q$update public.alquimia_journals set body=jsonb_build_object('images',(select jsonb_agg(jsonb_build_object('id',gen_random_uuid())) from generate_series(1,13)))$q$, 'invalid_images');
insert into quota_remote_state values ('body-with-reservation',jsonb_build_object('images',jsonb_build_array(jsonb_build_object(
  'id',(select value->>'id' from quota_remote_state where key='image-1')))));
select pg_temp.remote_expect_error($q$select public.alquimia_save_journal((select value from quota_remote_state where key='body-with-reservation'),1)$q$, 'image_not_available');
select pg_temp.remote_expect_error($q$update public.alquimia_journals set body=(select value from quota_remote_state where key='body-with-reservation')$q$, 'image_not_available');

-- B cannot see A's records or transition A's reservations.
select set_config('request.jwt.claim.sub', 'dc8f9c51-a8cb-45e6-b806-32156608fa12', true);
select set_config('request.jwt.claims', '{"sub":"dc8f9c51-a8cb-45e6-b806-32156608fa12","role":"authenticated"}', true);
select pg_temp.remote_assert((select count(*)=0 from public.alquimia_images), 'cross-account metadata hidden');
select pg_temp.remote_assert((select count(*)=0 from public.alquimia_journals), 'cross-account journal hidden');
select pg_temp.remote_assert(not alquimia_private.can_upload_image((select value->>'object_key' from quota_remote_state where key='image-1')), 'foreign key fails upload predicate');
select pg_temp.remote_assert(public.alquimia_begin_image_delete((select (value->>'id')::uuid from quota_remote_state where key='image-1')) is null, 'cross-account begin delete reveals nothing');
select pg_temp.remote_assert(public.alquimia_finish_image_delete((select (value->>'id')::uuid from quota_remote_state where key='image-1')), 'cross-account finish delete is a no-op');
select pg_temp.remote_expect_error($q$select public.alquimia_complete_image((select (value->>'id')::uuid from quota_remote_state where key='image-1'))$q$, 'image_not_available');
select pg_temp.remote_expect_error($q$select public.alquimia_save_journal((select value from quota_remote_state where key='body-with-reservation'),0)$q$, 'image_not_available');
select pg_temp.remote_expect_error($q$insert into public.alquimia_journals(owner,body) values('dc8f9c51-a8cb-45e6-b806-32156608fa11','{"images":[]}'::jsonb)$q$, 'invalid_journal_owner');
with changed as (update public.alquimia_journals set version=99
  where owner='dc8f9c51-a8cb-45e6-b806-32156608fa11' returning *)
select pg_temp.remote_assert((select count(*)=0 from changed), 'cross-account journal update changes nothing');
select pg_temp.remote_assert(public.alquimia_reserve_image('image/png') is not null, 'quota is per account');

select set_config('request.jwt.claim.sub', 'dc8f9c51-a8cb-45e6-b806-32156608fa11', true);
select set_config('request.jwt.claims', '{"sub":"dc8f9c51-a8cb-45e6-b806-32156608fa11","role":"authenticated"}', true);
select pg_temp.remote_assert((select count(*)=12 and bool_and(state='reserved') from public.alquimia_images), 'foreign transitions changed nothing');
select pg_temp.remote_assert((select version=1 from public.alquimia_journals), 'foreign update preserved journal version');
select pg_temp.remote_assert(public.alquimia_save_journal('{"images":[],"text":"second"}'::jsonb,1)=2, 'correct journal version updates');
select pg_temp.remote_assert(public.alquimia_begin_image_delete((select (value->>'id')::uuid from quota_remote_state where key='image-1'))
  = (select value->>'object_key' from quota_remote_state where key='image-1'), 'begin unused reservation deletion');
select pg_temp.remote_assert((select state='deleting' from public.alquimia_images
  where id=(select (value->>'id')::uuid from quota_remote_state where key='image-1')), 'deleting state persisted');
select pg_temp.remote_assert(not alquimia_private.can_upload_image((select value->>'object_key' from quota_remote_state where key='image-1')), 'deleting reservation rejects late upload predicate');
select pg_temp.remote_expect_error($q$select public.alquimia_complete_image((select (value->>'id')::uuid from quota_remote_state where key='image-1'))$q$, 'image_not_available');
select pg_temp.remote_expect_error($q$select public.alquimia_save_journal((select value from quota_remote_state where key='body-with-reservation'),2)$q$, 'image_not_available');
select pg_temp.remote_expect_error($q$select public.alquimia_reserve_image('image/png')$q$, 'image_quota_exceeded');
select pg_temp.remote_assert(public.alquimia_begin_image_delete((select (value->>'id')::uuid from quota_remote_state where key='image-1')) is not null, 'begin delete is retryable');
select pg_temp.remote_assert(public.alquimia_finish_image_delete((select (value->>'id')::uuid from quota_remote_state where key='image-1')), 'finish empty reservation cleanup');
select pg_temp.remote_assert(public.alquimia_finish_image_delete((select (value->>'id')::uuid from quota_remote_state where key='image-1')), 'finish delete is idempotent');
select pg_temp.remote_assert(public.alquimia_begin_image_delete((select (value->>'id')::uuid from quota_remote_state where key='image-1')) is null, 'missing reservation delete is idempotent');
select pg_temp.remote_assert((select count(*)=11 from public.alquimia_images), 'cleanup releases exactly one slot');
select pg_temp.remote_assert(public.alquimia_reserve_image('image/webp') is not null, 'released capacity can be reused');
select pg_temp.remote_expect_error($q$select public.alquimia_reserve_image('image/png')$q$, 'image_quota_exceeded');

-- Definer entry points also require a JWT subject, regardless of SQL role.
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select pg_temp.remote_expect_error($q$select public.alquimia_reserve_image('image/png')$q$, 'authentication_required');
reset role;
select 'free_launch_remote: all assertions passed; no Storage writes; rolling back fixtures' as result;
rollback;
