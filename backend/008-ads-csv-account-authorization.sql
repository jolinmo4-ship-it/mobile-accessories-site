-- PREPARED ONLY: approve production 008 installation and these exact grants before execution.
-- Uses the two existing, audited website admins. No users or Auth metadata are changed.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
declare actor_id uuid; matches integer; configured_timezone text;
begin
 select count(*) into matches
 from auth.users u
 join (values
  ('5eaaed54-1362-4ba4-9c17-4f6218c7a611'::uuid,'jolinmo4@gmail.com'),
  ('ec15b790-adc9-420a-807d-22dcc75e4050'::uuid,'1442280148@qq.com')
 ) expected(id,email) on u.id=expected.id and lower(u.email)=expected.email
 where u.raw_app_meta_data->>'role'='admin' and u.email_confirmed_at is not null;
 if matches<>2 then raise exception 'AUDITED_WEBSITE_ADMINS_REQUIRED_NO_ROLE_CHANGE';end if;
 insert into public.ads_csv_accounts(account_id,timezone) values('1694910396','Asia/Shanghai') on conflict(account_id) do nothing;
 select timezone into configured_timezone from public.ads_csv_accounts where account_id='1694910396' for update;
 if configured_timezone is distinct from 'Asia/Shanghai' then raise exception 'ACCOUNT_TIMEZONE_MISMATCH_REVIEW_REQUIRED';end if;
 for actor_id in select id from auth.users where id in
  ('5eaaed54-1362-4ba4-9c17-4f6218c7a611'::uuid,'ec15b790-adc9-420a-807d-22dcc75e4050'::uuid)
 loop
  insert into public.ads_csv_access(account_id,user_id,can_import) values('1694910396',actor_id,true)
  on conflict(account_id,user_id) do update set can_import=true;
 end loop;
 -- No customer bindings, no luckamy285@gmail.com grant, no role/password changes.
end $$;
commit;
