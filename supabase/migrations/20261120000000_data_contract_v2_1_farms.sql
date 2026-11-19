-- 목적: 1/1 회원제의 농장 DB — 농장 · 작기 · 관수 기록 · 계산 상태 · 농장별 계산 결과 표, 작기 날짜 규칙 함수,
--       다시 계산 깨우기 트리거 (데이터 계약 v2.1, 이슈 #184, 결정 0062). 화면 변경은 없다.
--
-- 만드는 것:
--   public.farms                    농장 하나 = 한 줄. 회원 본인이 읽기 · 쓰기 · 지우기 (회원 1명 = 농장 1개, 색인 farms_one_per_user)
--   public.farm_seasons             날짜가 정해진 작기 줄. 회원은 읽기만, 줄은 sync_farm_seasons 만 쓴다
--   public.irrigation_logs          관수 기록. 회원 본인이 읽기 · 쓰기 · 지우기 (날짜 규칙은 DB 가 지킨다)
--   public.farm_calc_status         농장별 다시 계산 요청 · 결과 상태. 회원 읽기, 서버 키(croplib-dp) 쓰기
--   public.farm_water_daily / farm_water_outlook / farm_water_outlook_summary   농장별 계산 결과. 회원 본인 읽기만, 서버 키 쓰기
--   public.farm_season_window()     작기 연도 규칙 (날짜 계산만, 물수지 계산 아님) — 연도 규칙은 이 한 곳
--   public.sync_farm_seasons(farm_id) / sync_farm_seasons_at(farm_id, 오늘)   날짜 줄 만들기 · 고치기 (서버 키 / 안쪽)
--   public.touch_farm_calc()        다시 계산 요청 기록 + croplib-dp 깨우기 (2분 창, 아래 ops.* 와 매분 보충 예약)
--   ops.farm_calc_wake              마지막 깨우기 시각 (한 줄)
--
-- 바꾸는 것 (기존 표):
--   crop_seasons  열 is_protected(시설 재배) · cum_start_mmdd(적산 시작 월-일) + 합성 외래키용 유일 색인
--   crop_kc_sets  합성 외래키용 유일 색인
--   crops         열 gdd_stage_labels
--   scenarios_one_default  색인을 (stn_id, season_type_id, season_year) 로 — 한 작목에 작형이 둘(포도)이어도 둘 다 기본 조건
--   water_balance_daily.status · water_outlook.status · water_outlook_summary.status_start  check 에 'etc_only'(쓰는 물) 더함
--
-- 사전 값(포도 · 배추 기준온도)과 2027 포도 계산 조건은 다음 두 파일이다:
--   20261120010000_seed_grape_dictionary.sql, 20261120020000_seed_scenarios_grape_2027.sql
--
-- 실행 방법:
--   1. 운영 DB 를 바꾸기 전에: 무료 플랜이면 supabase/checks/d1_2_farms_rollback.sql (되돌리기)을 열어 둔다(실행하지 않음).
--      이 파일은 새 표 · 새 함수 · 새 트리거를 만들고, 기존 표는 열 추가 · 색인 바꾸기 · check 넓히기만 한다 (기존 줄은 안 건드림).
--   2. SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run. 여러 번 실행해도 오류가 나지 않는다.
--   3. 이어서 20261120010000, 20261120020000 을 이름 순서대로 Run.
--   4. supabase/checks/d1_2_farms_check.sql 을 붙여 넣고 Run → 맨 끝 줄 all_ok = true 인지 본다 (아무것도 남기지 않는다).
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v2.1)

-- ---------------------------------------------------------------------------
-- 0. 확장 · 작은 도우미 함수
-- ---------------------------------------------------------------------------
-- 작기 날짜가 한 농장 안에서 겹치지 않게(배제 제약) uuid 의 = 를 gist 에서 쓰려면 필요하다.
do $ext$
begin
  if exists (select 1 from pg_namespace where nspname = 'extensions') then
    create extension if not exists btree_gist with schema extensions;
  else
    create extension if not exists btree_gist;
  end if;
end
$ext$;

-- "MM-DD" 가 실제로 있는 날인가. 02-29 는 어느 해에도 날짜가 있게 일부러 거절하고, 04-31 같은 없는 날도 거절한다.
-- 표의 check 가 부르므로 회원도 실행할 수 있어야 한다(순수 함수라 권한을 거두지 않는다). 비어 있으면(null) 검사하지 않는다.
create or replace function public.is_valid_mmdd(p_mmdd text)
returns boolean
language sql
immutable
strict
set search_path = ''
as $$
  select case
    when p_mmdd ~ '^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$' then
      substr(p_mmdd, 4, 2)::int <= case substr(p_mmdd, 1, 2)
        when '02' then 28
        when '04' then 30
        when '06' then 30
        when '09' then 30
        when '11' then 30
        else 31
      end
    else false
  end;
$$;

-- 오늘(한국 날짜). 날짜 규칙은 모두 이 날짜를 쓴다.
create or replace function public.kst_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Seoul')::date;
$$;

-- ---------------------------------------------------------------------------
-- 1. 사전 쪽 바꾸기 (기존 표에 열 · 색인만 더한다. 기존 줄은 그대로)
-- ---------------------------------------------------------------------------
alter table public.crop_seasons
  add column if not exists is_protected boolean not null default false;
