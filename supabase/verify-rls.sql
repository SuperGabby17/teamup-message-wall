-- 在 schema.sql 成功后单独运行。所有测试数据最后回滚，不会保存。
begin;
set local role anon;
insert into public.messages (id,name,message)
values ('f0000000-0000-4000-8000-000000000001','权限测试','此记录将在测试结束后回滚');
do $$ begin
  if not exists (select 1 from public.messages where id='f0000000-0000-4000-8000-000000000001') then
    raise exception 'FAIL: anonymous SELECT is blocked';
  end if;
  begin
    update public.messages set message='不应成功' where id='f0000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: anonymous UPDATE succeeded';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.messages where id='f0000000-0000-4000-8000-000000000001';
    raise exception 'FAIL: anonymous DELETE succeeded';
  exception when insufficient_privilege then null; end;
  begin
    truncate public.messages;
    raise exception 'FAIL: anonymous TRUNCATE succeeded';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.messages(name,message) values ('   ','无效姓名');
    raise exception 'FAIL: blank name accepted';
  exception when check_violation or insufficient_privilege then null; end;
  raise notice 'PASS: anon may insert/read and may not update/delete/truncate';
end $$;
reset role;
rollback;
