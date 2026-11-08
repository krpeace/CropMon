-- 목적: 데이터 계약 v1.9. 토양수분(soil_water_daily)의 지점·토성별 최신 1줄을 돌려주는 뷰 soil_water_latest 추가 (#82).
-- 전 지점 확대(croplib-dp #28 S2) 때 1,000줄 제한 절단으로 인한 지점 누락을 방지하고 읽기량을 줄인다.
--
-- 실행 방법:
--   1. 먼저 이름이 앞선 마이그레이션 파일(특히 20261108000000_data_contract_v1_8.sql)을 모두 실행해 둔다.
--   2. Supabase 대시보드 → SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run 을 누른다.
--   여러 번 실행해도 오류가 나지 않는다.
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v1.9)

-- 1. 지점·토성별 최신 정렬을 위한 복합 색인
create index if not exists idx_soil_water_daily_stn_soil_date_desc
  on public.soil_water_daily (stn_id, soil_code, date desc);

-- 2. 한국 기준 최근 7일 이내 지점·토성별 최신 1줄 뷰
--    with (security_invoker = true) 로 기본 테이블의 RLS 정책을 따른다.
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

-- 3. 읽기 권한: 비회원·회원에게 select 만 부여 (기본 테이블의 기존 권한은 유지)
grant select on public.soil_water_latest to anon, authenticated;