alter table public.crop_seasons
  add column if not exists cum_start_mmdd text check (public.is_valid_mmdd(cum_start_mmdd));

alter table public.crops
  add column if not exists gdd_stage_labels text[];
alter table public.crops drop constraint if exists crops_gdd_stage_labels_len;
alter table public.crops
  add constraint crops_gdd_stage_labels_len
  check (
    gdd_stage_labels is null
    or (gdd_stages is not null and cardinality(gdd_stage_labels) = cardinality(gdd_stages))
  );

-- 합성 외래키(작형 ↔ 작목, 재배 방식 ↔ 작목)가 가리킬 유일 색인. 키가 이미 유일해서 값은 안 바뀐다.
create unique index if not exists crop_seasons_type_crop_key
  on public.crop_seasons (season_type_id, crop_id);
create unique index if not exists crop_kc_sets_kc_crop_key
  on public.crop_kc_sets (kc_set_id, crop_id);

-- 기본 계산 조건 색인: 작목 기준 → 작형 기준. 사과 · 배추는 작형이 하나(배추는 값 있는 작형이 여름뿐)라 뜻이 같다.
drop index if exists public.scenarios_one_default;
create unique index if not exists scenarios_one_default
  on public.scenarios (stn_id, season_type_id, season_year)
  where is_default;

-- 쓰는 물(etc_only): 판정 순서(dormant → etc_only → …)는 croplib-dp 몫이라 DB 는 값만 받는다.
alter table public.water_balance_daily drop constraint if exists water_balance_daily_status_check;
alter table public.water_balance_daily
  add constraint water_balance_daily_status_check
  check (status in ('need', 'caution', 'normal', 'wet', 'dormant', 'etc_only'));

alter table public.water_outlook drop constraint if exists water_outlook_status_check;
alter table public.water_outlook
  add constraint water_outlook_status_check
  check (status in ('need', 'caution', 'normal', 'dormant', 'etc_only'));

alter table public.water_outlook_summary drop constraint if exists water_outlook_summary_status_start_check;
alter table public.water_outlook_summary
  add constraint water_outlook_summary_status_start_check
  check (status_start in ('need', 'caution', 'normal', 'wet', 'dormant', 'etc_only'));

-- ---------------------------------------------------------------------------
-- 2. public.farms — 농장 하나 = 한 줄
-- ---------------------------------------------------------------------------
create table if not exists public.farms (
  farm_id             uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name                text not null default '내 농장'
                        check (btrim(name) <> '' and char_length(name) <= 100),
  address             text not null check (btrim(address) <> ''),
  bjd_code            text,
  lat                 numeric check (lat between -90 and 90),
  lon                 numeric check (lon between -180 and 180),
  stn_id              text not null references public.stations (stn_id),
  soil_code           text not null default 'loam' references public.soil_types (soil_code),
  soil_source         text not null default 'default' check (soil_source in ('default', 'user', 'heuktoram')),
  pnu                 text,
  irrigated_area_m2   numeric not null check (irrigated_area_m2 > 0),
  area_input_unit     text not null default 'm2' check (area_input_unit in ('m2', 'pyeong')),
  -- 지금 작물 설정
  crop_id             text not null default 'common' references public.crops (crop_id),
  season_type_id      text,
  kc_set_id           text,
  season_start_mmdd   text check (public.is_valid_mmdd(season_start_mmdd)),
  season_start_source text check (season_start_source in ('default', 'user')),
  season_end_mmdd     text check (public.is_valid_mmdd(season_end_mmdd)),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- 작형 · 재배 방식은 그 작목의 것이어야 한다 (비어 있으면 검사하지 않는다)
  constraint farms_season_type_fk foreign key (season_type_id, crop_id)
    references public.crop_seasons (season_type_id, crop_id),
  constraint farms_kc_set_fk foreign key (kc_set_id, crop_id)
    references public.crop_kc_sets (kc_set_id, crop_id),
  -- 작물 공통이면 작형을 비우고, 아니면 작형이 필수
  constraint farms_crop_season_rule check ((crop_id = 'common') = (season_type_id is null)),
  -- 작물 공통이면 재배 방식 · 시작일 · 끝도 비운다
  constraint farms_common_blank check (
    crop_id <> 'common'
    or (kc_set_id is null and season_start_mmdd is null and season_start_source is null and season_end_mmdd is null)
  ),
  -- 시작일이 미정이면 출처도 비어 있다
  constraint farms_start_pair check ((season_start_mmdd is null) = (season_start_source is null))
);

-- 1/1 에는 회원 1명 = 농장 1개. 여러 농장을 열 때는 이 색인만 지운다.
create unique index if not exists farms_one_per_user on public.farms (user_id);
create index if not exists farms_stn_id_idx on public.farms (stn_id);

