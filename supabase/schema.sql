-- 在新 Supabase 项目的 SQL Editor 中执行。若已有 messages 表，请先检查，勿直接删除。
-- 事务内创建：已有同名表时安全报错，不修改原表。
begin;
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  message text not null check (char_length(btrim(message)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index messages_created_id_idx on public.messages (created_at, id);
alter table public.messages enable row level security;
alter table public.messages force row level security;

-- 清除 Supabase 默认表权限，仅开放读取和指定列的插入。
revoke all on table public.messages from public, anon, authenticated;
grant usage on schema public to anon, authenticated;
grant select on table public.messages to anon, authenticated;
grant insert (id, name, message) on table public.messages to anon, authenticated;

create policy "messages_public_read" on public.messages
for select to anon, authenticated using (true);
create policy "messages_public_insert" on public.messages
for insert to anon, authenticated
with check (char_length(btrim(name)) between 1 and 40 and char_length(btrim(message)) between 1 and 500);
-- 故意不创建 UPDATE / DELETE 策略，也不授予 UPDATE / DELETE / TRUNCATE 权限。
-- 管理员 / service_role 仍有管理能力；此限制针对网页访客。

-- 开启 Postgres Changes 所需 publication。
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
commit;
