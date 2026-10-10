-- Execute as database administrator after the Calendar migration.
-- Entire transaction is rolled back. Selects an existing owner's ID internally,
-- prints no account identifiers/content, and never calls Google.
begin;
do $test$
declare
  account uuid;
  first_lease uuid := gen_random_uuid();
  second_lease uuid := gen_random_uuid();
  result jsonb;
  payload jsonb;
  caught boolean;
begin
  select id into account from auth.users order by created_at limit 1;
  if account is null then raise exception 'calendar_test_requires_existing_account'; end if;
  if has_function_privilege('anon', 'public.alquimia_calendar_state(uuid,text,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.alquimia_calendar_state(uuid,text,jsonb)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.alquimia_calendar_state(uuid,text,jsonb)', 'EXECUTE') then
    raise exception 'calendar_rpc_grants_failed';
  end if;
  if has_table_privilege('authenticated', 'alquimia_private.calendar_connections', 'SELECT')
    or has_table_privilege('service_role', 'alquimia_private.calendar_connections', 'SELECT')
    or has_table_privilege('anon', 'alquimia_private.calendar_oauth_states', 'SELECT') then
    raise exception 'calendar_private_table_grants_failed';
  end if;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='alquimia_private' and c.relname in ('calendar_connections','calendar_oauth_states') and not c.relrowsecurity) then
    raise exception 'calendar_rls_disabled';
  end if;
  -- Temporarily isolate the fixture; ROLLBACK restores any original rows exactly.
  delete from alquimia_private.calendar_connections where owner=account;
  delete from alquimia_private.calendar_oauth_states where owner=account;
  payload := jsonb_build_object('nonce',repeat('a',64),'session',repeat('b',64),
    'credentials','v1.synthetic-test-ciphertext',
    'data',jsonb_build_object('connectionId',gen_random_uuid()::text,'googleSubject','synthetic-google-subject','timeZone','UTC','legacyAnchor','2026-09-30','calendarId',null,'events','{}'::jsonb,'syncedVersion',-1,'lastSyncedAt',null,'errorCode',null));
  perform public.alquimia_calendar_state(account,'oauth_begin',payload);
  result := public.alquimia_calendar_state(account,'oauth_consume',payload);
  if result is distinct from 'true'::jsonb then raise exception 'calendar_oauth_initial_consume_failed'; end if;
  result := public.alquimia_calendar_state(account,'oauth_consume',payload);
  if result is distinct from 'false'::jsonb then raise exception 'calendar_oauth_replay_accepted'; end if;
  result := public.alquimia_calendar_state(account,'connect',payload);
  if result->>'credentials' is distinct from payload->>'credentials' then raise exception 'calendar_connect_failed'; end if;
  caught := false;
  begin perform public.alquimia_calendar_state(account,'connect',payload);
    exception when others then if sqlerrm='invalid_oauth_state' then caught:=true; else raise; end if;
  end;
  if not caught then raise exception 'calendar_connect_replay_accepted'; end if;

  result := public.alquimia_calendar_state(account,'acquire',jsonb_build_object('lease',first_lease));
  if result->>'lease' is distinct from first_lease::text then raise exception 'calendar_first_lease_failed'; end if;
  if public.alquimia_calendar_state(account,'acquire',jsonb_build_object('lease',second_lease)) is not null then raise exception 'calendar_concurrent_lease_accepted'; end if;
  caught := false;
  begin perform public.alquimia_calendar_state(account,'disconnect');
    exception when others then if sqlerrm='calendar_busy' then caught:=true; else raise; end if;
  end;
  if not caught then raise exception 'calendar_disconnect_ignored_active_lease'; end if;
  perform public.alquimia_calendar_state(account,'release',jsonb_build_object('lease',second_lease));
  result := public.alquimia_calendar_state(account,'read');
  if result->>'lease' is distinct from first_lease::text then raise exception 'calendar_wrong_worker_released_lease'; end if;
  caught := false;
  begin perform public.alquimia_calendar_state(account,'checkpoint',payload||jsonb_build_object('lease',second_lease));
    exception when others then if sqlerrm='calendar_lease_lost' then caught:=true; else raise; end if;
  end;
  if not caught then raise exception 'calendar_wrong_worker_checkpoint_accepted'; end if;
  perform public.alquimia_calendar_state(account,'checkpoint',payload||jsonb_build_object('lease',first_lease));
  update alquimia_private.calendar_connections set lease_until=now()-interval '1 second' where owner=account;
  result := public.alquimia_calendar_state(account,'acquire',jsonb_build_object('lease',second_lease));
  if result->>'lease' is distinct from second_lease::text then raise exception 'calendar_expired_lease_not_recoverable'; end if;
  caught := false;
  begin perform public.alquimia_calendar_state(account,'checkpoint',payload||jsonb_build_object('lease',first_lease));
    exception when others then if sqlerrm='calendar_lease_lost' then caught:=true; else raise; end if;
  end;
  if not caught then raise exception 'calendar_stale_checkpoint_accepted'; end if;
  perform public.alquimia_calendar_state(account,'release',jsonb_build_object('lease',second_lease));
  perform public.alquimia_calendar_state(account,'disconnect');
  result := public.alquimia_calendar_state(account,'read');
  if result->>'credentials' is not null then raise exception 'calendar_disconnect_retained_credentials'; end if;

  -- A callback consumed before disconnect must not reconnect afterward.
  perform public.alquimia_calendar_state(account,'oauth_begin',payload);
  perform public.alquimia_calendar_state(account,'oauth_consume',payload);
  perform public.alquimia_calendar_state(account,'disconnect');
  caught := false;
  begin perform public.alquimia_calendar_state(account,'connect',payload);
    exception when others then if sqlerrm='invalid_oauth_state' then caught:=true; else raise; end if;
  end;
  if not caught then raise exception 'calendar_disconnect_oauth_race'; end if;

  perform public.alquimia_calendar_state(account,'oauth_begin',payload);
  update alquimia_private.calendar_oauth_states set expires_at=now()-interval '1 second' where owner=account;
  if public.alquimia_calendar_state(account,'oauth_consume',payload) is distinct from 'false'::jsonb then raise exception 'calendar_expired_oauth_accepted'; end if;
  -- A newer authorization invalidates the previous nonce even after it was consumed.
  perform public.alquimia_calendar_state(account,'oauth_begin',payload);
  perform public.alquimia_calendar_state(account,'oauth_consume',payload);
  perform public.alquimia_calendar_state(account,'oauth_begin',payload||jsonb_build_object('nonce',repeat('c',64)));
  caught := false;
  begin perform public.alquimia_calendar_state(account,'connect',payload);
    exception when others then if sqlerrm='invalid_oauth_state' then caught:=true; else raise; end if;
  end;
  if not caught then raise exception 'calendar_superseded_oauth_accepted'; end if;
end;
$test$;
rollback;
select 'calendar_storage_lifecycle_passed_rolled_back' as result;
