begin;
create table if not exists public.teamup_member_status (
 profile_id uuid primary key references public.messages(id) on delete cascade,
 status text not null check (status='joined')
);
alter table public.teamup_member_status enable row level security;
revoke all on public.teamup_member_status from public,anon,authenticated;
grant select on public.teamup_member_status to anon,authenticated;
create policy teamup_member_status_public_read on public.teamup_member_status for select to anon,authenticated using (true);
insert into public.teamup_member_status(profile_id,status)
 select sender,'joined' from teamup_private.invitations where status='accepted'
 union select recipient,'joined' from teamup_private.invitations where status='accepted'
 on conflict(profile_id) do nothing;
create or replace function public.teamup_send_invitation(p_from uuid,p_to uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if (select auth.uid()) is null or not exists(select 1 from teamup_private.profile_sessions s where s.user_id=(select auth.uid()) and s.profile_id=p_from) then raise exception 'Not the sender' using errcode='42501'; end if;
 if p_from=p_to or not exists(select 1 from teamup_private.profile_owners o where o.message_id=p_to) then raise exception 'Recipient unavailable' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(p_from,p_to)::text||':'||greatest(p_from,p_to)::text,0));
 if exists(select 1 from teamup_private.invitations i where i.status='accepted' and least(i.sender,i.recipient)=least(p_from,p_to) and greatest(i.sender,i.recipient)=greatest(p_from,p_to)) then raise exception 'Already teammates' using errcode='23505'; end if;
 insert into teamup_private.invitations(sender,recipient) values(p_from,p_to) returning id into result;
 return result;
exception when unique_violation then raise exception 'An invitation is already pending' using errcode='23505';
end $$;
create or replace function public.teamup_respond_invitation(p_profile uuid,p_invitation uuid,p_response text) returns text
language plpgsql security definer set search_path='' as $$
declare other_id uuid;
begin
 if (select auth.uid()) is null or not exists(select 1 from teamup_private.profile_sessions s where s.user_id=(select auth.uid()) and s.profile_id=p_profile) then raise exception 'Not the profile owner' using errcode='42501'; end if;
 if p_response not in ('accepted','declined') then raise exception 'Invalid response' using errcode='22023'; end if;
 select i.sender into other_id from teamup_private.invitations i where i.id=p_invitation and i.recipient=p_profile and i.status='pending';
 if other_id is null then raise exception 'Invitation unavailable or already answered' using errcode='42501'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(least(p_profile,other_id)::text||':'||greatest(p_profile,other_id)::text,0));
 if p_response='accepted' and exists(select 1 from teamup_private.invitations i where i.status='accepted' and least(i.sender,i.recipient)=least(p_profile,other_id) and greatest(i.sender,i.recipient)=greatest(p_profile,other_id)) then raise exception 'Already teammates' using errcode='23505'; end if;
 update teamup_private.invitations i set status=p_response,updated_at=pg_catalog.now() where i.id=p_invitation and i.recipient=p_profile and i.status='pending';
 if not found then raise exception 'Invitation unavailable or already answered' using errcode='42501'; end if;
 if p_response='accepted' then insert into public.teamup_member_status(profile_id,status) values(p_profile,'joined'),(other_id,'joined') on conflict(profile_id) do nothing; end if;
 return p_response;
end $$;
commit;
