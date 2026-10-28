-- 목적: 데이터 계약 v1.5. 작물 공통 토양 물 상태(soil_water_daily) 표를 더하고,
--       토성 사전에 is_estimated 열을 더한다 (#35, 결정 0020).
--       계산은 croplib-dp 가 FAO-56 식(84)~(88) 및 Table 19 로 한다.
--
-- 실행 방법:
--   1. 먼저 이름이 앞선 마이그레이션 파일을 모두 실행해 둔다.
--   2. Supabase 대시보드 → SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run 을 누른다.
--   여러 번 실행해도 오류가 나지 않는다.
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v1.5)

-- 1. 토성 사전: 추정값 여부 열 추가
alter table public.soil_types
  add column if not exists is_estimated boolean not null default false;

-- 2. 작물 공통 토양 물 상태: 지점 × 토성 × 날짜
--    한 해 10지점 × 12토성 × 365일 ≈ 4.4만 줄.
--    겨울(12~2월) 줄도 두되 status = 'winter', dr_mm·aw_pct 는 빈 칸.
create table if not exists public.soil_water_daily (
  stn_id text not null references public.stations (stn_id),
  soil_code text not null references public.soil_types (soil_code),
  date date not null,
  eto_mm numeric,
  rain_mm numeric,
  eto_7d_mm numeric,
  rain_7d_mm numeric,
  dp_mm numeric,
  dr_mm numeric,
  taw_mm numeric not null,
  raw_mm numeric not null,
  aw_pct numeric,
  status text check (status in ('winter', 'pool', 'ample', 'fair', 'dry', 'very_dry')),
  days_to_dry int,
  filled boolean not null default false,
  calc_version text not null,
  updated_at timestamptz not null default now(),
  primary key (stn_id, soil_code, date)
);

-- 권한: 누구나 읽기만. 쓰기는 서버 키(service role)만.
alter table public.soil_water_daily enable row level security;
revoke all on public.soil_water_daily from anon, authenticated;
grant select on public.soil_water_daily to anon, authenticated;
drop policy if exists "soil_water_daily 누구나 읽기" on public.soil_water_daily;
create policy "soil_water_daily 누구나 읽기"
  on public.soil_water_daily
  for select
  to anon, authenticated
  using (true);
