-- REVIEW ONLY. Run only after the combined read-only audit confirms an existing 008.
-- No business rows are inserted, updated or deleted. Existing Auth roles are unchanged.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$declare definition text; index_definition text;begin
 if to_regclass('public.ads_csv_accounts') is null or to_regclass('public.ads_csv_rows') is null or to_regclass('public.ads_csv_imports') is null or to_regprocedure('public.ads_csv_commit(uuid,uuid,jsonb,jsonb)') is null then raise exception '008_NOT_INSTALLED_AUDIT_REQUIRED';end if;
 select pg_get_functiondef('public.ads_csv_commit(uuid,uuid,jsonb,jsonb)'::regprocedure) into definition;
 if position('if found then insert into public.ads_csv_imports' in definition)=0 and position('current_row.data=wanted' in definition)=0 then raise exception 'UNKNOWN_008_FUNCTION_REVIEW_REQUIRED';end if;
 if to_regclass('public.ads_csv_success_fingerprint') is not null then
  select pg_get_indexdef(i.indexrelid) into index_definition from pg_index i where i.indexrelid='public.ads_csv_success_fingerprint'::regclass and i.indrelid='public.ads_csv_imports'::regclass and not i.indisprimary;
  if index_definition is null or position('(account_id, report_type, fingerprint)' in index_definition)=0 or position('success' in index_definition)=0 then raise exception 'UNKNOWN_FINGERPRINT_INDEX_REVIEW_REQUIRED';end if;
 end if;
end$$;
lock table public.ads_csv_accounts in access exclusive mode;
-- The account lock serializes concurrent imports. Audit fingerprints are not unique:
-- an earlier snapshot can legitimately be restored after a revision.
drop index if exists public.ads_csv_success_fingerprint;
create index ads_csv_success_fingerprint on public.ads_csv_imports(account_id,report_type,fingerprint) where status='success';
create or replace function public.ads_csv_commit(p_actor uuid,p_id uuid,p_meta jsonb,p_rows jsonb) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
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

commit;
