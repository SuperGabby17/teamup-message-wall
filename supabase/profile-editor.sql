-- Adds a private ownership map without changing public read/insert policies.
-- Existing messages remain untouched; only profiles created through this API
-- receive an edit capability. Run as a migration owner, not an API role.
begin;
create schema if not exists teamup_private;
revoke all on schema teamup_private from public, anon, authenticated;
create table if not exists teamup_private.profile_owners (
 message_id uuid primary key references public.messages(id) on delete cascade,
 token_hash text not null
);
alter table teamup_private.profile_owners enable row level security;
revoke all on table teamup_private.profile_owners from public, anon, authenticated;

create or replace function public.teamup_create_profile(p_id uuid, p_token text, p_name text, p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare token_digest text; inserted_id uuid;
begin
 if p_id is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_name is null or p_message is null
    or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 40
    or pg_catalog.char_length(pg_catalog.btrim(p_message)) not between 1 and 500 then
  raise exception 'Invalid profile' using errcode='22023';
 end if;
 token_digest := pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')),'hex');
 insert into public.messages(id,name,message) values(p_id,pg_catalog.btrim(p_name),p_message)
 on conflict (id) do nothing returning id into inserted_id;
 if inserted_id is not null then
  insert into teamup_private.profile_owners(message_id,token_hash) values(p_id,token_digest);
 elsif not exists(select 1 from teamup_private.profile_owners o join public.messages m on m.id=o.message_id
   where o.message_id=p_id and o.token_hash=token_digest and m.name=pg_catalog.btrim(p_name) and m.message=p_message) then
  raise exception 'Unable to save profile' using errcode='42501';
 end if;
 return p_id;
end $$;

create or replace function public.teamup_update_profile(p_id uuid, p_token text, p_name text, p_message text)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
 if p_id is null or p_token is null or p_token !~ '^[0-9a-f]{64}$' or p_name is null or p_message is null
    or pg_catalog.char_length(pg_catalog.btrim(p_name)) not between 1 and 40
    or pg_catalog.char_length(pg_catalog.btrim(p_message)) not between 1 and 500 then
  raise exception 'Invalid profile' using errcode='22023';
 end if;
 update public.messages m set name=pg_catalog.btrim(p_name),message=p_message
 where m.id=p_id and exists(select 1 from teamup_private.profile_owners o where o.message_id=p_id
  and o.token_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')),'hex'));
 if not found then raise exception 'Invalid edit link' using errcode='42501'; end if;
 return p_id;
end $$;
create or replace function public.teamup_verify_profile(p_id uuid, p_token text)
returns boolean language sql stable security definer set search_path = '' as $$
 select p_id is not null and p_token ~ '^[0-9a-f]{64}$' and exists(
  select 1 from teamup_private.profile_owners o where o.message_id=p_id
  and o.token_hash=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_token,'UTF8')),'hex')
 );
$$;
revoke all on function public.teamup_create_profile(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.teamup_update_profile(uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.teamup_verify_profile(uuid,text) from public, anon, authenticated;
grant execute on function public.teamup_create_profile(uuid,text,text,text) to anon, authenticated;
grant execute on function public.teamup_update_profile(uuid,text,text,text) to anon, authenticated;
grant execute on function public.teamup_verify_profile(uuid,text) to anon, authenticated;
commit;
