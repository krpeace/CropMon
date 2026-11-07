-- 목적: 2027년 대표 계산 조건(scenarios) 50개를 미리 넣는다 (#65).
--       2026년 기본 계산 조건(20261024030000_seed_kc_sets.sql 3절)에서 연도만 2027로 옮긴 것이다.
--       값의 근거는 docs/DATA_CONTRACT.md 와 docs/decisions/0005-kc-sets.md.
--
-- 실행 방법:
--   1. 먼저 20261030000000_common_gdd_stages.sql 까지 이름 순서대로 실행해 둔다.
--   2. Supabase 대시보드 → SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run 을 누른다.
--   여러 번 실행해도 오류가 나지 않는다. 같은 키가 있으면 값만 이 파일 내용으로 고친다.
--
-- 값을 고칠 때는 이 파일을 고치지 말고, 고친 값을 담은 새 파일을 더한다.
-- 자동 검사: src/infra/supabase/seed.test.ts

-- 2027년 기본 계산 조건: 지점 10곳 × (사과 재배 방식 4 + 배추 1) = 50개, 양토, 2027, 작물별 기본 작형.
-- 이름 = 지점-작형-k재배방식번호-토성-연도. 지점·작물마다 기본 재배 방식 조건이 기본(is_default).
-- TAW = 1000·(FC−WP)·Zr [FAO-56 식 82], RAW = p·TAW [식 83]. 양토 FC 0.25, WP 0.12.
-- 작기 끝 = 시작 + 생육단계 일수 합 − 1 (사과 4/1~10/27, 여름배추 7/1~9/28).
insert into public.scenarios (scenario_id, stn_id, crop_id, season_type_id, kc_set_id, soil_code, season_year, season_start, season_end, dr0_mm, taw_mm, raw_mm, is_default) values
  ('101-apple-main-k3-loam-2027', '101', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('101-apple-main-k1-loam-2027', '101', 'apple', 'apple-main', 'apple-k1', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('101-apple-main-k4-loam-2027', '101', 'apple', 'apple-main', 'apple-k4', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('101-apple-main-k2-loam-2027', '101', 'apple', 'apple-main', 'apple-k2', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('101-kimchi_cabbage-summer-k1-loam-2027', '101', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('216-apple-main-k3-loam-2027', '216', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('216-apple-main-k1-loam-2027', '216', 'apple', 'apple-main', 'apple-k1', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('216-apple-main-k4-loam-2027', '216', 'apple', 'apple-main', 'apple-k4', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('216-apple-main-k2-loam-2027', '216', 'apple', 'apple-main', 'apple-k2', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('216-kimchi_cabbage-summer-k1-loam-2027', '216', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('119-apple-main-k3-loam-2027', '119', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('119-apple-main-k1-loam-2027', '119', 'apple', 'apple-main', 'apple-k1', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('119-apple-main-k4-loam-2027', '119', 'apple', 'apple-main', 'apple-k4', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('119-apple-main-k2-loam-2027', '119', 'apple', 'apple-main', 'apple-k2', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('119-kimchi_cabbage-summer-k1-loam-2027', '119', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('131-apple-main-k3-loam-2027', '131', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('131-apple-main-k1-loam-2027', '131', 'apple', 'apple-main', 'apple-k1', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('131-apple-main-k4-loam-2027', '131', 'apple', 'apple-main', 'apple-k4', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('131-apple-main-k2-loam-2027', '131', 'apple', 'apple-main', 'apple-k2', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('131-kimchi_cabbage-summer-k1-loam-2027', '131', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('129-apple-main-k3-loam-2027', '129', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('129-apple-main-k1-loam-2027', '129', 'apple', 'apple-main', 'apple-k1', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('129-apple-main-k4-loam-2027', '129', 'apple', 'apple-main', 'apple-k4', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('129-apple-main-k2-loam-2027', '129', 'apple', 'apple-main', 'apple-k2', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('129-kimchi_cabbage-summer-k1-loam-2027', '129', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('146-apple-main-k3-loam-2027', '146', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('146-apple-main-k1-loam-2027', '146', 'apple', 'apple-main', 'apple-k1', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('146-apple-main-k4-loam-2027', '146', 'apple', 'apple-main', 'apple-k4', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('146-apple-main-k2-loam-2027', '146', 'apple', 'apple-main', 'apple-k2', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('146-kimchi_cabbage-summer-k1-loam-2027', '146', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('156-apple-main-k3-loam-2027', '156', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('156-apple-main-k1-loam-2027', '156', 'apple', 'apple-main', 'apple-k1', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('156-apple-main-k4-loam-2027', '156', 'apple', 'apple-main', 'apple-k4', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('156-apple-main-k2-loam-2027', '156', 'apple', 'apple-main', 'apple-k2', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('156-kimchi_cabbage-summer-k1-loam-2027', '156', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('136-apple-main-k3-loam-2027', '136', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('136-apple-main-k1-loam-2027', '136', 'apple', 'apple-main', 'apple-k1', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('136-apple-main-k4-loam-2027', '136', 'apple', 'apple-main', 'apple-k4', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('136-apple-main-k2-loam-2027', '136', 'apple', 'apple-main', 'apple-k2', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('136-kimchi_cabbage-summer-k1-loam-2027', '136', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('192-apple-main-k3-loam-2027', '192', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('192-apple-main-k1-loam-2027', '192', 'apple', 'apple-main', 'apple-k1', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('192-apple-main-k4-loam-2027', '192', 'apple', 'apple-main', 'apple-k4', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('192-apple-main-k2-loam-2027', '192', 'apple', 'apple-main', 'apple-k2', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('192-kimchi_cabbage-summer-k1-loam-2027', '192', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('189-apple-main-k3-loam-2027', '189', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('189-apple-main-k1-loam-2027', '189', 'apple', 'apple-main', 'apple-k1', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('189-apple-main-k4-loam-2027', '189', 'apple', 'apple-main', 'apple-k4', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('189-apple-main-k2-loam-2027', '189', 'apple', 'apple-main', 'apple-k2', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, false),
  ('189-kimchi_cabbage-summer-k1-loam-2027', '189', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true)
on conflict (scenario_id) do update set
  stn_id = excluded.stn_id, crop_id = excluded.crop_id, season_type_id = excluded.season_type_id,
  kc_set_id = excluded.kc_set_id, soil_code = excluded.soil_code, season_year = excluded.season_year,
  season_start = excluded.season_start, season_end = excluded.season_end, dr0_mm = excluded.dr0_mm,
  taw_mm = excluded.taw_mm, raw_mm = excluded.raw_mm, is_default = excluded.is_default;
