-- APPROVED SCOPE: new 008 + existing two website-admin account grants only.
-- Run in xiqi-website / qndwtogovmkuexudtnua SQL Editor.
-- Import switch stays false. No 007/005, existing business rows, media or Auth roles are changed.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$declare object_name text;begin
 foreach object_name in array array['ads_csv_accounts','ads_csv_access','ads_csv_rows','ads_csv_imports'] loop
  if to_regclass('public.'||object_name) is not null then raise exception '008_ALREADY_OR_PARTIALLY_INSTALLED_STOP_AND_AUDIT';end if;
 end loop;
 if to_regprocedure('public.ads_csv_commit(uuid,uuid,jsonb,jsonb)') is not null or to_regprocedure('public.ads_csv_lead_counts(uuid,text,date,date)') is not null then raise exception '008_FUNCTION_ALREADY_EXISTS_STOP_AND_AUDIT';end if;
end$$;
create table public.ads_csv_accounts(account_id text primary key check(account_id ~ '^\d{10}$'),timezone text not null);
create table public.ads_csv_access(account_id text references public.ads_csv_accounts on delete cascade,user_id uuid not null,can_import boolean not null default false,primary key(account_id,user_id));
create table public.ads_csv_rows(account_id text not null references public.ads_csv_accounts,report_type text not null check(report_type in ('campaign','ads','keywords','terms','countries','devices','daily')),grain text not null check(grain in ('daily','range')),date_start date not null,date_end date not null,row_key text not null,data jsonb not null,updated_at timestamptz not null,primary key(account_id,report_type,grain,date_start,date_end,row_key),check(date_start<=date_end));
create index ads_csv_rows_range on public.ads_csv_rows(account_id,report_type,date_start,date_end);
create table public.ads_csv_imports(id uuid primary key,account_id text not null references public.ads_csv_accounts,actor uuid not null,report_type text not null,grain text not null,date_start date not null,date_end date not null,scope_mode text not null,fingerprint text,status text not null,inserted integer not null default 0,updated integer not null default 0,error_count integer default 0,error_code text,created_at timestamptz not null default now());
-- Fingerprints index audit history; account row lock supplies serialization.
-- Re-importing an older version must be possible after a revision.
create index ads_csv_success_fingerprint on public.ads_csv_imports(account_id,report_type,fingerprint) where status='success';
create index ads_csv_import_recent on public.ads_csv_imports(account_id,report_type,created_at desc);
do $$declare t text;begin foreach t in array array['ads_csv_accounts','ads_csv_access','ads_csv_rows','ads_csv_imports'] loop execute format('alter table public.%I enable row level security',t);execute format('alter table public.%I force row level security',t);execute format('revoke all on public.%I from public,anon,authenticated',t);execute format('grant select,insert,update on public.%I to service_role',t);end loop;end$$;
create function public.ads_csv_commit(p_actor uuid,p_id uuid,p_meta jsonb,p_rows jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare acct text:=p_meta->>'accountId';typ text:=p_meta->>'type';g text:=p_meta->>'grain';ds date:=(p_meta->>'start')::date;de date:=(p_meta->>'end')::date;md text:=p_meta->>'mode';fp text:=p_meta->>'fingerprint';r jsonb;existing integer:=0;added integer:=0;stamp timestamptz:=clock_timestamp();prior public.ads_csv_imports;allowed text[]:=array['date','campaignId','campaignName','groupId','groupName','entityId','name','status','matchType','approval','headlines','descriptions','urls','targetCountries','country','device','impressions','clicks','interactions','conversions'];
begin
 perform 1 from public.ads_csv_accounts where account_id=acct for update;if not found then raise exception 'ACCOUNT';end if;
 if not exists(select 1 from public.ads_csv_access a join auth.users u on u.id=a.user_id where a.account_id=acct and a.user_id=p_actor and a.can_import and u.raw_app_meta_data->>'role'='admin') then raise exception 'FORBIDDEN';end if;
 if typ not in ('campaign','ads','keywords','terms','countries','devices','daily') or g not in ('daily','range') or md not in ('full','partial') or ds>de or de-ds>366 or (typ='daily' and g!='daily') or fp !~ '^[a-f0-9]{64}$' or jsonb_typeof(p_rows)!='array' or jsonb_array_length(p_rows)<1 or jsonb_array_length(p_rows)>10000 or p_meta->>'timezone' is distinct from (select timezone from public.ads_csv_accounts where account_id=acct) then raise exception 'OPTIONS';end if;
 select * into prior from public.ads_csv_imports where account_id=acct and report_type=typ and fingerprint=fp and status='success' order by created_at desc limit 1;if found and not exists(select 1 from jsonb_array_elements(p_rows) wanted where not exists(select 1 from public.ads_csv_rows current_row where current_row.account_id=acct and current_row.report_type=typ and current_row.grain=g and current_row.date_start=(wanted->>'start')::date and current_row.date_end=(wanted->>'end')::date and current_row.row_key=wanted->>'key' and current_row.data=wanted->'data')) and (md!='full' or (select count(*) from public.ads_csv_rows where account_id=acct and report_type=typ and grain=g and date_start>=ds and date_end<=de)=jsonb_array_length(p_rows)) then insert into public.ads_csv_imports(id,account_id,actor,report_type,grain,date_start,date_end,scope_mode,fingerprint,status,inserted,updated,created_at) values(p_id,acct,p_actor,typ,g,ds,de,md,fp,'duplicate',0,0,stamp);return jsonb_build_object('duplicate',true,'id',prior.id,'inserted',0,'updated',0);end if;
 if exists(select 1 from public.ads_csv_rows where account_id=acct and report_type=typ and date_start<=de and date_end>=ds and (grain!=g or (g='range' and (date_start!=ds or date_end!=de)))) then raise exception 'GRAIN_OVERLAP';end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  if (r->>'start')::date<ds or (r->>'end')::date>de or (g='daily' and r->>'start' is distinct from r->>'end') or jsonb_typeof(r->'data')!='object' or exists(select 1 from jsonb_object_keys(r->'data') k where not(k=any(allowed))) then raise exception 'ROW';end if;
  if exists(select 1 from public.ads_csv_rows where account_id=acct and report_type=typ and grain=g and date_start=(r->>'start')::date and date_end=(r->>'end')::date and row_key=r->>'key') then existing:=existing+1;else added:=added+1;end if;
 end loop;
 if md='full' then delete from public.ads_csv_rows where account_id=acct and report_type=typ and grain=g and date_start>=ds and date_end<=de;end if;
 for r in select value from jsonb_array_elements(p_rows) loop
  insert into public.ads_csv_rows(account_id,report_type,grain,date_start,date_end,row_key,data,updated_at) values(acct,typ,g,(r->>'start')::date,(r->>'end')::date,r->>'key',r->'data',stamp) on conflict(account_id,report_type,grain,date_start,date_end,row_key) do update set data=excluded.data,updated_at=excluded.updated_at;
 end loop;
 insert into public.ads_csv_imports(id,account_id,actor,report_type,grain,date_start,date_end,scope_mode,fingerprint,status,inserted,updated,created_at) values(p_id,acct,p_actor,typ,g,ds,de,md,fp,'success',added,existing,stamp);
 return jsonb_build_object('duplicate',false,'id',p_id,'inserted',added,'updated',existing,'time',stamp);
end$$;
revoke all on function public.ads_csv_commit(uuid,uuid,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.ads_csv_commit(uuid,uuid,jsonb,jsonb) to service_role;
create function public.ads_csv_lead_counts(p_actor uuid,p_account text,p_start date,p_end date) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare tz text;v jsonb;
begin
 if not exists(select 1 from public.ads_csv_access where account_id=p_account and user_id=p_actor) then raise exception 'FORBIDDEN';end if;
 select timezone into tz from public.ads_csv_accounts where account_id=p_account;
 if to_regclass('public.ads_lead_review') is null or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='inquiries' and column_name='attribution') then return jsonb_build_object('website',null,'valid',null);end if;
 execute $q$ select jsonb_build_object('website',count(*),'valid',count(*) filter(where r.quality='valid')) from public.inquiries i left join public.ads_lead_review r on r.inquiry_id=i.id::text where i.created_at>=($1::timestamp at time zone $3) and i.created_at<(($2+1)::timestamp at time zone $3) and exists(select 1 from public.ads_csv_rows a where a.account_id=$4 and a.report_type in ('campaign','daily') and a.data->>'campaignId'=i.attribution->'submission'->>'campaign_id') $q$ into v using p_start,p_end,tz,p_account;return v;
end $$;
revoke all on function public.ads_csv_lead_counts(uuid,text,date,date) from public,anon,authenticated;
grant execute on function public.ads_csv_lead_counts(uuid,text,date,date) to service_role;

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

do $$declare checked integer;begin
 select count(*) into checked from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('ads_csv_accounts','ads_csv_access','ads_csv_rows','ads_csv_imports') and c.relrowsecurity and c.relforcerowsecurity and not has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') and not has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE');
 if checked<>4 then raise exception 'POST_INSTALL_TABLE_PERMISSION_CHECK_FAILED';end if;
 if (select count(*) from public.ads_csv_access where account_id='1694910396' and can_import and user_id in ('5eaaed54-1362-4ba4-9c17-4f6218c7a611'::uuid,'ec15b790-adc9-420a-807d-22dcc75e4050'::uuid))<>2 or (select count(*) from public.ads_csv_access)<>2 or not exists(select 1 from public.ads_csv_accounts where account_id='1694910396' and timezone='Asia/Shanghai') then raise exception 'POST_INSTALL_ACCOUNT_CHECK_FAILED';end if;
 if has_function_privilege('anon','public.ads_csv_commit(uuid,uuid,jsonb,jsonb)','EXECUTE') or has_function_privilege('authenticated','public.ads_csv_commit(uuid,uuid,jsonb,jsonb)','EXECUTE') or not has_function_privilege('service_role','public.ads_csv_commit(uuid,uuid,jsonb,jsonb)','EXECUTE') then raise exception 'POST_INSTALL_RPC_PERMISSION_CHECK_FAILED';end if;
