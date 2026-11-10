begin;
create table if not exists teamup_private.profile_sessions (
  user_id uuid not null, profile_id uuid not null references public.messages(id) on delete cascade,
  primary key(user_id, profile_id)
);
create table if not exists teamup_private.invitations (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references public.messages(id) on delete cascade,
  recipient uuid not null references public.messages(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(sender<>recipient)
);
create unique index if not exists teamup_invite_pending_pair on teamup_private.invitations(least(sender,recipient),greatest(sender,recipient)) where status='pending';
alter table teamup_private.profile_sessions enable row level security;
alter table teamup_private.invitations enable row level security;
revoke all on teamup_private.profile_sessions,teamup_private.invitations from public,anon,authenticated;
create or replace function public.teamup_claim_identity(p_id uuid,p_token text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null then raise exception 'Sign-in required' using errcode='42501'; end if;
 if not coalesce(public.teamup_verify_profile(p_id,p_token),false) then raise exception 'Invalid private link' using errcode='42501'; end if;
 insert into teamup_private.profile_sessions(user_id,profile_id) values((select auth.uid()),p_id) on conflict do nothing;
 return true;
end $$;
create or replace function public.teamup_invitable_profiles() returns table(profile_id uuid)
language sql stable security definer set search_path='' as $$
 select o.message_id from teamup_private.profile_owners o where (select auth.uid()) is not null
$$;
create or replace function public.teamup_send_invitation(p_from uuid,p_to uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if (select auth.uid()) is null or not exists(select 1 from teamup_private.profile_sessions s where s.user_id=(select auth.uid()) and s.profile_id=p_from) then raise exception 'Not the sender' using errcode='42501'; end if;
 if p_from=p_to or not exists(select 1 from teamup_private.profile_owners o where o.message_id=p_to) then raise exception 'Recipient unavailable' using errcode='22023'; end if;
 insert into teamup_private.invitations(sender,recipient) values(p_from,p_to) returning id into result;
 return result;
exception when unique_violation then raise exception 'An invitation is already pending' using errcode='23505';
end $$;
create or replace function public.teamup_my_invitations(p_profile uuid)
returns table(id uuid,sender uuid,recipient uuid,status text,created_at timestamptz,updated_at timestamptz)
language plpgsql stable security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or not exists(select 1 from teamup_private.profile_sessions s where s.user_id=(select auth.uid()) and s.profile_id=p_profile) then raise exception 'Not the profile owner' using errcode='42501'; end if;
 return query select i.id,i.sender,i.recipient,i.status,i.created_at,i.updated_at from teamup_private.invitations i where i.sender=p_profile or i.recipient=p_profile order by i.created_at desc limit 200;
end $$;
create or replace function public.teamup_respond_invitation(p_profile uuid,p_invitation uuid,p_response text) returns text
language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or not exists(select 1 from teamup_private.profile_sessions s where s.user_id=(select auth.uid()) and s.profile_id=p_profile) then raise exception 'Not the profile owner' using errcode='42501'; end if;
 if p_response not in ('accepted','declined') then raise exception 'Invalid response' using errcode='22023'; end if;
 update teamup_private.invitations i set status=p_response,updated_at=pg_catalog.now() where i.id=p_invitation and i.recipient=p_profile and i.status='pending';
 if not found then raise exception 'Invitation unavailable or already answered' using errcode='42501'; end if;
 return p_response;
end $$;
revoke all on function public.teamup_claim_identity(uuid,text),public.teamup_invitable_profiles(),public.teamup_send_invitation(uuid,uuid),public.teamup_my_invitations(uuid),public.teamup_respond_invitation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.teamup_claim_identity(uuid,text),public.teamup_invitable_profiles(),public.teamup_send_invitation(uuid,uuid),public.teamup_my_invitations(uuid),public.teamup_respond_invitation(uuid,uuid,text) to authenticated;
commit;
