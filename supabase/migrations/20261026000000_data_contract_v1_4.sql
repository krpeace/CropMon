-- 목적: 데이터 계약 v1.4. 온도·햇빛 화면의 적산온도(heat_daily)와 적산일사(sun_daily) 표를 더하고,
--       작물 사전에 적산온도 기준온도·단계를 더한다 (온1, 결정 0013).
--       계산은 croplib-dp 가 cropweather(temp_core·solar_core) 식으로 한다. 평년 = 지난 10년(2016–2025) 같은 날 평균.
--
-- 실행 방법:
--   1. 먼저 이름이 앞선 마이그레이션 파일을 모두 실행해 둔다.
--   2. Supabase 대시보드 → SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run 을 누른다.
--   여러 번 실행해도 오류가 나지 않는다.
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v1.4)

-- 1. 작물 사전 (FAO-56 표준값 층): 적산온도 기준온도와 단계 (cropweather crops_gdd.csv, Paredes 2025)
alter table public.crops
  add column if not exists t_base_c numeric check (t_base_c between -10 and 30);
alter table public.crops
  add column if not exists gdd_stages int[];

update public.crops set t_base_c = 4, gdd_stages = '{500,1000,1500,2000,2500,3000,3500,4000}'
  where crop_id = 'apple';
update public.crops set t_base_c = 4, gdd_stages = '{300,600,900,1200}'
  where crop_id = 'kimchi_cabbage';

-- 2. 적산온도: 지점 × 작물 × 날짜 (1월 1일 ~ 12월 31일, 평년 선을 그리려고 앞날도 줄을 둔다)
create table if not exists public.heat_daily (
  stn_id text not null references public.stations (stn_id),
  crop_id text not null references public.crops (crop_id),
  date date not null,
  t_base_c numeric not null,
  gdd_day numeric,
  gdd_cum numeric,
  gdd_normal_day numeric,
  gdd_normal_cum numeric,
  lead_days int,
  normal_from int not null,
  normal_to int not null,
  filled boolean not null default false,
  calc_version text not null,
  primary key (stn_id, crop_id, date)
);

-- 3. 적산일사: 지점 × 날짜 (일사를 재는 지점만)
create table if not exists public.sun_daily (
  stn_id text not null references public.stations (stn_id),
  date date not null,
  rs_day_mj numeric,
  rs_cum_mj numeric,
  rs_normal_day_mj numeric,
  rs_normal_cum_mj numeric,
  normal_from int not null,
  normal_to int not null,
  filled boolean not null default false,
  calc_version text not null,
  primary key (stn_id, date)
);

-- 권한: 누구나 읽기만. 쓰기는 서버 키(service role)만.
alter table public.heat_daily enable row level security;
revoke all on public.heat_daily from anon, authenticated;
grant select on public.heat_daily to anon, authenticated;
drop policy if exists "heat_daily 누구나 읽기" on public.heat_daily;
create policy "heat_daily 누구나 읽기"
  on public.heat_daily
  for select
  to anon, authenticated
  using (true);

alter table public.sun_daily enable row level security;
revoke all on public.sun_daily from anon, authenticated;
grant select on public.sun_daily to anon, authenticated;
drop policy if exists "sun_daily 누구나 읽기" on public.sun_daily;
create policy "sun_daily 누구나 읽기"
  on public.sun_daily
  for select
  to anon, authenticated
  using (true);