end$$;
commit;

-- Return the post-install report AFTER successful commit.
-- POST-INSTALL READ ONLY: run after approved 008 installation and account grants.
select jsonb_build_object(
 'tables',(select jsonb_agg(jsonb_build_object('name',c.relname,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity,'anon_has_access',has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE'),'authenticated_has_access',has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE')) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('ads_csv_accounts','ads_csv_access','ads_csv_rows','ads_csv_imports')),
 'account',(select jsonb_agg(jsonb_build_object('account_id',account_id,'timezone',timezone)) from public.ads_csv_accounts where account_id='1694910396'),
 'access',(select jsonb_agg(jsonb_build_object('user_id',a.user_id,'email',u.email,'can_import',a.can_import,'role_is_admin',u.raw_app_meta_data->>'role'='admin') order by a.user_id) from public.ads_csv_access a join auth.users u on u.id=a.user_id where a.account_id='1694910396'),
 'direct_rpc_access',jsonb_build_object('anon',has_function_privilege('anon','public.ads_csv_commit(uuid,uuid,jsonb,jsonb)','EXECUTE'),'authenticated',has_function_privilege('authenticated','public.ads_csv_commit(uuid,uuid,jsonb,jsonb)','EXECUTE'),'service_role',has_function_privilege('service_role','public.ads_csv_commit(uuid,uuid,jsonb,jsonb)','EXECUTE'))
) as ads_csv_post_install;
