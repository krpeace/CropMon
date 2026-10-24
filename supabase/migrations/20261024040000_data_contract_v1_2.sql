-- 목적: 데이터 계약 v1.2.
--   1. 3일 전망(water_outlook)의 선행일을 0~4로 넓힌다. 저녁(17시) 회차는 D+1~D+4를 계산하는데 v1은 0~3만 받았다.
--   2. 응답 원문을 압축해 둘 비공개 Storage 버킷 raw 를 만든다. 공개 정책은 만들지 않는다(서버 키만 쓴다).
--
-- 실행 방법:
--   1. 먼저 이름이 앞선 마이그레이션 파일을 모두 실행해 둔다.
--   2. Supabase 대시보드 → SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run 을 누른다.
--   여러 번 실행해도 오류가 나지 않는다.
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v1.2), 결정 기록: docs/decisions/0006-contract-v1-2.md

-- ---------------------------------------------------------------------------
-- 1. water_outlook.lead_day: 0~3 → 0~4
--    v1 의 제약 이름은 PostgreSQL 이 붙인 water_outlook_lead_day_check 이다. 지우고 같은 이름으로 다시 만든다.
-- ---------------------------------------------------------------------------
alter table public.water_outlook drop constraint if exists water_outlook_lead_day_check;
alter table public.water_outlook
  add constraint water_outlook_lead_day_check check (lead_day between 0 and 4);

-- ---------------------------------------------------------------------------
-- 2. Storage 버킷 raw (비공개)
--    Supabase 가 아닌 PostgreSQL(테스트용)에는 storage 스키마가 없어서 건너뛴다.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public)
      values ('raw', 'raw', false)
      on conflict (id) do update set public = false;
  end if;
end
$$;
