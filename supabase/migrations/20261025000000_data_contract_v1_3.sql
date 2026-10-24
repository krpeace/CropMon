-- 목적: 데이터 계약 v1.3. 3일 전망 요약 표(water_outlook_summary)를 더한다.
--       서비스 엑셀 "관수 전망" 시트 위쪽(지금 토양 상태, 관수 필요 예상일, 권장 관수량, 3일 합)과 같은 내용이다.
--       날짜별 전망은 water_outlook 에 있고, 이 표는 회차 × 계산 조건마다 한 줄 요약이다.
--
-- 실행 방법:
--   1. 먼저 이름이 앞선 마이그레이션 파일을 모두 실행해 둔다.
--   2. Supabase 대시보드 → SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run 을 누른다.
--   여러 번 실행해도 오류가 나지 않는다.
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v1.3), 결정 기록: docs/decisions/0007-outlook-summary.md

create table if not exists public.water_outlook_summary (
  run_id bigint not null references public.forecast_runs (run_id),
  scenario_id text not null references public.scenarios (scenario_id),
  horizon_days int not null check (horizon_days >= 1),
  start_date date not null,
  dr_start_mm numeric,
  status_start text not null check (status_start in ('need', 'caution', 'normal', 'wet', 'dormant')),
  need_center_in int check (need_center_in >= 0),
  need_early_in int check (need_early_in >= 0),
  need_late_in int check (need_late_in >= 0),
  advice_net_mm numeric,
  advice_gross_mm numeric,
  etc_sum_mm numeric,
  etc_sum_err_mm numeric,
  rain_sum_mm numeric,
  rain_expected_sum_mm numeric,
  calc_version text not null,
  primary key (run_id, scenario_id)
);

-- 권한: 누구나 읽기만. 쓰기는 서버 키(service role)만.
alter table public.water_outlook_summary enable row level security;
revoke all on public.water_outlook_summary from anon, authenticated;
grant select on public.water_outlook_summary to anon, authenticated;
drop policy if exists "water_outlook_summary 누구나 읽기" on public.water_outlook_summary;
create policy "water_outlook_summary 누구나 읽기"
  on public.water_outlook_summary
  for select
  to anon, authenticated
  using (true);
