begin;
lock table teamup_private.invitations in share row exclusive mode;
create table public.teamup_teams(id uuid primary key default gen_random_uuid(), name text not null check(char_length(btrim(name)) between 1 and 40), creator uuid not null references public.messages(id), created_at timestamptz not null default now());
create table public.teamup_team_members(team_id uuid not null references public.teamup_teams(id) on delete cascade,profile_id uuid primary key references public.messages(id) on delete cascade,joined_at timestamptz not null default now());
create index teamup_team_members_team_id_idx on public.teamup_team_members(team_id);
alter table public.teamup_teams enable row level security;
alter table public.teamup_team_members enable row level security;
revoke all on public.teamup_teams,public.teamup_team_members from public,anon,authenticated;
grant select on public.teamup_teams,public.teamup_team_members to anon,authenticated;
create policy teamup_teams_read on public.teamup_teams for select to anon,authenticated using(true);
create policy teamup_team_members_read on public.teamup_team_members for select to anon,authenticated using(true);
-- Preserve each accepted history edge; refuse ambiguous or oversized histories.
do $$ declare i record; a uuid; b uuid; t uuid; cnt int; nm text; begin
 for i in select sender,recipient from teamup_private.invitations where status='accepted' order by created_at,id loop
  select team_id into a from public.teamup_team_members where profile_id=i.sender;
  select team_id into b from public.teamup_team_members where profile_id=i.recipient;
  if a is not null and b is not null and a<>b then raise exception 'Existing accepted history requires merging teams'; end if;
  t:=coalesce(a,b);
  if t is null then select left(name,32)||' 的队伍' into nm from public.messages where id=i.sender; insert into public.teamup_teams(name,creator) values(nm,i.sender) returning id into t; end if;
  select count(*) into cnt from public.teamup_team_members where team_id=t;
  if cnt+(case when a is null then 1 else 0 end)+(case when b is null then 1 else 0 end)>4 then raise exception 'Existing accepted history exceeds four members'; end if;
  if a is null then insert into public.teamup_team_members(team_id,profile_id) values(t,i.sender); end if;
  if b is null then insert into public.teamup_team_members(team_id,profile_id) values(t,i.recipient); end if;
 end loop;
end $$;
create or replace function public.teamup_send_invitation(p_from uuid,p_to uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; a uuid; b uuid; target_team uuid;
begin
 if (select auth.uid()) is null or not exists(select 1 from teamup_private.profile_sessions s where s.user_id=(select auth.uid()) and s.profile_id=p_from) then raise exception 'Not the sender' using errcode='42501'; end if;
 if p_from=p_to or not exists(select 1 from teamup_private.profile_owners o where o.message_id=p_to) then raise exception 'Recipient unavailable' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(2200112026);
 select team_id into a from public.teamup_team_members where profile_id=p_from; select team_id into b from public.teamup_team_members where profile_id=p_to;
 if a is not null and b is not null then if a=b then raise exception 'Already teammates' using errcode='23505'; else raise exception 'Different teams cannot merge' using errcode='22023'; end if; end if;
 target_team:=coalesce(a,b); if target_team is not null and (select count(*) from public.teamup_team_members where team_id=target_team)>=4 then raise exception 'Team is full' using errcode='22023'; end if;
 if exists(select 1 from teamup_private.invitations i where i.status='accepted' and least(i.sender,i.recipient)=least(p_from,p_to) and greatest(i.sender,i.recipient)=greatest(p_from,p_to)) then raise exception 'Already teammates' using errcode='23505'; end if;
 insert into teamup_private.invitations(sender,recipient) values(p_from,p_to) returning id into result; return result;
exception when unique_violation then raise exception 'An invitation is already pending' using errcode='23505'; end $$;
create or replace function public.teamup_respond_invitation(p_profile uuid,p_invitation uuid,p_response text) returns text language plpgsql security definer set search_path='' as $$
declare other_id uuid; a uuid; b uuid; t uuid; nm text;
begin
 if (select auth.uid()) is null or not exists(select 1 from teamup_private.profile_sessions s where s.user_id=(select auth.uid()) and s.profile_id=p_profile) then raise exception 'Not the profile owner' using errcode='42501'; end if;
 if p_response not in ('accepted','declined') then raise exception 'Invalid response' using errcode='22023'; end if;
 perform pg_catalog.pg_advisory_xact_lock(2200112026);
 select i.sender into other_id from teamup_private.invitations i where i.id=p_invitation and i.recipient=p_profile and i.status='pending'; if other_id is null then raise exception 'Invitation unavailable or already answered' using errcode='42501'; end if;
 if p_response='accepted' then
  select team_id into a from public.teamup_team_members where profile_id=other_id; select team_id into b from public.teamup_team_members where profile_id=p_profile;
  if a is not null and b is not null then if a=b then raise exception 'Already teammates' using errcode='23505'; else raise exception 'Different teams cannot merge' using errcode='22023'; end if; end if;
  t:=coalesce(a,b); if t is null then select left(name,32)||' 的队伍' into nm from public.messages where id=other_id; insert into public.teamup_teams(name,creator) values(nm,other_id) returning id into t; end if;
  if (select count(*) from public.teamup_team_members where team_id=t)+(case when a is null then 1 else 0 end)+(case when b is null then 1 else 0 end)>4 then raise exception 'Team is full' using errcode='22023'; end if;
  if a is null then insert into public.teamup_team_members(team_id,profile_id) values(t,other_id); end if; if b is null then insert into public.teamup_team_members(team_id,profile_id) values(t,p_profile); end if;
  insert into public.teamup_member_status(profile_id,status) values(p_profile,'joined'),(other_id,'joined') on conflict(profile_id) do nothing;
 end if;
 update teamup_private.invitations set status=p_response,updated_at=pg_catalog.now() where id=p_invitation and recipient=p_profile and status='pending'; if not found then raise exception 'Invitation unavailable or already answered' using errcode='42501'; end if; return p_response;
end $$;
create function public.teamup_rename_team(p_profile uuid,p_team uuid,p_name text) returns text language plpgsql security definer set search_path='' as $$
begin
 if (select auth.uid()) is null or not exists(select 1 from teamup_private.profile_sessions s where s.user_id=(select auth.uid()) and s.profile_id=p_profile) then raise exception 'Not the profile owner' using errcode='42501'; end if;
 if p_name is null or char_length(btrim(p_name)) not between 1 and 40 then raise exception 'Invalid team name' using errcode='22023'; end if;
 update public.teamup_teams set name=btrim(p_name) where id=p_team and creator=p_profile; if not found then raise exception 'Only team creator may rename' using errcode='42501'; end if; return btrim(p_name);
end $$;
revoke all on function public.teamup_rename_team(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.teamup_rename_team(uuid,uuid,text) to authenticated;
commit;
