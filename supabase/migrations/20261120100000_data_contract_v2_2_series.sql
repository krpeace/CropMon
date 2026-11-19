-- 목적: 데이터 계약 v2.2 (이슈 #186, 결정 0063) — D1-3 1단계. 적산 계열 새 표 둘과 "어떤 계열이 있나" 뷰를 더한다. 화면 변경은 없다.
--
-- 적산온도는 작목 기준온도와 기상청 기온만으로 계산하므로, 값을 가르는 것은 작물이 아니라 **기준온도**와 **누적 시작 월-일** 둘뿐이다.
-- 이 짝을 "적산 계열"이라 부른다. 지금 heat_daily(지점 × 작물 × 날짜)와 sun_daily(지점 × 날짜)는 누적이 모두 1월 1일부터라
-- 포도 비가림(04-20부터)을 담을 수 없다. 그래서 새 이름의 표를 따로 만든다 (옛 표의 기본 키를 고치지 않는다 —
-- PostgREST on_conflict 는 열 이름 목록만 받고 부분 색인을 못 쓰며, 키를 바꾸면 croplib-dp 의 지금 쓰기가 즉시 깨진다).
--
-- 세 단계 (두 저장소가 11/19에 정했다):
--   1. CropMon 이 새 표 · 뷰를 넣는다 — 이 파일. **옛 heat_daily · sun_daily 는 한 글자도 바꾸지 않는다.**
--      croplib-dp 가 계속 옛 키로 써도, 지금 화면이 옛 표를 읽어도 아무것도 안 깨진다.
--   2. croplib-dp 가 새 표에도 쓰기 시작한다 (croplib-dp 이슈).
--   3. CropMon 화면이 새 표로 읽기를 바꾸고 옛 표 · 옛 줄을 지운다 (D1-3 2단계).
--
-- 만드는 것:
--   public.heat_series_daily     적산온도 계열 × 날짜. 키 (stn_id, t_base_c, cum_start_mmdd, date). crop_id 열 없음.
--   public.sun_series_daily      적산일사 계열 × 날짜. 키 (stn_id, cum_start_mmdd, date).
--   public.crop_accum_series     작목 · 작형이 어느 계열을 쓰는지 한 곳에서 알려 주는 뷰 (croplib-dp 와 화면이 같은 규칙으로 계열을 찾는다)
--
-- 실행 방법:
--   1. 운영 DB 를 바꾸기 전에: supabase/checks/d1_3a_series_rollback.sql (되돌리기)을 열어 둔다(실행하지 않음).
--      이 파일은 새 표 · 새 뷰 · 새 트리거만 만들고 기존 표는 건드리지 않는다.
--   2. 먼저 20261120000000_data_contract_v2_1_farms.sql 까지 실행해 둔다 (is_valid_mmdd 함수와 crop_seasons.cum_start_mmdd 가 필요하다).
--   3. SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run. 여러 번 실행해도 오류가 나지 않는다.
--   4. supabase/checks/d1_3a_series_check.sql 을 붙여 넣고 Run → 맨 끝 줄 all_ok = true 인지 본다 (아무것도 남기지 않는다).
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v2.2)

-- ---------------------------------------------------------------------------
-- 1. heat_series_daily: 적산온도 계열 × 날짜
--    누적(gdd_cum) · 평년 누적(gdd_normal_cum) · 며칠 빠른가(lead_days)는 그 계열의 누적 시작(cum_start_mmdd)부터 센다 (계산은 croplib-dp).
--    t_base_c 는 키의 일부(숫자)라 4 와 4.0 은 같은 키다. 범위는 crops.t_base_c 와 같다.
--    해를 넘는 누적 시작(예: 12-01)은 1/1 계열에 없다 — 그때 "작기 해" 열이 필요한지 그때 정한다 (지금 열을 만들지 않는다).
-- ---------------------------------------------------------------------------
create table if not exists public.heat_series_daily (
  stn_id          text not null references public.stations (stn_id),
  t_base_c        numeric not null check (t_base_c between -10 and 30),
  cum_start_mmdd  text not null check (public.is_valid_mmdd(cum_start_mmdd)),
  date            date not null,
  gdd_day         numeric,
  gdd_cum         numeric,
  gdd_normal_day  numeric,
  gdd_normal_cum  numeric,
  lead_days       int,
  normal_from     int not null,
  normal_to       int not null,
  filled          boolean not null default false,
  calc_version    text not null,
  updated_at      timestamptz not null default now(),
  primary key (stn_id, t_base_c, cum_start_mmdd, date)
);

