-- 목적: 정기 정리 O2 — 동의 없이 24시간이 되어 가는 계정, 7일 지난 탈퇴 기록, 7일 지난 예약 실행 기록을 매시간 지운다
--       (이슈 #213, 결정 0075). 표 · 열은 바뀌지 않는다 (데이터 계약 판 그대로).
--
-- 만드는 것:
--   ops.cleanup_accounts()   지우는 함수. 지운 줄 수를 jsonb 로 돌려준다. pg_cron(postgres)만 부른다
--   예약 ops-cleanup-hourly  매시간 7분
--
-- 왜 23시간: 매시간 돌기 때문에 23시간 기준이면 가장 늦어도 만든 지 24시간 안에 지워진다
--           (동의 화면의 "24시간 안에 자동으로 지워져요" 약속, 결정 0065 · 0069).
--
-- ⚠ 지운 계정은 되살릴 수 없다.
--
-- 실행 방법 (순서):
--   1. PR 에 적힌 "미리 세기" 개수를 보고, 남겨야 할 계정(손으로 만든 시험 계정 포함 — 동의 판 값이 없으면 대상)이 없는지 확인한다.
--   2. supabase/checks/o2_cleanup_rollback.sql (되돌리기)을 열어 둔다.
--   3. SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run. 여러 번 실행해도 오류가 나지 않는다
--      (cron.schedule 은 같은 이름이면 덮어쓴다).
--   4. supabase/checks/o2_cleanup_check.sql 을 붙여 넣고 Run → all_ok = true 인지 본다.
--
-- 데이터 계약: docs/DATA_CONTRACT.md

create extension if not exists pg_cron;
create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. 함수
--    대상 계정 = 만든 지 23시간이 지났고, 동의 판 값이 있는 members 줄이 없는 auth.users 줄.
--    (members 줄이 없거나 terms_version 이 null · 공백.) 예전 판에 동의한 회원은 값이 있으므로 대상이 아니다.
--    members · 농장 표는 on delete cascade 로 따라 지워진다.
--    동의 전 계정은 ops.withdrawn_accounts 에 해시를 남기지 않는다 — 백업에서 되살아나도 다음 회차에 다시 지워진다.
--
--    잠그기: delete 한 문장만 쓰면, 삭제가 도는 순간에 저장된 동의를 못 보고 지울 틈이 있다.
--    그래서 ① auth.users 대상 줄 → ② 그 사람들의 members 줄 순서로 먼저 잠그고, ③ 같은 조건의 delete 를
--    별도 문장으로 실행한다. ③은 새로 읽으므로 그 사이 저장된 동의가 보인다. 잠그는 순서는 늘 auth.users → members.
-- ---------------------------------------------------------------------------
create or replace function ops.cleanup_accounts()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_users     bigint;
  v_withdrawn bigint;
  v_runs      bigint;
begin
  perform 1
  from auth.users u
  where u.created_at <= now() - interval '23 hours'
    and not exists (
      select 1 from public.members m
      where m.user_id = u.id and m.terms_version is not null and btrim(m.terms_version) <> ''
    )
  for update of u;

  perform 1
  from public.members
  where user_id in (
    select u.id
    from auth.users u
    where u.created_at <= now() - interval '23 hours'
      and not exists (
        select 1 from public.members m
        where m.user_id = u.id and m.terms_version is not null and btrim(m.terms_version) <> ''
      )
  )
  for update;

  delete from auth.users u
  where u.created_at <= now() - interval '23 hours'
    and not exists (
      select 1 from public.members m
      where m.user_id = u.id and m.terms_version is not null and btrim(m.terms_version) <> ''
    );
  get diagnostics v_users = row_count;

  delete from ops.withdrawn_accounts
  where withdrawn_at < now() - interval '7 days';
  get diagnostics v_withdrawn = row_count;

  -- 매분 도는 예약(croplib-farm-calc-sweep 등) 때문에 하루 1,400줄 넘게 쌓인다
  delete from cron.job_run_details
  where end_time < now() - interval '7 days';
  get diagnostics v_runs = row_count;

  return jsonb_build_object(
    'unconsented_users', v_users,
    'withdrawn_rows', v_withdrawn,
    'cron_runs', v_runs
  );
end;
$$;

revoke all on function ops.cleanup_accounts() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. 예약 — 매시간 7분
-- ---------------------------------------------------------------------------
select cron.schedule('ops-cleanup-hourly', '7 * * * *', $cron$select ops.cleanup_accounts()$cron$);
