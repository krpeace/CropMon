-- 목적: weather_daily 에 일사 산출 출처(rs_source) 칸 추가 (croplib-dp #28 C7, #76 선행).
--       ETo 계산에 쓴 일사의 출처: observed(관측), sunshine(일조시간 추정), temp_range(기온차 추정). 비어 있으면 일사 없음.
--
-- 실행 방법:
--   1. Supabase 대시보드 → SQL Editor 에 이 파일 내용을 붙여 넣고 Run 을 누른다.
--   2. 여러 번 실행해도 오류가 나지 않는다 (add column if not exists, do 블록 제약조건).
--
-- 자동 검사: src/infra/supabase/contract.test.ts 가 열 추가 및 제약조건을 검사한다.

alter table public.weather_daily
  add column if not exists rs_source text null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'weather_daily_rs_source_check'
  ) then
    alter table public.weather_daily
      add constraint weather_daily_rs_source_check
      check (rs_source is null or rs_source in ('observed', 'sunshine', 'temp_range'));
  end if;
end $$;
