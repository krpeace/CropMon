-- 되돌리기 SQL: 옛 적산 표 지우기(데이터 계약 v2.5, 이슈 #211, 결정 0074)
-- !! 줄은 살리지 못함 — 빈 표 두 개의 "구조"만 다시 만든다. 지워진 줄은 이 파일로 돌아오지 않는다.
--
-- 구조는 v1.4(20261026000000) + v1.8(20261108000000, updated_at 과 트리거)과 같고,
-- 권한은 지우기 직전 DB 의 값(비회원 · 회원은 읽기만, 서버 키는 전체)과 같다.
-- 방법: 필요할 때만 SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run. 여러 번 실행해도 오류가 나지 않는다.
-- 함수 public.set_updated_at() 은 v2.5 에서 지우지 않으므로 그대로 쓴다.

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
  updated_at timestamptz not null default now(),
  primary key (stn_id, crop_id, date)
);

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
  updated_at timestamptz not null default now(),
  primary key (stn_id, date)
);

alter table public.heat_daily enable row level security;
revoke all on public.heat_daily from anon, authenticated;
grant select on public.heat_daily to anon, authenticated;
grant all on public.heat_daily to service_role;
drop policy if exists "heat_daily 누구나 읽기" on public.heat_daily;
create policy "heat_daily 누구나 읽기"
  on public.heat_daily
  for select
  to anon, authenticated
  using (true);
drop trigger if exists heat_daily_set_updated_at on public.heat_daily;
create trigger heat_daily_set_updated_at
  before update on public.heat_daily
  for each row execute function public.set_updated_at();

alter table public.sun_daily enable row level security;
revoke all on public.sun_daily from anon, authenticated;
grant select on public.sun_daily to anon, authenticated;
grant all on public.sun_daily to service_role;
drop policy if exists "sun_daily 누구나 읽기" on public.sun_daily;
create policy "sun_daily 누구나 읽기"
  on public.sun_daily
  for select
  to anon, authenticated
  using (true);
drop trigger if exists sun_daily_set_updated_at on public.sun_daily;
create trigger sun_daily_set_updated_at
  before update on public.sun_daily
  for each row execute function public.set_updated_at();
