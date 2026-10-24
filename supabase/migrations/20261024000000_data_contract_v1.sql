-- 목적: 데이터 계약 v1의 공개 테이블 9개를 만든다.
--       누구나 읽을 수만 있고, 쓰기는 croplib-dp 의 서버 키(service role)만 한다.
--
-- 실행 방법:
--   1. Supabase 대시보드에서 이 프로젝트를 연다.
--   2. 왼쪽 메뉴의 SQL Editor 를 연다.
--   3. 이 파일 내용을 모두 복사해 붙여 넣고 Run 을 누른다.
--   여러 번 실행해도 오류가 나지 않는다.
--
-- 이 파일은 표(그릇)만 만든다. 지점·작물·토성의 실제 값(사전 자료)은 다음 파일에서 넣는다.
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v1)
--
-- 값의 범위(예: ETo 0~15 mm/d)는 이 파일이 아니라 croplib-dp 의 계약 검사가 올리기 전에 막는다.
-- 여기서는 구조(키, 연결, 이름이 정해진 칸, 순서)만 막는다.

-- ---------------------------------------------------------------------------
-- 1. stations: 장소 사전 (ASOS 지점)
-- ---------------------------------------------------------------------------
create table if not exists public.stations (
  stn_id text primary key,
  name_ko text not null,
  lat numeric not null,
  lon numeric not null,
  elev_m numeric not null,
  wind_height_m numeric not null,
  grid_nx int,
  grid_ny int,
  has_forecast boolean not null default false,
  sort_order int not null default 0
);

-- ---------------------------------------------------------------------------
-- 2. crops: 작물 사전 (FAO-56 표준값 층)
--    작형마다 달라지는 값(시작일, 생육단계 일수)은 crop_seasons 에 둔다.
-- ---------------------------------------------------------------------------
create table if not exists public.crops (
  crop_id text primary key,
  name_ko text not null,
  kc_ini numeric not null,
  kc_mid numeric not null,
  kc_end numeric not null,
  zr_m numeric not null,
  p numeric not null,
  h_m numeric,
  source text not null
);

