-- 확인 SQL: 정기 정리 O2 (이슈 #213, 결정 0075)
--
-- 언제: 마이그레이션 20261127000000_ops_cleanup.sql 을 Run 한 뒤.
-- 방법: SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run. 읽기만 한다 (정리 함수를 부르지 않는다).
-- 결과: 한 줄. all_ok = true 면 통과. false 이면 false 인 칸 이름을 알려 주세요.

with f as (
  select p.oid, p.prosecdef, p.proconfig
  from pg_catalog.pg_proc p
  where p.oid = to_regprocedure('ops.cleanup_accounts()')
),
c as (
  select
    exists (select 1 from f) as function_exists,
    coalesce((select prosecdef from f), false) as security_definer,
    coalesce((select 'search_path=""' = any (proconfig) from f), false) as search_path_fixed,
    coalesce((select not has_function_privilege('anon', oid, 'execute') from f), false) as anon_blocked,
    coalesce((select not has_function_privilege('authenticated', oid, 'execute') from f), false) as member_blocked,
    coalesce((select not has_function_privilege('service_role', oid, 'execute') from f), false) as service_role_blocked,
    exists (
      select 1 from cron.job
      where jobname = 'ops-cleanup-hourly'
        and schedule = '7 * * * *'
        and command = 'select ops.cleanup_accounts()'
        and active
    ) as job_scheduled
)
select
  c.*,
  (
    function_exists and security_definer and search_path_fixed
    and anon_blocked and member_blocked and service_role_blocked
    and job_scheduled
  ) as all_ok
from c;
