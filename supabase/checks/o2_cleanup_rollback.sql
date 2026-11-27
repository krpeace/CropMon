-- 되돌리기 SQL: 정기 정리 O2 (이슈 #213, 결정 0075). ⚠ 이미 지운 계정은 되돌릴 수 없음 (지운 기록 줄도 같음)
--
-- 실행하지 않는다. 정기 정리를 멈추고 싶을 때만 SQL Editor 에서 Run. 여러 번 실행해도 오류가 나지 않는다.
-- 되돌리는 것: 예약 ops-cleanup-hourly 멈추기 → 함수 지우기. 표 · 줄은 건드리지 않는다.

select cron.unschedule(jobname) from cron.job where jobname = 'ops-cleanup-hourly';

drop function if exists ops.cleanup_accounts();
