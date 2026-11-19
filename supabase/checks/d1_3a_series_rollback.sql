-- 되돌리기 SQL: 적산 계열 새 표 · 뷰 (데이터 계약 v2.2, 이슈 #186, 결정 0063, D1-3 1단계)
--
-- 실행하지 않는다. 마이그레이션 20261120100000_data_contract_v2_2_series.sql 이 만든 것을 지우고 싶을 때만
-- SQL Editor 에서 Run. 여러 번 실행해도 오류가 나지 않는다.
--
-- 먼저 확인한다: **새 표(heat_series_daily · sun_series_daily)에 줄이 하나라도 있으면 오류로 멈추고 아무것도 지우지 않는다.**
-- croplib-dp 가 새 표에 쓰기 시작한 뒤(2단계)에는 이 되돌리기를 쓰면 안 된다 — 쓴 값이 사라지고 croplib-dp 쓰기가 실패한다.
-- 지우는 것: 뷰 → 표 둘(딸린 트리거 · 정책 · 키가 함께 지워진다).
-- 남기는 것: public.set_updated_at() · public.is_valid_mmdd() (다른 표가 쓴다), 옛 heat_daily · sun_daily (이 파일은 건드리지 않는다).

do $pre$
declare
  n bigint := 0;
begin
  if to_regclass('public.heat_series_daily') is not null then
    execute 'select count(*) from public.heat_series_daily' into n;
    if n > 0 then
      raise exception '되돌리기를 멈춥니다: heat_series_daily 에 줄이 % 개 있습니다. croplib-dp 가 새 표에 쓰기 시작한 뒤에는 되돌리지 않습니다.', n;
    end if;
  end if;
  if to_regclass('public.sun_series_daily') is not null then
    execute 'select count(*) from public.sun_series_daily' into n;
    if n > 0 then
      raise exception '되돌리기를 멈춥니다: sun_series_daily 에 줄이 % 개 있습니다. croplib-dp 가 새 표에 쓰기 시작한 뒤에는 되돌리지 않습니다.', n;
    end if;
  end if;
end
$pre$;

drop view if exists public.crop_accum_series;
drop table if exists public.sun_series_daily;
drop table if exists public.heat_series_daily;
