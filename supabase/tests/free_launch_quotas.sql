-- LOCAL ONLY: disposable PostgreSQL with simulated Auth/Storage schemas.
-- Do not run this script against hosted Supabase or its managed Storage tables:
-- the Storage service correctly protects direct deletes. Do not bypass that
-- protection. Use free_launch_remote.sql for hosted database assertions.
-- Run after both migrations, as postgres, on ONE connection. ROLLBACK removes
-- all fixtures. These simulated objects are not real uploaded files; Storage
-- upload, deletion and the 1 MiB limit still need an authenticated HTTP test.
-- psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/free_launch_quotas.sql
begin;

create temporary table quota_test_state (key text primary key, value jsonb);
grant select, insert, update, delete on quota_test_state to authenticated;
create function pg_temp.assert_true(condition boolean, description text)
returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'ASSERTION FAILED: %', description; end if;
end;
$$;
create function pg_temp.expect_error(statement text, expected text)
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
 ('dc8f9c51-a8cb-45e6-b806-32156608fa01', 'quota-a@example.invalid', 'authenticated', 'authenticated'),
 ('dc8f9c51-a8cb-45e6-b806-32156608fa02', 'quota-b@example.invalid', 'authenticated', 'authenticated');

select pg_temp.assert_true((select not public and file_size_limit = 1048576
  and allowed_mime_types = array['image/jpeg','image/png','image/webp']
  from storage.buckets where id = 'alquimia-vision'), 'private bucket capped at one MiB');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'public.alquimia_images', 'INSERT')
  and not has_table_privilege('authenticated', 'public.alquimia_images', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.alquimia_images', 'DELETE'), 'metadata has no direct writes');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.alquimia_reserve_image(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'alquimia_private.reserve_image(text)', 'EXECUTE'), 'anonymous has no reserve RPC');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'dc8f9c51-a8cb-45e6-b806-32156608fa01', true);
select set_config('request.jwt.claims', '{"sub":"dc8f9c51-a8cb-45e6-b806-32156608fa01","role":"authenticated"}', true);
insert into quota_test_state (key, value)
  select 'image-' || n, public.alquimia_reserve_image('image/png') from generate_series(1,12) n;
select pg_temp.assert_true((select count(*) = 12 from public.alquimia_images), 'twelve reservations fit');
select pg_temp.expect_error($q$select public.alquimia_reserve_image('image/png')$q$, 'image_quota_exceeded');
select pg_temp.expect_error($q$select public.alquimia_reserve_image('text/html')$q$, 'invalid_image_type');
select pg_temp.expect_error($q$delete from public.alquimia_images$q$, 'permission denied');
select pg_temp.expect_error($q$update public.alquimia_images set state = 'ready'$q$, 'permission denied');
select pg_temp.expect_error($q$insert into public.alquimia_images (id,owner,object_key,mime) values
  (gen_random_uuid(),auth.uid(),'arbitrary','image/png')$q$, 'permission denied');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id,name) values
  ('alquimia-vision',auth.uid()::text || '/' || gen_random_uuid()::text)$q$, 'row-level security');
select pg_temp.expect_error($q$select public.alquimia_complete_image((select (value->>'id')::uuid from quota_test_state where key='image-1'))$q$, 'image_upload_incomplete');

-- SQL simulates the Storage service's metadata INSERT, exercising real RLS.
insert into storage.objects (bucket_id,name,metadata)
  select 'alquimia-vision', value->>'object_key', '{"size":24,"mimetype":"image/png"}'::jsonb
  from quota_test_state where key='image-1';
select pg_temp.assert_true(public.alquimia_complete_image((select (value->>'id')::uuid from quota_test_state where key='image-1')), 'complete uploaded image');
insert into quota_test_state values ('body', jsonb_build_object('images',jsonb_build_array(jsonb_build_object(
  'id',(select value->>'id' from quota_test_state where key='image-1')))));
select pg_temp.assert_true(public.alquimia_save_journal((select value from quota_test_state where key='body'),0)=1, 'first save succeeds with trigger');
select pg_temp.assert_true(public.alquimia_save_journal((select value from quota_test_state where key='body'),0) is null, 'duplicate initial save conflicts');
select pg_temp.assert_true(public.alquimia_save_journal((select value from quota_test_state where key='body'),99) is null, 'stale version conflicts');
select pg_temp.expect_error($q$select public.alquimia_begin_image_delete((select (value->>'id')::uuid from quota_test_state where key='image-1'))$q$, 'image_in_use');
delete from storage.objects where bucket_id='alquimia-vision';
select pg_temp.assert_true((select count(*)=1 from storage.objects where bucket_id='alquimia-vision'), 'direct Storage DELETE cannot remove ready image');
update storage.objects set metadata='{}' where bucket_id='alquimia-vision';
select pg_temp.assert_true((select metadata->>'size'='24' from storage.objects where bucket_id='alquimia-vision'), 'Storage UPDATE is forbidden');
select pg_temp.expect_error($q$select public.alquimia_save_journal(jsonb_build_object('images','[]'::jsonb,'text',repeat('é',307200)),1)$q$, 'journal_too_large');
select pg_temp.expect_error($q$update public.alquimia_journals set body=jsonb_build_object('images','[]'::jsonb,'text',repeat('é',307200))$q$, 'journal_too_large');
select pg_temp.expect_error($q$update public.alquimia_journals set body='{}'::jsonb$q$, 'invalid_images');
select pg_temp.expect_error($q$update public.alquimia_journals set body='{"images":null}'::jsonb$q$, 'invalid_images');
select pg_temp.expect_error($q$update public.alquimia_journals set body=jsonb_build_object('images',jsonb_build_array(jsonb_build_object(
  'id',(select value->>'id' from quota_test_state where key='image-2'))))$q$, 'image_not_available');

