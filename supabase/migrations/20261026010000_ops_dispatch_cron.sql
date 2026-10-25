-- 목적: 수집 예약을 GitHub 예약 실행 대신 Supabase 가 정시에 직접 시킨다 (대책 2, 결정 0014).
--       GitHub 예약 실행은 몰리면 1~2시간 늦거나 건너뛴다 (10/25: 02시 회차 2시간 14분 늦음, 17시 회차 미실행,
--       매시간 감시 14시간에 4번). Supabase pg_cron 은 분 단위로 정확하다.
--       pg_cron 이 정한 시각에 pg_net 으로 GitHub API(workflow_dispatch)를 불러 croplib-dp 워크플로를 실행한다.
--       GitHub 예약 실행(collect.yml 등의 schedule)은 예비로 그대로 둔다. 이미 정시 성공한 회차는 건너뛴다(--skip-if-done).
--
-- 실행 전에 할 일 (사용자, 한 번):
--   1. GitHub 에서 croplib-dp 저장소만 다루는 fine-grained 토큰을 만든다. 권한: Actions = Read and write. 그 밖은 없음.
--   2. SQL Editor 에서 아래 한 줄을 토큰 값만 바꿔 실행한다. 토큰을 이 파일·채팅·커밋에 적지 않는다.
--        select vault.create_secret('여기에_토큰', 'github_dispatch_token', 'croplib-dp Actions 실행용');
--      토큰을 바꿀 때: select vault.update_secret((select id from vault.secrets where name = 'github_dispatch_token'), '새_토큰');
--
-- 실행 방법: 위를 마친 뒤 SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run. 여러 번 실행해도 오류가 나지 않는다
--           (cron.schedule 은 같은 이름이면 덮어쓴다).
-- 확인: select * from ops.dispatch_recent;  (GitHub 이 204 를 돌려주면 정상)
-- 멈추기: select cron.unschedule(jobname) from cron.job where jobname like 'croplib-%';

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 화면(anon)·회원(authenticated)이 볼 수 없는 운영용 이름공간
create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

-- croplib-dp 워크플로 하나를 실행시킨다. 토큰은 Vault 에서만 읽는다. 돌려주는 값은 pg_net 요청 번호.
create or replace function ops.dispatch_workflow(workflow text, inputs jsonb default '{}'::jsonb)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
  req_id bigint;
begin
  select decrypted_secret into token
    from vault.decrypted_secrets
    where name = 'github_dispatch_token'
    limit 1;
  if token is null then
    raise warning 'ops.dispatch_workflow: Vault 에 github_dispatch_token 이 없어 % 를 실행하지 못함', workflow;
    return null;
  end if;
  select net.http_post(
    url := format('https://api.github.com/repos/krpeace/croplib-dp/actions/workflows/%s/dispatches', workflow),
    body := jsonb_build_object('ref', 'main', 'inputs', inputs),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'cropmon-supabase-cron',
      'Content-Type', 'application/json'
    ),
    timeout_milliseconds := 10000
  ) into req_id;
  return req_id;
end;
$$;

revoke all on function ops.dispatch_workflow(text, jsonb) from public, anon, authenticated;

-- 최근 실행 요청 결과 (GitHub 이 204 를 돌려주면 정상). 토큰은 들어 있지 않다.
create or replace view ops.dispatch_recent as
  select id, status_code, created, error_msg, left(content, 200) as content
  from net._http_response
  order by created desc
  limit 50;

revoke all on ops.dispatch_recent from public, anon, authenticated;

-- 예약 (pg_cron 시각은 UTC. KST = UTC + 9시간)
-- 물 수집: 02시·17시 회차. 발표 + 15분에 한 번, 놓칠 때를 대비해 + 45분에 한 번 더 (이미 정시 성공이면 바로 끝남)
select cron.schedule('croplib-collect-02', '15 17 * * *', $cron$select ops.dispatch_workflow('collect.yml')$cron$); -- 02:15 KST
select cron.schedule('croplib-collect-02b', '45 17 * * *', $cron$select ops.dispatch_workflow('collect.yml')$cron$); -- 02:45 KST
select cron.schedule('croplib-collect-17', '15 8 * * *', $cron$select ops.dispatch_workflow('collect.yml')$cron$); -- 17:15 KST
select cron.schedule('croplib-collect-17b', '45 8 * * *', $cron$select ops.dispatch_workflow('collect.yml')$cron$); -- 17:45 KST
-- 적산온도·적산일사: 하루 한 번 (DB 쓰기 켬)
select cron.schedule('croplib-heat-sun', '20 0 * * *', $cron$select ops.dispatch_workflow('heat-sun.yml', '{"write": "true"}'::jsonb)$cron$); -- 09:20 KST
-- 수집 감시: 매시간 40분
select cron.schedule('croplib-monitor', '40 * * * *', $cron$select ops.dispatch_workflow('monitor.yml')$cron$);
