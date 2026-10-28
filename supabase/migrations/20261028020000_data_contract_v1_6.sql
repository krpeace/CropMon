-- 목적: 데이터 계약 v1.6. 지점 사전(stations)에 지역 고르기와 현행화에 필요한 열 5개를 더한다 (#38, 결정 0021).
--       시·도 약칭(sido), 대표 지점 10곳 여부(is_representative), 운영 여부(is_active),
--       일사 관측 여부(measures_sunlight), 기상청 동기화 시각(synced_at).
--
-- 실행 방법:
--   1. 먼저 이름이 앞선 마이그레이션 파일을 모두 실행해 둔다.
--   2. Supabase 대시보드 → SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run 을 누른다.
--   3. 이어서 20261028030000_seed_stations_asos.sql 을 실행한다.
--   여러 번 실행해도 오류가 나지 않는다.
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v1.6)

alter table public.stations
  add column if not exists sido text;

alter table public.stations
  add column if not exists is_representative boolean not null default false;

alter table public.stations
  add column if not exists is_active boolean not null default true;

alter table public.stations
  add column if not exists measures_sunlight boolean;

alter table public.stations
  add column if not exists synced_at timestamptz;
