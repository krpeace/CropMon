-- 목적: 데이터 계약 v2.5. 옛 적산 표 heat_daily · sun_daily 를 지운다 (이슈 #211, 결정 0074, D1-3 3-②).
--       같은 값은 계열 표 heat_series_daily · sun_series_daily (v2.2) 에 있고,
--       화면은 결정 0072 부터, croplib-dp 는 2026-11-26 09:20 회차부터 옛 표를 쓰지 않는다.
--
-- !! 되돌릴 수 없다. 되돌리기 SQL(supabase/checks/d1_3b_drop_old_rollback.sql)은 빈 표만 다시 만들고 줄은 살리지 못한다.
--
-- 실행 방법:
--   1. 되돌리기 SQL 파일을 SQL Editor 새 창에 열어 둔다 (실행하지 않는다).
--   2. 이 파일 내용을 모두 붙여 넣고 Run.
--   3. supabase/checks/d1_3b_drop_old_check.sql 을 Run 해서 all_ok 를 확인한다.
--   여러 번 실행해도 오류가 나지 않는다.
--
-- cascade 를 쓰지 않는다: 무언가 이 표에 기대고 있으면 지우지 않고 실패하는 쪽이 안전하다.
-- 표에 딸린 정책 · 트리거 · 색인 · 제약은 표와 함께 사라진다. 함수 set_updated_at() 은 다른 표가 쓰므로 남는다.
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v2.5)

drop table if exists public.heat_daily;
drop table if exists public.sun_daily;
