-- 목적: 데이터 계약 v2.4(이슈 #201, 결정 0070)의 사전 값. 포도 작목 `crops.grape` 의 적산온도 단계와 단계 이름. (구조 그대로, 사전 값만)
--
-- 실행 방법:
--   0. (선택, 권장) 먼저 supabase/checks/grape_gdd_check.sql 을 SQL Editor 에 붙여 넣고 Run → 맨 끝 줄 all_ok 가 true 인지 본다 (아무것도 남기지 않는다).
--   1. 20261024000000_data_contract_v1.sql ~ 20261120010000_seed_grape_dictionary.sql 까지 이미 실행되어 있어야 한다 (포도 줄 · 열 gdd_stage_labels 가 필요하다).
--   2. SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run. 여러 번 실행해도 결과가 같다 (같은 값을 다시 넣는다. source 글도 통째로 지정해 두 번 붙지 않는다).
--   3. 문제가 있을 때만 supabase/checks/grape_gdd_rollback.sql 을 Run (두 열을 다시 비우고 source 를 원래 글로 돌린다).
--
-- ⚠ 옛 포도 시드(20261120010000_seed_grape_dictionary.sql)를 다시 돌렸다면 이 파일도 이어서 돌린다.
--   옛 파일의 `on conflict … do update` 가 source 를 옛 글로 덮어쓰기 때문이다(단계 · 라벨 열은 건드리지 않는다). 마이그레이션을 이름 순서대로 모두 다시 돌리면 이 파일이 뒤에서 바로잡는다.
--   옛 파일은 고치지 않는다.
--
-- 값을 고칠 때는 이 파일을 고치지 말고, 고친 값을 담은 새 파일을 더한다.
-- 자동 검사: src/infra/supabase/seed.test.ts, contract.test.ts
--
-- 값(croplib-dp #126 확정, 2026-11-21): 만개 370 · 변색기 1040 · 수확기 2050 ℃.
--   근거: 기준온도 10 ℃, 04-20 부터 누적, 평년 2016–2025, 다섯 지점(구미 · 영천 · 상주 · 추풍령 · 거창) 평균을 10 단위로 반올림. 대표 품종 샤인머스캣.
--   `gdd_stages` 는 작목 한 줄에 붙는다. 적산을 내는 작형은 비가림(cum_start_mmdd = '04-20')뿐이고 시설가온은 적산온도를 내지 않으므로, 이 값은 사실상 비가림의 값이다.
--   단계 이름을 화면에 보여 주는 일은 이 파일의 범위 밖이다(G1 · G2).
update public.crops
  set gdd_stages = '{370,1040,2050}',
      gdd_stage_labels = '{"만개","변색기","수확기"}',
      source = 'FAO-56 Table 12 식용 포도, 대표 품종 샤인머스캣. 기준온도 10 °C: Paredes 2025b Table 3, Winkler 1944. 적산온도 단계(만개 370 · 변색기 1040 · 수확기 2050 ℃): 비가림 04-20 기준, 기준온도 10 °C, 평년 2016–2025, 구미 · 영천 · 상주 · 추풍령 · 거창 다섯 지점 평균을 10 단위로 반올림 (croplib-dp #126)'
  where crop_id = 'grape';
