begin;
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
commit;
