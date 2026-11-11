-- 목적: 데이터 계약 v1.10. 토양수분 최신 뷰 soil_water_latest 에 filled 열을 추가한다 (이슈 #128).
-- water_balance_daily / soil_water_daily 의 filled = true 는 기상 결측을 메운 값의 영향을 받는 날(Dr = 0 전까지)을 뜻한다.
-- 화면이 종합표 작물 공통(토양) 카드와 갱신 줄에서도 추정 포함 여부를 구분해 표시할 수 있도록 마지막 열에 filled 를 더한다.
-- (PostgreSQL create or replace view 는 기존 열 목록 뒤에 새 열을 붙이는 방식만 허용하므로 status 뒤에 추가한다.)
--
-- 실행 순서:
--   1. Supabase 대시보드 → SQL Editor 에서 이 파일 내용을 모두 실행한다 (create or replace view 이므로 여러 번 실행해도 안전).
--   2. 아래 확인 조회 2개로 뷰 열 목록에 filled 가 포함되었는지, 1,164행 내외 정상 반환되는지 확인한다.
--   3. 확인이 끝나면 PR 을 main 에 병합한다.
--
-- 확인 조회:
--   select column_name, data_type
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'soil_water_latest'
--   order by ordinal_position;
--   -- 기대: stn_id, soil_code, date, dr_mm, taw_mm, raw_mm, aw_pct, status, filled (9열)
--
--   select filled, count(*) as row_cnt
--   from public.soil_water_latest
--   group by filled;
--
-- 되돌리기 SQL (v1.9 복구 — 열 제거는 create or replace view 로 불가하므로 drop 후 재생성):
--   drop view if exists public.soil_water_latest;
--   create view public.soil_water_latest
--   with (security_invoker = true)
--   as
--   select distinct on (stn_id, soil_code)
--     stn_id,
--     soil_code,
--     date,
--     dr_mm,
--     taw_mm,
--     raw_mm,
--     aw_pct,
--     status
--   from public.soil_water_daily
--   where date >= ((now() at time zone 'Asia/Seoul')::date - 7)
--   order by stn_id, soil_code, date desc;
--   grant select on public.soil_water_latest to anon, authenticated;
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v1.10)

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
  status,
  filled
from public.soil_water_daily
where date >= ((now() at time zone 'Asia/Seoul')::date - 7)
order by stn_id, soil_code, date desc;

grant select on public.soil_water_latest to anon, authenticated;
