-- 물6: 단기예보를 받는 지점을 10곳 모두로 늘린다 (2026-10-25 사용자 결정, CropMon 결정 0012).
-- 사전 자료 파일(20261024010000_seed_dictionaries.sql)은 고치지 않고 이 파일로 값만 바꾼다. 테이블 구조는 그대로(계약 v1.3).
-- 여러 번 실행해도 결과가 같다.
--
-- 되돌리기(춘천만 남기기)가 필요하면 SQL Editor 에서 아래 한 줄을 실행한다:
--   update public.stations set has_forecast = (stn_id = '101');

update public.stations
set has_forecast = true
where has_forecast is distinct from true;