drop trigger if exists farms_set_updated_at on public.farms;
create trigger farms_set_updated_at
  before update on public.farms
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. public.farm_seasons — 날짜가 정해진 작기 줄 (회원은 읽기만)
-- ---------------------------------------------------------------------------
create table if not exists public.farm_seasons (
  farm_season_id uuid primary key default gen_random_uuid(),
  farm_id        uuid not null references public.farms (farm_id) on delete cascade,
  crop_id        text not null references public.crops (crop_id),
  season_type_id text not null,
  kc_set_id      text,
  start_date     date not null,
  end_date       date not null,
  start_unset    boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint farm_seasons_season_type_fk foreign key (season_type_id, crop_id)
    references public.crop_seasons (season_type_id, crop_id),
  constraint farm_seasons_kc_set_fk foreign key (kc_set_id, crop_id)
    references public.crop_kc_sets (kc_set_id, crop_id),
  -- 작기는 1년을 넘지 않는다 (시작일 포함 366일까지)
  constraint farm_seasons_dates check (end_date >= start_date and end_date - start_date + 1 <= 366),
  -- 같은 농장의 날짜 범위는 겹치지 않는다
  constraint farm_seasons_no_overlap
    exclude using gist (farm_id with =, daterange(start_date, end_date, '[]') with &&)
);

create index if not exists farm_seasons_farm_end_idx on public.farm_seasons (farm_id, end_date);

