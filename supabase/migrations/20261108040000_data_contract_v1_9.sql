-- 목적: 데이터 계약 v1.9 (이슈 #82).
-- 종합 화면 판정 표(작물 공통 토양 물 상태)의 읽기 누락 방지와 DB egress 절감을 위해
-- 지점·토성별 한국 기준 최근 7일 이내의 최신 1줄을 돌려주는 뷰 public.soil_water_latest 를 추가한다.
-- 운영 97곳 확대(croplib-dp #28 S2) 때 Supabase 1,000줄 제한 절단 누락을 방지하고,
-- 기본 키(stn_id, soil_code, date)를 활용해 최신 1줄만 빠르게 추출한다.
-- 여러 번 실행해도 안전하다.

-- 1. 지점·토성별 최신 1줄 보안 뷰 (한국 기준 최근 7일 이내)
create or replace view public.soil_water_latest
with (security_invoker = true)
as
select distinct on (stn_id, soil_code)
  stn_id,
  soil_code,
  date,
  dr_mm,
  taw_mm,
  raw_mm,
  aw_pct,
  status
from public.soil_water_daily
where date >= ((now() at time zone 'Asia/Seoul')::date - 7)
order by stn_id, soil_code, date desc;

-- 2. 권한 정리: 기본 권한을 먼저 거두고 select 읽기 권한만 부여
revoke all on public.soil_water_latest from anon, authenticated;
grant select on public.soil_water_latest to anon, authenticated;