-- A second account cannot see, finalize, upload into, or delete A's images.
select set_config('request.jwt.claim.sub', 'dc8f9c51-a8cb-45e6-b806-32156608fa02', true);
select set_config('request.jwt.claims', '{"sub":"dc8f9c51-a8cb-45e6-b806-32156608fa02","role":"authenticated"}', true);
select pg_temp.assert_true((select count(*)=0 from public.alquimia_images), 'cross-account metadata hidden');
select pg_temp.assert_true((select count(*)=0 from public.alquimia_journals), 'cross-account journal hidden');
select pg_temp.assert_true((select count(*)=0 from storage.objects where bucket_id='alquimia-vision'), 'cross-account Storage hidden');
select pg_temp.assert_true(public.alquimia_begin_image_delete((select (value->>'id')::uuid from quota_test_state where key='image-1')) is null, 'cross-account delete reveals nothing');
select pg_temp.expect_error($q$select public.alquimia_complete_image((select (value->>'id')::uuid from quota_test_state where key='image-1'))$q$, 'image_not_available');
select pg_temp.expect_error($q$insert into storage.objects (bucket_id,name) select 'alquimia-vision',value->>'object_key' from quota_test_state where key='image-2'$q$, 'row-level security');
select pg_temp.expect_error($q$select public.alquimia_save_journal((select value from quota_test_state where key='body'),0)$q$, 'image_not_available');
select pg_temp.assert_true(public.alquimia_reserve_image('image/png') is not null, 'quota is per account');

select set_config('request.jwt.claim.sub', 'dc8f9c51-a8cb-45e6-b806-32156608fa01', true);
select set_config('request.jwt.claims', '{"sub":"dc8f9c51-a8cb-45e6-b806-32156608fa01","role":"authenticated"}', true);
select pg_temp.assert_true(public.alquimia_save_journal('{"images":[]}'::jsonb,1)=2, 'detach image with correct version');
select pg_temp.assert_true(public.alquimia_begin_image_delete((select (value->>'id')::uuid from quota_test_state where key='image-1')) is not null, 'begin unused deletion');
select pg_temp.expect_error($q$select public.alquimia_finish_image_delete((select (value->>'id')::uuid from quota_test_state where key='image-1'))$q$, 'image_delete_incomplete');
select pg_temp.expect_error($q$select public.alquimia_save_journal((select value from quota_test_state where key='body'),2)$q$, 'image_not_available');
select pg_temp.expect_error($q$update public.alquimia_journals set body=(select value from quota_test_state where key='body')$q$, 'image_not_available');
delete from storage.objects where bucket_id='alquimia-vision';
select pg_temp.assert_true((select count(*)=0 from storage.objects where bucket_id='alquimia-vision'), 'deleting Storage object can be removed');
select pg_temp.assert_true(public.alquimia_finish_image_delete((select (value->>'id')::uuid from quota_test_state where key='image-1')), 'finish deletion releases reservation');
select pg_temp.assert_true(public.alquimia_finish_image_delete((select (value->>'id')::uuid from quota_test_state where key='image-1')), 'finish deletion retry is idempotent');
select pg_temp.assert_true(public.alquimia_begin_image_delete((select (value->>'id')::uuid from quota_test_state where key='image-1')) is null, 'begin deletion retry is idempotent');

-- Failed upload reservations are also deletable; late Storage writes fail.
select public.alquimia_begin_image_delete((select (value->>'id')::uuid from quota_test_state where key='image-2'));
select pg_temp.expect_error($q$insert into storage.objects (bucket_id,name) select 'alquimia-vision',value->>'object_key' from quota_test_state where key='image-2'$q$, 'row-level security');
select pg_temp.assert_true(public.alquimia_finish_image_delete((select (value->>'id')::uuid from quota_test_state where key='image-2')), 'failed upload reservation cleanup');
select pg_temp.assert_true(public.alquimia_reserve_image('image/webp') is not null, 'capacity is available after cleanup');
select pg_temp.assert_true((select count(*)=11 from public.alquimia_images), 'quota accounting after cleanup');
reset role;
select 'free_launch_quotas: all assertions passed; rolling back fixtures' as result;
rollback;
