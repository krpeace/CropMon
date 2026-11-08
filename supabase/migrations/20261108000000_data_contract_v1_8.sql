-- 목적: 데이터 계약 v1.8. 온도(heat_daily)·햇빛(sun_daily) 표에 "올린 시각" updated_at 을 더한다.
-- 온도·햇빛 화면의 "마지막 갱신 시각"이 ASOS 관측 받은 시각이 아니라,
-- 매일 09:20(KST) heat-sun 이 계산해 올린 시각을 보여 주기 위해서다 (결정 0035).
-- 여러 번 실행해도 오류가 나지 않는다. croplib-dp 는 고치지 않아도 된다 (upsert 때 트리거가 시각을 바꾼다).

-- 1. 올린 시각 열. 이미 있는 줄은 이 파일을 실행한 시각으로 채워지고, 다음 heat-sun 이 돌면 그 시각으로 바뀐다.
alter table public.heat_daily
  add column if not exists updated_at timestamptz not null default now();
alter table public.sun_daily
  add column if not exists updated_at timestamptz not null default now();

-- 2. 줄을 고쳐 쓸 때(insert ... on conflict do update 포함)마다 updated_at 을 지금으로 바꾼다.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 트리거 안에서만 쓰는 함수라 누구도 직접 부르지 못하게 한다.
revoke all on function public.set_updated_at() from public, anon, authenticated;

drop trigger if exists heat_daily_set_updated_at on public.heat_daily;
create trigger heat_daily_set_updated_at
  before update on public.heat_daily
  for each row execute function public.set_updated_at();

drop trigger if exists sun_daily_set_updated_at on public.sun_daily;
create trigger sun_daily_set_updated_at
  before update on public.sun_daily
  for each row execute function public.set_updated_at();