-- ---------------------------------------------------------------------------
-- 3. crop_seasons: 작형 사전 (표준값 층)
--    값이 아직 없는 작형은 start_mmdd 와 l_*_d 를 비워 둔다. 비어 있는 작형은 화면 선택지에 나오지 않는다.
-- ---------------------------------------------------------------------------
create table if not exists public.crop_seasons (
  season_type_id text primary key,
  crop_id text not null references public.crops (crop_id),
  name_ko text not null,
  start_mmdd text check (start_mmdd ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$'),
  l_ini_d int,
  l_dev_d int,
  l_mid_d int,
  l_late_d int,
  is_default boolean not null default false,
  source text not null
);

-- 작물마다 기본 작형은 하나뿐이다.
create unique index if not exists crop_seasons_one_default
  on public.crop_seasons (crop_id)
  where is_default;

-- ---------------------------------------------------------------------------
-- 4. soil_types: 토성 12종
--    fc_min~wp_max 는 FAO-56 Table 19 범위 그대로, fc·wp 는 계산에 쓰는 가운데 값.
--    Table 19 에 없는 토성은 값 칸을 모두 비워 둔다.
-- ---------------------------------------------------------------------------
create table if not exists public.soil_types (
  soil_code text primary key,
  name_ko text not null,
  fc_min numeric,
  fc_max numeric,
  wp_min numeric,
  wp_max numeric,
  fc numeric,
  wp numeric,
  is_default boolean not null default false,
  sort_order int not null default 0,
  source text not null,
  check (fc is null or wp is null or wp < fc)
);

create unique index if not exists soil_types_one_default
  on public.soil_types (is_default)
  where is_default;

-- ---------------------------------------------------------------------------
-- 5. scenarios: 대표 계산 조건 (지점 × 작물 × 작형 × 토성 × 연도)
-- ---------------------------------------------------------------------------
create table if not exists public.scenarios (
  scenario_id text primary key,
  stn_id text not null references public.stations (stn_id),
  crop_id text not null references public.crops (crop_id),
  season_type_id text not null references public.crop_seasons (season_type_id),
  soil_code text not null references public.soil_types (soil_code),
  season_year int not null,
  season_start date not null,
  season_end date not null,
  dr0_mm numeric not null default 0,
  taw_mm numeric not null,
  raw_mm numeric not null,
  is_default boolean not null default false,
  check (season_end > season_start),
  unique (stn_id, crop_id, season_type_id, soil_code, season_year)
);

-- ---------------------------------------------------------------------------
-- 6. forecast_runs: 수집 회차 기록 (수집 감시)
--    error, raw_path 는 공개하지 않는다 (아래 권한 부분 참고).
-- ---------------------------------------------------------------------------
create table if not exists public.forecast_runs (
  run_id bigint generated always as identity primary key,
  run_at timestamptz not null,
  run_name text not null check (run_name in ('아침', '저녁')),
  stn_id text not null references public.stations (stn_id),
  started_at timestamptz not null,
  finished_at timestamptz,
  result text not null
    check (result in ('정시 성공', '백업: S3', '백업: 직전 발표', '지연 수집', '실패')),
  on_time boolean not null,
  src_run_at timestamptz,
  rs_method text check (rs_method in ('S3', 'S4')),
  obs_prev_date date,
  attempts int not null default 1 check (attempts >= 1),
  collector text not null check (collector in ('actions', 'pc')),
  raw_path text,
  error text,
  unique (run_at, stn_id, collector)
);

-- ---------------------------------------------------------------------------
-- 7. weather_daily: 지점별 일 관측값과 ETo
--    값이 없으면 null 로 두고 0 을 넣지 않는다. 채운 날은 filled = true.
-- ---------------------------------------------------------------------------
create table if not exists public.weather_daily (
  stn_id text not null references public.stations (stn_id),
  date date not null,
  tmax_c numeric,
  tmin_c numeric,
  tavg_c numeric,
  rh_mean_pct numeric,
  rh_min_pct numeric,
  wind_ms numeric,
  u2_ms numeric,
  sunshine_h numeric,
  rs_mj numeric,
  rain_mm numeric,
  eto_mm numeric,
  filled boolean not null default false,
  fetched_at timestamptz not null,
  calc_version text not null,
  primary key (stn_id, date)
);

-- ---------------------------------------------------------------------------
-- 8. water_balance_daily: 관측 물수지와 그날 상태
--    status 는 토양수분 상태 코드로 저장한다. 화면 이름은 src/domain/water-status.ts 가 붙인다.
--      dormant = 휴면기, wet = 과습, normal = 보통, caution = 주의, need = 관수 필요
-- ---------------------------------------------------------------------------
create table if not exists public.water_balance_daily (
  scenario_id text not null references public.scenarios (scenario_id),
  date date not null,
  kc numeric,
  eto_mm numeric,
  eto_src text not null check (eto_src in ('관측', '예보', '없음')),
  etc_mm numeric,
  rain_mm numeric,
  irr_net_mm numeric not null default 0,
  dr_prev_mm numeric,
  ks numeric,
  etc_adj_mm numeric,
  dp_mm numeric,
  dr_mm numeric,
  status text not null check (status in ('need', 'caution', 'normal', 'wet', 'dormant')),
  filled boolean not null default false,
  calc_version text not null,
  primary key (scenario_id, date)
);

-- ---------------------------------------------------------------------------
-- 9. water_outlook: 앞으로 3일 전망
--    과습(wet)은 관측 물수지 날만 판정하므로 이 표의 status 에는 없다.
-- ---------------------------------------------------------------------------
create table if not exists public.water_outlook (
  run_id bigint not null references public.forecast_runs (run_id),
  scenario_id text not null references public.scenarios (scenario_id),
  target_date date not null,
  lead_day int not null check (lead_day between 0 and 3),
  eto_mm numeric,
  etc_mm numeric,
  etc_err_mm numeric,
  rain_fcst_mm numeric,
  pop_pct numeric,
  rain_expected_mm numeric,
  dr_center_mm numeric,
  dr_early_mm numeric,
  dr_late_mm numeric,
  status text not null check (status in ('need', 'caution', 'normal', 'dormant')),
  calc_version text not null,
  primary key (run_id, scenario_id, target_date)
);

-- ---------------------------------------------------------------------------
-- 권한: 모든 테이블에 행 단위 보안(RLS)을 켠다.
--   - 먼저 비회원(anon)·회원(authenticated)에게 기본으로 붙는 권한을 모두 거둔다.
--   - 읽기(select)만 다시 준다. 쓰기 정책은 만들지 않는다.
--   - 쓰기는 croplib-dp 의 서버 키(service role)만 한다. 서버 키는 RLS 를 건너뛴다.
-- ---------------------------------------------------------------------------

-- stations
alter table public.stations enable row level security;
revoke all on public.stations from anon, authenticated;
grant select on public.stations to anon, authenticated;
drop policy if exists "stations 누구나 읽기" on public.stations;
create policy "stations 누구나 읽기"
  on public.stations
  for select
  to anon, authenticated
  using (true);

-- crops
alter table public.crops enable row level security;
revoke all on public.crops from anon, authenticated;
grant select on public.crops to anon, authenticated;
drop policy if exists "crops 누구나 읽기" on public.crops;
create policy "crops 누구나 읽기"
  on public.crops
  for select
  to anon, authenticated
  using (true);

-- crop_seasons
alter table public.crop_seasons enable row level security;
revoke all on public.crop_seasons from anon, authenticated;
grant select on public.crop_seasons to anon, authenticated;
drop policy if exists "crop_seasons 누구나 읽기" on public.crop_seasons;
create policy "crop_seasons 누구나 읽기"
  on public.crop_seasons
  for select
  to anon, authenticated
  using (true);

-- soil_types
alter table public.soil_types enable row level security;
revoke all on public.soil_types from anon, authenticated;
grant select on public.soil_types to anon, authenticated;
drop policy if exists "soil_types 누구나 읽기" on public.soil_types;
create policy "soil_types 누구나 읽기"
  on public.soil_types
  for select
  to anon, authenticated
  using (true);

-- scenarios
alter table public.scenarios enable row level security;
revoke all on public.scenarios from anon, authenticated;
grant select on public.scenarios to anon, authenticated;
drop policy if exists "scenarios 누구나 읽기" on public.scenarios;
create policy "scenarios 누구나 읽기"
  on public.scenarios
  for select
  to anon, authenticated
  using (true);

-- forecast_runs: 실패 이유(error)와 원자료 위치(raw_path)는 공개하지 않는다.
--   칸 단위로 읽기를 준다. 화면은 select * 가 아니라 필요한 칸을 적어서 읽는다.
alter table public.forecast_runs enable row level security;
revoke all on public.forecast_runs from anon, authenticated;
grant select (
  run_id, run_at, run_name, stn_id, started_at, finished_at, result, on_time,
  src_run_at, rs_method, obs_prev_date, attempts, collector
) on public.forecast_runs to anon, authenticated;
drop policy if exists "forecast_runs 누구나 읽기" on public.forecast_runs;
create policy "forecast_runs 누구나 읽기"
  on public.forecast_runs
  for select
  to anon, authenticated
  using (true);

-- weather_daily
alter table public.weather_daily enable row level security;
revoke all on public.weather_daily from anon, authenticated;
grant select on public.weather_daily to anon, authenticated;
drop policy if exists "weather_daily 누구나 읽기" on public.weather_daily;
create policy "weather_daily 누구나 읽기"
  on public.weather_daily
  for select
  to anon, authenticated
  using (true);

-- water_balance_daily
alter table public.water_balance_daily enable row level security;
revoke all on public.water_balance_daily from anon, authenticated;
grant select on public.water_balance_daily to anon, authenticated;
drop policy if exists "water_balance_daily 누구나 읽기" on public.water_balance_daily;
create policy "water_balance_daily 누구나 읽기"
  on public.water_balance_daily
  for select
  to anon, authenticated
  using (true);

-- water_outlook
alter table public.water_outlook enable row level security;
revoke all on public.water_outlook from anon, authenticated;
grant select on public.water_outlook to anon, authenticated;
drop policy if exists "water_outlook 누구나 읽기" on public.water_outlook;
create policy "water_outlook 누구나 읽기"
  on public.water_outlook
  for select
  to anon, authenticated
  using (true);