-- ---------------------------------------------------------------------------
-- 2. sun_series_daily: 적산일사 계열 × 날짜
-- ---------------------------------------------------------------------------
create table if not exists public.sun_series_daily (
  stn_id            text not null references public.stations (stn_id),
  cum_start_mmdd    text not null check (public.is_valid_mmdd(cum_start_mmdd)),
  date              date not null,
  rs_day_mj         numeric,
  rs_cum_mj         numeric,
  rs_normal_day_mj  numeric,
  rs_normal_cum_mj  numeric,
  normal_from       int not null,
  normal_to         int not null,
  filled            boolean not null default false,
  calc_version      text not null,
  updated_at        timestamptz not null default now(),
  primary key (stn_id, cum_start_mmdd, date)
);

-- 고쳐 쓸 때(upsert 포함) updated_at 을 지금으로 (public.set_updated_at() 은 v1.8 에서 만들었다)
drop trigger if exists heat_series_daily_set_updated_at on public.heat_series_daily;
create trigger heat_series_daily_set_updated_at
  before update on public.heat_series_daily
  for each row execute function public.set_updated_at();

drop trigger if exists sun_series_daily_set_updated_at on public.sun_series_daily;
create trigger sun_series_daily_set_updated_at
  before update on public.sun_series_daily
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. 권한: 누구나 읽기만. 쓰기는 croplib-dp 의 서버 키(service role)만 한다 (옛 heat_daily · sun_daily 와 같음).
-- ---------------------------------------------------------------------------
alter table public.heat_series_daily enable row level security;
revoke all on public.heat_series_daily from anon, authenticated;
grant select on public.heat_series_daily to anon, authenticated;
drop policy if exists "heat_series_daily 누구나 읽기" on public.heat_series_daily;
create policy "heat_series_daily 누구나 읽기"
  on public.heat_series_daily
  for select
  to anon, authenticated
  using (true);

alter table public.sun_series_daily enable row level security;
revoke all on public.sun_series_daily from anon, authenticated;
grant select on public.sun_series_daily to anon, authenticated;
drop policy if exists "sun_series_daily 누구나 읽기" on public.sun_series_daily;
create policy "sun_series_daily 누구나 읽기"
  on public.sun_series_daily
  for select
  to anon, authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 4. crop_accum_series: 어떤 계열이 있나 — 규칙이 두 저장소 코드가 아니라 이 뷰 한 곳에 있다.
--    croplib-dp 는 이 뷰의 distinct (heat_t_base_c, heat_cum_start_mmdd) 와 distinct sun_cum_start_mmdd 를 계산하고,
--    화면은 작목 · 작형의 계열을 이 뷰로 찾는다. 사전(crops · crop_seasons)을 고치면 뷰가 따라 바뀐다.
--
--    줄: 단계 일수 네 개(l_ini_d · l_dev_d · l_mid_d · l_late_d)가 모두 있는 작형마다 한 줄 + 작물 공통(common) 한 줄.
--        (D1-2 결정 0062 와 같은 기준. cum_start_mmdd 가 비었는지로 거르면 시설가온 — 적산온도는 비우지만 일사 계열은 있음 — 이 빠진다.)
--    heat_t_base_c · heat_cum_start_mmdd: crops.t_base_c · crop_seasons.cum_start_mmdd. 둘 중 하나라도 비면 둘 다 비움 = 적산온도를 내지 않음.
--    sun_cum_start_mmdd: coalesce(crop_seasons.cum_start_mmdd, '01-01'). 작물 공통은 작형이 없어 01-01 고정(적산온도는 crops 의 common 줄 기준온도).
--    security_invoker: 읽는 사람의 권한으로 crops · crop_seasons 를 읽는다 (두 표 모두 anon · authenticated 읽기가 열려 있다).
-- ---------------------------------------------------------------------------
create or replace view public.crop_accum_series
with (security_invoker = true)
as
select
  cs.crop_id,
  cs.season_type_id,
  case when cs.cum_start_mmdd is not null and c.t_base_c is not null then c.t_base_c end as heat_t_base_c,
  case when cs.cum_start_mmdd is not null and c.t_base_c is not null then cs.cum_start_mmdd end as heat_cum_start_mmdd,
  coalesce(cs.cum_start_mmdd, '01-01') as sun_cum_start_mmdd
from public.crop_seasons cs
join public.crops c on c.crop_id = cs.crop_id
where cs.l_ini_d is not null
  and cs.l_dev_d is not null
  and cs.l_mid_d is not null
  and cs.l_late_d is not null
union all
select
  c.crop_id,
  null::text as season_type_id,
  c.t_base_c as heat_t_base_c,
  case when c.t_base_c is not null then '01-01' end as heat_cum_start_mmdd,
  '01-01' as sun_cum_start_mmdd
from public.crops c
where c.crop_id = 'common';

revoke all on public.crop_accum_series from anon, authenticated;
grant select on public.crop_accum_series to anon, authenticated;
