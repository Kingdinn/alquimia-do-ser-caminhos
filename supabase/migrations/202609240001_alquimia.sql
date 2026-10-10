create table public.alquimia_journals (
 owner uuid primary key references auth.users(id) on delete cascade,
 body jsonb not null check (jsonb_typeof(body) = 'object'),
 version integer not null default 1 check (version > 0)
);
create table public.alquimia_images (
 id uuid primary key,
 owner uuid not null references auth.users(id) on delete cascade,
 object_key text not null unique,
 mime text not null check (mime in ('image/jpeg','image/png','image/webp')),
 check (object_key = owner::text || '/' || id::text)
);
create index alquimia_images_owner_idx on public.alquimia_images(owner);
alter table public.alquimia_journals enable row level security;
alter table public.alquimia_images enable row level security;
create policy own_journal on public.alquimia_journals for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
create policy own_images on public.alquimia_images for all to authenticated using ((select auth.uid()) = owner) with check ((select auth.uid()) = owner);
revoke all on public.alquimia_journals, public.alquimia_images from anon;
grant select,insert,update,delete on public.alquimia_journals, public.alquimia_images to authenticated;
create function public.alquimia_save_journal(payload jsonb, expected_version integer)
returns integer language plpgsql security invoker set search_path = '' as $$
declare result integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if expected_version < 0 or octet_length(payload::text) > 1500000 then raise exception 'Invalid payload'; end if;
 if exists (select 1 from jsonb_array_elements(payload->'images') image where not exists (select 1 from public.alquimia_images i where i.id::text=image->>'id' and i.owner=auth.uid())) then raise exception 'Invalid image'; end if;
 if expected_version=0 then
 insert into public.alquimia_journals(owner,body,version) values(auth.uid(),payload,1) on conflict(owner) do nothing returning version into result;
 else
 update public.alquimia_journals set body=payload,version=version+1 where owner=auth.uid() and version=expected_version returning version into result;
 end if;
 return result;
end;
$$;
revoke all on function public.alquimia_save_journal(jsonb,integer) from public,anon;
grant execute on function public.alquimia_save_journal(jsonb,integer) to authenticated;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types) values ('alquimia-vision','alquimia-vision',false,4194304,array['image/jpeg','image/png','image/webp']);
create policy alquimia_private_images on storage.objects for all to authenticated using (bucket_id='alquimia-vision' and (storage.foldername(name))[1]=(select auth.uid())::text) with check (bucket_id='alquimia-vision' and (storage.foldername(name))[1]=(select auth.uid())::text);
