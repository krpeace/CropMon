-- 확인 SQL: 옛 적산 표 지우기 (데이터 계약 v2.5, 이슈 #211, 결정 0074, D1-3 3-②)
--
-- 언제: 마이그레이션 20261126000000_data_contract_v2_5_drop_old_accum.sql 을 Run 한 뒤.
-- 방법: SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run. 읽기만 한다 (아무것도 바꾸지 않는다).
-- 결과: 한 줄. all_ok = true 면 통과.
--       heat_series_rows · sun_series_rows 는 PR 본문의 "실행 전 줄 수"와 같은지 눈으로 비교한다.

with c as (
  select
    to_regclass('public.heat_daily') is null as heat_daily_gone,
    to_regclass('public.sun_daily') is null as sun_daily_gone,
    to_regclass('public.heat_series_daily') is not null as heat_series_exists,
    to_regclass('public.sun_series_daily') is not null as sun_series_exists,
    to_regclass('public.crop_accum_series') is not null as series_view_exists,
    (select count(*) from public.heat_series_daily) as heat_series_rows,
    (select count(*) from public.sun_series_daily) as sun_series_rows
)
select
  c.*,
  (
    heat_daily_gone and sun_daily_gone
    and heat_series_exists and sun_series_exists and series_view_exists
    and heat_series_rows > 0 and sun_series_rows > 0
  ) as all_ok
from c;