drop trigger if exists farm_seasons_set_updated_at on public.farm_seasons;
create trigger farm_seasons_set_updated_at
  before update on public.farm_seasons
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. public.irrigation_logs — 관수 기록 (mm 는 저장하지 않는다)
-- ---------------------------------------------------------------------------
create table if not exists public.irrigation_logs (
  log_id     uuid primary key default gen_random_uuid(),
  farm_id    uuid not null references public.farms (farm_id) on delete cascade,
  date       date not null,
  volume_l   numeric not null check (volume_l > 0),
  input_unit text not null default 'L' check (input_unit in ('L', 'ton')),
  memo       text check (char_length(memo) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists irrigation_logs_farm_date_idx on public.irrigation_logs (farm_id, date);

drop trigger if exists irrigation_logs_set_updated_at on public.irrigation_logs;
create trigger irrigation_logs_set_updated_at
  before update on public.irrigation_logs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. public.farm_calc_status — 농장 하나 = 한 줄. 화면의 "계산 반영 중" = requested_at > done_at 또는 done_at 없음
-- ---------------------------------------------------------------------------
create table if not exists public.farm_calc_status (
  farm_id      uuid primary key references public.farms (farm_id) on delete cascade,
  requested_at timestamptz,
  recalc_from  date,
  done_at      timestamptz,
  result       text check (result in ('ok', 'failed')),
  error        text,
  calc_version text
);

-- 기다리는 요청만 가볍게 찾는 색인 (매분 보충 예약이 쓴다)
create index if not exists farm_calc_status_pending_idx
  on public.farm_calc_status (requested_at)
  where requested_at is not null and (done_at is null or requested_at > done_at);

-- ---------------------------------------------------------------------------
-- 6. 농장별 계산 결과 (croplib-dp 가 서버 키로 쓴다). 공개 표와 같은 열에서 scenario_id → farm_id.
-- ---------------------------------------------------------------------------
create table if not exists public.farm_water_daily (
  farm_id        uuid not null references public.farms (farm_id) on delete cascade,
  date           date not null,
  farm_season_id uuid references public.farm_seasons (farm_season_id) on delete set null,
  kc             numeric,
  eto_mm         numeric,
  eto_src        text not null check (eto_src in ('관측', '예보', '없음')),
  etc_mm         numeric,
  rain_mm        numeric,
  irr_l          numeric not null default 0,
  irr_net_mm     numeric not null default 0,
  dr_prev_mm     numeric,
  ks             numeric,
  etc_adj_mm     numeric,
  dp_mm          numeric,
  dr_mm          numeric,
  taw_mm         numeric,
  raw_mm         numeric,
  status         text not null check (status in ('need', 'caution', 'normal', 'wet', 'dormant', 'etc_only')),
  filled         boolean not null default false,
  calc_version   text not null,
  primary key (farm_id, date)
);

create table if not exists public.farm_water_outlook (
  farm_id          uuid not null references public.farms (farm_id) on delete cascade,
  run_id           bigint not null references public.forecast_runs (run_id),
  target_date      date not null,
  lead_day         int not null check (lead_day between 0 and 4),
  eto_mm           numeric,
  etc_mm           numeric,
  etc_err_mm       numeric,
  rain_fcst_mm     numeric,
  pop_pct          numeric,
  rain_expected_mm numeric,
  dr_center_mm     numeric,
  dr_early_mm      numeric,
  dr_late_mm       numeric,
  status           text not null check (status in ('need', 'caution', 'normal', 'dormant', 'etc_only')),
  calc_version     text not null,
  primary key (farm_id, target_date)
);

create table if not exists public.farm_water_outlook_summary (
  farm_id              uuid primary key references public.farms (farm_id) on delete cascade,
  run_id               bigint not null references public.forecast_runs (run_id),
  horizon_days         int not null check (horizon_days >= 1),
  start_date           date not null,
  dr_start_mm          numeric,
  status_start         text not null check (status_start in ('need', 'caution', 'normal', 'wet', 'dormant', 'etc_only')),
  need_center_in       int check (need_center_in >= 0),
  need_early_in        int check (need_early_in >= 0),
  need_late_in         int check (need_late_in >= 0),
  advice_net_mm        numeric,
  advice_gross_mm      numeric,
  etc_sum_mm           numeric,
  etc_sum_err_mm       numeric,
  rain_sum_mm          numeric,
  rain_expected_sum_mm numeric,
  calc_version         text not null
);

create index if not exists farm_water_outlook_run_idx on public.farm_water_outlook (run_id);
create index if not exists farm_water_outlook_summary_run_idx on public.farm_water_outlook_summary (run_id);

-- ---------------------------------------------------------------------------
-- 7. 권한(RLS) — 자기 농장만. 먼저 기본으로 붙는 권한을 모두 거둔다. anon(비회원)에게는 아무 권한도 주지 않는다.
--    서버 키(service role)는 RLS 를 건너뛴다.
-- ---------------------------------------------------------------------------
alter table public.farms enable row level security;
revoke all on public.farms from anon, authenticated;

drop policy if exists "회원은 자기 농장을 읽는다" on public.farms;
create policy "회원은 자기 농장을 읽는다"
  on public.farms for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists "회원은 자기 농장을 만든다" on public.farms;
create policy "회원은 자기 농장을 만든다"
  on public.farms for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "회원은 자기 농장을 고친다" on public.farms;
create policy "회원은 자기 농장을 고친다"
  on public.farms for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "회원은 자기 농장을 지운다" on public.farms;
create policy "회원은 자기 농장을 지운다"
  on public.farms for delete to authenticated
  using (auth.uid() = user_id);

grant select, delete on public.farms to authenticated;
-- 열 단위로 막는다: farm_id · created_at · updated_at 은 회원이 못 정하고, user_id 는 넣을 때만 정할 수 있다(고치기 못 함).
grant insert (user_id, name, address, bjd_code, lat, lon, stn_id, soil_code, soil_source, pnu, irrigated_area_m2,
              area_input_unit, crop_id, season_type_id, kc_set_id, season_start_mmdd, season_start_source, season_end_mmdd)
  on public.farms to authenticated;
grant update (name, address, bjd_code, lat, lon, stn_id, soil_code, soil_source, pnu, irrigated_area_m2,
              area_input_unit, crop_id, season_type_id, kc_set_id, season_start_mmdd, season_start_source, season_end_mmdd)
  on public.farms to authenticated;

-- farm_seasons: 회원은 읽기만 (줄은 sync_farm_seasons 만 쓴다)
alter table public.farm_seasons enable row level security;
revoke all on public.farm_seasons from anon, authenticated;
drop policy if exists "회원은 자기 농장의 작기를 읽는다" on public.farm_seasons;
create policy "회원은 자기 농장의 작기를 읽는다"
  on public.farm_seasons for select to authenticated
  using (exists (select 1 from public.farms f where f.farm_id = farm_seasons.farm_id and f.user_id = auth.uid()));
grant select on public.farm_seasons to authenticated;

-- irrigation_logs: 회원 본인이 읽기 · 쓰기 · 지우기 (농장 주인을 따라간다)
alter table public.irrigation_logs enable row level security;
revoke all on public.irrigation_logs from anon, authenticated;

drop policy if exists "회원은 자기 관수 기록을 읽는다" on public.irrigation_logs;
create policy "회원은 자기 관수 기록을 읽는다"
  on public.irrigation_logs for select to authenticated
  using (exists (select 1 from public.farms f where f.farm_id = irrigation_logs.farm_id and f.user_id = auth.uid()));

drop policy if exists "회원은 자기 관수 기록을 넣는다" on public.irrigation_logs;
create policy "회원은 자기 관수 기록을 넣는다"
  on public.irrigation_logs for insert to authenticated
  with check (exists (select 1 from public.farms f where f.farm_id = irrigation_logs.farm_id and f.user_id = auth.uid()));

drop policy if exists "회원은 자기 관수 기록을 고친다" on public.irrigation_logs;
create policy "회원은 자기 관수 기록을 고친다"
  on public.irrigation_logs for update to authenticated
  using (exists (select 1 from public.farms f where f.farm_id = irrigation_logs.farm_id and f.user_id = auth.uid()))
  with check (exists (select 1 from public.farms f where f.farm_id = irrigation_logs.farm_id and f.user_id = auth.uid()));

drop policy if exists "회원은 자기 관수 기록을 지운다" on public.irrigation_logs;
create policy "회원은 자기 관수 기록을 지운다"
  on public.irrigation_logs for delete to authenticated
  using (exists (select 1 from public.farms f where f.farm_id = irrigation_logs.farm_id and f.user_id = auth.uid()));

grant select, delete on public.irrigation_logs to authenticated;
grant insert (farm_id, date, volume_l, input_unit, memo) on public.irrigation_logs to authenticated;
grant update (date, volume_l, input_unit, memo) on public.irrigation_logs to authenticated;

-- farm_calc_status · farm_water_*: 회원은 자기 농장 것을 읽기만, 쓰기는 서버 키
alter table public.farm_calc_status enable row level security;
revoke all on public.farm_calc_status from anon, authenticated;
drop policy if exists "회원은 자기 계산 상태를 읽는다" on public.farm_calc_status;
create policy "회원은 자기 계산 상태를 읽는다"
  on public.farm_calc_status for select to authenticated
  using (exists (select 1 from public.farms f where f.farm_id = farm_calc_status.farm_id and f.user_id = auth.uid()));
grant select on public.farm_calc_status to authenticated;

alter table public.farm_water_daily enable row level security;
revoke all on public.farm_water_daily from anon, authenticated;
drop policy if exists "회원은 자기 농장 물수지를 읽는다" on public.farm_water_daily;
create policy "회원은 자기 농장 물수지를 읽는다"
  on public.farm_water_daily for select to authenticated
  using (exists (select 1 from public.farms f where f.farm_id = farm_water_daily.farm_id and f.user_id = auth.uid()));
grant select on public.farm_water_daily to authenticated;

alter table public.farm_water_outlook enable row level security;
revoke all on public.farm_water_outlook from anon, authenticated;
drop policy if exists "회원은 자기 농장 전망을 읽는다" on public.farm_water_outlook;
create policy "회원은 자기 농장 전망을 읽는다"
  on public.farm_water_outlook for select to authenticated
  using (exists (select 1 from public.farms f where f.farm_id = farm_water_outlook.farm_id and f.user_id = auth.uid()));
grant select on public.farm_water_outlook to authenticated;

alter table public.farm_water_outlook_summary enable row level security;
revoke all on public.farm_water_outlook_summary from anon, authenticated;
drop policy if exists "회원은 자기 농장 전망 요약을 읽는다" on public.farm_water_outlook_summary;
create policy "회원은 자기 농장 전망 요약을 읽는다"
  on public.farm_water_outlook_summary for select to authenticated
  using (exists (select 1 from public.farms f where f.farm_id = farm_water_outlook_summary.farm_id and f.user_id = auth.uid()));
grant select on public.farm_water_outlook_summary to authenticated;

-- ---------------------------------------------------------------------------
-- 8. 작기 연도 규칙 (날짜 계산만 한다. 물수지 · 판정 계산이 아니다) — 연도 규칙은 이 한 곳
-- ---------------------------------------------------------------------------
-- 시작 월-일 S(미정이면 01-01, start_unset = true), 작기 일수 L. 오늘이 [작년 S, S+L) 또는 [올해 S, S+L) 안이면 그 작기,
-- 아니면 다음에 올 S. 끝 = 시작 + L − 1. 02-29 는 못 받으므로 모든 해에 날짜가 있다.
create or replace function public.farm_season_window(p_start_mmdd text, p_len int, p_today date)
returns table (start_date date, end_date date, start_unset boolean)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_mmdd text := coalesce(p_start_mmdd, '01-01');
  v_m int := substr(v_mmdd, 1, 2)::int;
  v_d int := substr(v_mmdd, 4, 2)::int;
  v_y int := extract(year from p_today)::int;
  v_s date;
  y int;
begin
  if p_len is null or p_len < 1 or p_len > 366 then
    raise exception 'season length out of range' using errcode = '22023';
  end if;
  -- 작년 · 올해 시작일 중 오늘을 품은 작기
  for y in v_y - 1 .. v_y loop
    v_s := make_date(y, v_m, v_d);
    if p_today >= v_s and p_today < v_s + p_len then
      return query select v_s, v_s + p_len - 1, p_start_mmdd is null;
      return;
    end if;
  end loop;
  -- 없으면 다음에 올 시작일
  v_s := make_date(v_y, v_m, v_d);
  if v_s <= p_today then
    v_s := make_date(v_y + 1, v_m, v_d);
  end if;
  return query select v_s, v_s + p_len - 1, p_start_mmdd is null;
end;
$$;

-- "지금 줄": 끝이 오늘 이후(끝나는 날 당일 포함)인 줄 가운데 시작이 가장 이른 것 = 작기 중이거나 아직 시작 전인 가장 가까운 줄.
-- 줄이 없으면 null. 작기 줄 만들기(sync)와 관수 기록 날짜 규칙이 이 한 정의를 같이 쓴다.
create or replace function public.farm_current_season(p_farm_id uuid, p_today date)
returns public.farm_seasons
language sql
stable
security definer
set search_path = ''
as $$
  select s.*
  from public.farm_seasons s
  where s.farm_id = p_farm_id and s.end_date >= p_today
  order by s.start_date
  limit 1;
$$;

revoke all on function public.farm_current_season(uuid, date) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. 다시 계산 요청 기록 · 깨우기
-- ---------------------------------------------------------------------------
create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

-- 마지막 깨우기 시각 (한 줄). 공개 계약 표가 아니라 운영용이다.
create table if not exists ops.farm_calc_wake (
  id           int primary key default 1 check (id = 1),
  last_wake_at timestamptz
);
insert into ops.farm_calc_wake (id) values (1) on conflict (id) do nothing;
alter table ops.farm_calc_wake enable row level security;
revoke all on ops.farm_calc_wake from anon, authenticated;

-- 깨울 때가 됐나 (순수 판단 — 시각을 인자로 받아 확인 SQL 이 판단표를 시험한다).
--   마지막 깨우기가 없거나 2분 넘게 지났고, 보충 예약이면(p_require_pending) 마지막 깨우기 뒤에 들어온 기다리는 요청이 있어야 한다.
create or replace function ops.farm_calc_wake_due(
  p_now timestamptz,
  p_last timestamptz,
  p_has_newer_pending boolean,
  p_require_pending boolean
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (p_last is null or p_now - p_last >= interval '2 minutes')
     and (not p_require_pending or coalesce(p_has_newer_pending, false));
$$;

revoke all on function ops.farm_calc_wake_due(timestamptz, timestamptz, boolean, boolean) from public, anon, authenticated;

-- croplib-dp 농장 계산 작업을 깨운다 (2분 창). p_require_pending = true 면 매분 보충 예약:
-- 기다리는 요청이 없으면 가벼운 조회 한 번(색인 farm_calc_status_pending_idx)으로 끝난다.
--   - 확인 SQL 은 set_config('cropmon.skip_wake', 'on', true) 로 이 함수를 건너뛴다 (진짜 작업을 깨우지 않게).
--   - 깨우기가 실패해도(토큰 없음 · 네트워크) 오류를 내지 않는다 — 회원의 저장은 성공해야 한다. 작업 파일(farm_calc.yml)이 아직
--     없으면 GitHub 이 404 를 돌려주고 ops.dispatch_recent 에 남을 뿐이다. 함수가 던지는 실패(드문 경우)는 마지막 깨우기 시각도
--     함께 되돌려져(같은 블록) 다음 변경 · 보충 예약이 다시 시도한다 — 실패한 깨우기가 다음 시도를 막지 않는다.
create or replace function ops.farm_calc_try_wake(p_require_pending boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now   timestamptz := clock_timestamp();
  v_last  timestamptz;
  v_newer boolean;
  v_rows  int;
begin
  if coalesce(current_setting('cropmon.skip_wake', true), '') = 'on' then
    return false;
  end if;

  select w.last_wake_at into v_last from ops.farm_calc_wake w where w.id = 1;

  select exists (
    select 1
    from public.farm_calc_status s
    where s.requested_at is not null
      and (s.done_at is null or s.requested_at > s.done_at)
      and (v_last is null or s.requested_at > v_last)
  ) into v_newer;

  if not ops.farm_calc_wake_due(v_now, v_last, v_newer, p_require_pending) then
    return false;
  end if;

  -- 동시에 둘이 깨우지 않게: 읽은 값 그대로일 때만 시각을 바꾼다
  update ops.farm_calc_wake
     set last_wake_at = v_now
   where id = 1 and last_wake_at is not distinct from v_last;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then
    return false;
  end if;

  perform ops.dispatch_workflow('farm_calc.yml');
  return true;
exception
  when others then
    raise warning 'ops.farm_calc_try_wake: 깨우기 실패 (sqlstate %)', sqlstate;
    return false;
end;
$$;

revoke all on function ops.farm_calc_try_wake(boolean) from public, anon, authenticated;

-- 매분 보충 예약이 부르는 함수
create or replace function ops.farm_calc_sweep()
returns void
language sql
security definer
set search_path = ''
as $$
  select ops.farm_calc_try_wake(true);
$$;

revoke all on function ops.farm_calc_sweep() from public, anon, authenticated;

-- 다시 계산 요청을 기록한다: farm_calc_status 줄을 만들거나 고치고 깨운다.
--   기다리는 중(requested_at > done_at 또는 done_at 없음)이면 recalc_from 을 더 이른 날로만 당기고, 끝난 뒤의 새 요청이면 새 날로.
--   농장 줄이 없으면(탈퇴 연쇄 삭제 중) 아무것도 하지 않는다. 어떤 경우에도 오류를 내지 않는다 — 회원의 저장을 막지 않는다.
--   requested_at 은 now() 가 아니라 clock_timestamp() — 같은 트랜잭션 안의 연속 요청도 순서가 구분된다.
create or replace function public.touch_farm_calc(p_farm_id uuid, p_from date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.farms f where f.farm_id = p_farm_id) then
    return;
  end if;

  insert into public.farm_calc_status as s (farm_id, requested_at, recalc_from)
  values (p_farm_id, clock_timestamp(), p_from)
  on conflict (farm_id) do update
    set requested_at = clock_timestamp(),
        recalc_from = case
          when s.requested_at is not null and (s.done_at is null or s.requested_at > s.done_at)
            then least(s.recalc_from, excluded.recalc_from)
          else excluded.recalc_from
        end;

  perform ops.farm_calc_try_wake(false);
exception
  when others then
    raise warning 'public.touch_farm_calc: 요청을 기록하지 못함 (sqlstate %)', sqlstate;
end;
$$;

revoke all on function public.touch_farm_calc(uuid, date) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. sync_farm_seasons — 날짜 줄 만들기 · 고치기
-- ---------------------------------------------------------------------------
-- 안쪽: "오늘"을 인자로 받는다 (확인 SQL 이 날짜를 바꿔 부른다). 실행 권한 없음.
create or replace function public.sync_farm_seasons_at(p_farm_id uuid, p_today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f      public.farms;
  s      public.crop_seasons;
  w      record;
  cur    public.farm_seasons;
  v_len  int;
begin
  select * into f from public.farms where farm_id = p_farm_id;
  if not found then
    return;
  end if;

  -- 작물 공통: 줄을 만들지 않는다. 지금 · 앞으로 올 줄(끝이 오늘 이후)은 지우고, 지난 줄은 남긴다.
  if f.season_type_id is null then
    delete from public.farm_seasons where farm_id = p_farm_id and end_date >= p_today;
    return;
  end if;

  select * into s from public.crop_seasons where season_type_id = f.season_type_id;
  if s.l_ini_d is null or s.l_dev_d is null or s.l_mid_d is null or s.l_late_d is null then
    raise exception 'season values are not ready' using errcode = '23514';
  end if;
  v_len := s.l_ini_d + s.l_dev_d + s.l_mid_d + s.l_late_d;
  -- season_end_mmdd 는 끝 계산에 쓰지 않는다 (1/1 에는 화면이 받지 않는다. 값이 있을 때의 규칙은 나중 판)

  select * into w from public.farm_season_window(f.season_start_mmdd, v_len, p_today);
  cur := public.farm_current_season(p_farm_id, p_today);

  -- 지금 줄 말고 끝이 오늘 이후인 다른 줄은 있을 수 없다. 혹시 있으면 지운다.
  delete from public.farm_seasons
   where farm_id = p_farm_id and end_date >= p_today
     and (cur.farm_season_id is null or farm_season_id <> cur.farm_season_id);

  -- 지난 줄이 새 줄과 겹치면 지난 줄의 끝을 새 줄 시작 전날로 자른다. 통째로 새 줄 안에 들어가면 지운다.
  delete from public.farm_seasons
   where farm_id = p_farm_id and end_date < p_today and start_date >= w.start_date;
  update public.farm_seasons
     set end_date = w.start_date - 1
   where farm_id = p_farm_id and end_date < p_today
     and start_date < w.start_date and end_date >= w.start_date;

  if cur.farm_season_id is not null then
    update public.farm_seasons
       set crop_id = f.crop_id,
           season_type_id = f.season_type_id,
           kc_set_id = f.kc_set_id,
           start_date = w.start_date,
           end_date = w.end_date,
           start_unset = w.start_unset
     where farm_season_id = cur.farm_season_id
       and (crop_id, season_type_id, kc_set_id, start_date, end_date, start_unset)
           is distinct from
           (f.crop_id, f.season_type_id, f.kc_set_id, w.start_date, w.end_date, w.start_unset);
  else
    insert into public.farm_seasons (farm_id, crop_id, season_type_id, kc_set_id, start_date, end_date, start_unset)
    values (p_farm_id, f.crop_id, f.season_type_id, f.kc_set_id, w.start_date, w.end_date, w.start_unset);
  end if;
end;
$$;

revoke all on function public.sync_farm_seasons_at(uuid, date) from public, anon, authenticated, service_role;

-- 바깥: 오늘 = 한국 날짜. 서버 키(croplib-dp 정기 회차 02시)만 부를 수 있다(안쪽 함수 · 내부 함수는 서버 키도 못 부른다). 회원은 직접 못 부른다(남의 농장 id 를 넣는 길이 없게).
create or replace function public.sync_farm_seasons(p_farm_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.sync_farm_seasons_at(p_farm_id, public.kst_today());
$$;

revoke all on function public.sync_farm_seasons(uuid) from public, anon, authenticated;
grant execute on function public.sync_farm_seasons(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 11. 트리거
-- ---------------------------------------------------------------------------
-- 농장이 처음 생길 때: 빈 계산 상태 줄 + 작기 줄
create or replace function public.farms_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.farm_calc_status (farm_id) values (new.farm_id) on conflict (farm_id) do nothing;
  perform public.sync_farm_seasons_at(new.farm_id, public.kst_today());
  return new;
end;
$$;

revoke all on function public.farms_after_insert() from public, anon, authenticated, service_role;

drop trigger if exists farms_after_insert on public.farms;
create trigger farms_after_insert
  after insert on public.farms
  for each row execute function public.farms_after_insert();

-- 작물 설정 열이 실제로 바뀔 때: 작기 줄 고치기
create or replace function public.farms_after_update_crop()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_farm_seasons_at(new.farm_id, public.kst_today());
  return new;
end;
$$;

revoke all on function public.farms_after_update_crop() from public, anon, authenticated, service_role;

drop trigger if exists farms_after_update_crop on public.farms;
create trigger farms_after_update_crop
  after update of crop_id, season_type_id, kc_set_id, season_start_mmdd, season_end_mmdd on public.farms
  for each row
  when (
    old.crop_id is distinct from new.crop_id
    or old.season_type_id is distinct from new.season_type_id
    or old.kc_set_id is distinct from new.kc_set_id
    or old.season_start_mmdd is distinct from new.season_start_mmdd
    or old.season_end_mmdd is distinct from new.season_end_mmdd
  )
  execute function public.farms_after_update_crop();

-- 지점 · 토성 · 면적이 바뀔 때: 지금 작기 줄의 시작일부터 다시 계산 (지금 줄이 없는 작물 공통은 깨우지 않는다 — 계산할 것이 없음)
create or replace function public.farms_after_update_calc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur public.farm_seasons;
begin
  cur := public.farm_current_season(new.farm_id, public.kst_today());
  if cur.farm_season_id is not null then
    perform public.touch_farm_calc(new.farm_id, cur.start_date);
  end if;
  return new;
end;
$$;

revoke all on function public.farms_after_update_calc() from public, anon, authenticated, service_role;

drop trigger if exists farms_after_update_calc on public.farms;
create trigger farms_after_update_calc
  after update of stn_id, soil_code, irrigated_area_m2 on public.farms
  for each row
  when (
    old.stn_id is distinct from new.stn_id
    or old.soil_code is distinct from new.soil_code
    or old.irrigated_area_m2 is distinct from new.irrigated_area_m2
  )
  execute function public.farms_after_update_calc();

-- 작기 줄이 바뀔 때: 옛 시작일과 새 시작일 중 이른 날부터 다시 계산. 끝이 오늘 이후인 줄이 바뀔 때만 깨운다
-- (지난 줄을 자르는 것은 새 줄이 만들어지며 깨운다 — 자른 기간은 새 줄 시작일부터 다시 계산된다).
create or replace function public.farm_seasons_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.kst_today();
begin
  if tg_op = 'INSERT' then
    if new.end_date >= v_today then
      perform public.touch_farm_calc(new.farm_id, new.start_date);
    end if;
  elsif tg_op = 'UPDATE' then
    if (old.end_date >= v_today or new.end_date >= v_today)
       and (old.crop_id, old.season_type_id, old.kc_set_id, old.start_date, old.end_date)
           is distinct from
           (new.crop_id, new.season_type_id, new.kc_set_id, new.start_date, new.end_date) then
      perform public.touch_farm_calc(new.farm_id, least(old.start_date, new.start_date));
    end if;
  else
    if old.end_date >= v_today then
      perform public.touch_farm_calc(old.farm_id, old.start_date);
    end if;
  end if;
  return null;
end;
$$;

revoke all on function public.farm_seasons_touch() from public, anon, authenticated, service_role;

drop trigger if exists farm_seasons_touch on public.farm_seasons;
create trigger farm_seasons_touch
  after insert or update or delete on public.farm_seasons
  for each row execute function public.farm_seasons_touch();

-- 관수 기록 날짜 규칙 (DB 가 지킨다): 그 농장의 지금 작기 줄 시작일 ~ 오늘(한국 날짜)만.
--   미래 · 작기 밖 · 작기 줄이 없는 농장(작물 공통)은 거절. 넣기는 늘 검사하고, 고칠 때는 날짜(나 농장)가 바뀔 때만 검사한다 —
--   작기 시작일을 바꿔 작기 밖이 된 기존 기록의 메모 · 양은 고칠 수 있다. 지우기는 언제나 된다(이 트리거는 지울 때 안 돈다).
create or replace function public.irrigation_logs_check_date()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_today date := public.kst_today();
  cur     public.farm_seasons;
begin
  if tg_op = 'UPDATE' and new.date = old.date and new.farm_id = old.farm_id then
    return new;
  end if;

  cur := public.farm_current_season(new.farm_id, v_today);
  if cur.farm_season_id is null or new.date < cur.start_date or new.date > v_today then
    raise exception 'irrigation log date must be within the current season up to today'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.irrigation_logs_check_date() from public, anon, authenticated, service_role;

drop trigger if exists irrigation_logs_check_date on public.irrigation_logs;
create trigger irrigation_logs_check_date
  before insert or update on public.irrigation_logs
  for each row execute function public.irrigation_logs_check_date();

-- 관수 기록이 바뀌면: 그 날(고칠 때는 옛 날과 새 날 중 이른 날)부터 다시 계산. 메모만 고친 것은 깨우지 않는다.
create or replace function public.irrigation_logs_touch()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.touch_farm_calc(new.farm_id, new.date);
  elsif tg_op = 'UPDATE' then
    if (old.date, old.volume_l, old.input_unit) is distinct from (new.date, new.volume_l, new.input_unit) then
      perform public.touch_farm_calc(new.farm_id, least(old.date, new.date));
    end if;
  else
    perform public.touch_farm_calc(old.farm_id, old.date);
  end if;
  return null;
end;
$$;

revoke all on function public.irrigation_logs_touch() from public, anon, authenticated, service_role;

drop trigger if exists irrigation_logs_touch on public.irrigation_logs;
create trigger irrigation_logs_touch
  after insert or update or delete on public.irrigation_logs
  for each row execute function public.irrigation_logs_touch();

-- ---------------------------------------------------------------------------
-- 12. 매분 보충 예약 (이름 croplib-farm-calc-sweep, 같은 이름이면 덮어쓴다). pg_cron 시각은 UTC 라 매분은 상관없다.
--     "마지막 깨우기 뒤에 들어온 기다리는 요청"이 없으면 가벼운 조회 한 번으로 끝난다.
--     멈추기: select cron.unschedule('croplib-farm-calc-sweep');
-- ---------------------------------------------------------------------------
select cron.schedule('croplib-farm-calc-sweep', '* * * * *', $cron$select ops.farm_calc_sweep()$cron$);
