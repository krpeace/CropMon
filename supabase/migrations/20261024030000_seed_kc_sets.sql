-- 목적: 데이터 계약 v1.1 의 사전 자료. 재배 방식별 Kc 와 기본 계산 조건을 넣는다.
--       값의 근거는 docs/DATA_CONTRACT.md 와 docs/decisions/0005-kc-sets.md.
--
-- 실행 방법:
--   1. 먼저 20261024020000_data_contract_v1_1.sql 까지 이름 순서대로 실행해 둔다.
--   2. Supabase 대시보드 → SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run 을 누른다.
--   여러 번 실행해도 오류가 나지 않는다. 같은 키가 있으면 값만 이 파일 내용으로 고친다.
--
-- 값을 고칠 때는 이 파일을 고치지 말고, 고친 값을 담은 새 파일을 더한다.
-- 자동 검사: src/infra/supabase/seed.test.ts

-- 1. 재배 방식별 Kc (FAO-56 Table 12, cropwater crops_library.csv 와 같은 값)
--    사과: 축 1 = 청경 재배(과원 바닥에 풀 없음) / 초생 재배(풀을 키움), 축 2 = 서리 지역 / 서리 없는 지역.
--    한국 사과원은 대개 3번(초생 재배, 서리 지역)이라 기본으로 둔다. 화면 순서(sort_order)도 3번이 처음.
insert into public.crop_kc_sets (kc_set_id, crop_id, set_no, name_ko, note, kc_ini, kc_mid, kc_end, is_default, sort_order, source) values
  ('apple-k3', 'apple', 3, '초생 재배, 서리 지역', '과원 바닥에 풀을 키우는 경우. 한국 사과원 대부분', 0.50, 1.20, 0.95, true, 1, 'FAO-56 Table 12 Apples (active ground cover, killing frost)'),
  ('apple-k1', 'apple', 1, '청경 재배, 서리 지역', '과원 바닥에 풀이 없는 경우', 0.45, 0.95, 0.70, false, 2, 'FAO-56 Table 12 Apples (no ground cover, killing frost)'),
  ('apple-k4', 'apple', 4, '초생 재배, 서리 없는 지역', '풀을 키우고 겨울 서리가 드문 곳', 0.80, 1.20, 0.85, false, 3, 'FAO-56 Table 12 Apples (active ground cover, no frosts)'),
  ('apple-k2', 'apple', 2, '청경 재배, 서리 없는 지역', '풀이 없고 겨울 서리가 드문 곳', 0.60, 0.95, 0.75, false, 4, 'FAO-56 Table 12 Apples (no ground cover, no frosts)'),
  ('kimchi_cabbage-k1', 'kimchi_cabbage', 1, '기본', '양배추 값 임시 적용. 태백 실측으로 보정 예정', 0.70, 1.05, 0.95, true, 1, 'FAO-56 Table 12 Cabbage (cropwater crops_library.csv)')
on conflict (kc_set_id) do update set
  crop_id = excluded.crop_id, set_no = excluded.set_no, name_ko = excluded.name_ko, note = excluded.note,
  kc_ini = excluded.kc_ini, kc_mid = excluded.kc_mid, kc_end = excluded.kc_end,
  is_default = excluded.is_default, sort_order = excluded.sort_order, source = excluded.source;

-- 2. 작물 사전의 Kc 칸은 기본 재배 방식 값으로 맞춘다 (계산은 crop_kc_sets 를 쓴다).
update public.crops c
  set kc_ini = k.kc_ini, kc_mid = k.kc_mid, kc_end = k.kc_end
  from public.crop_kc_sets k
  where k.crop_id = c.crop_id and k.is_default;

update public.crops
  set source = 'FAO-56 Table 12. Kc 는 재배 방식별 표(crop_kc_sets)의 기본값'
  where crop_id = 'apple';

-- 3. 기본 계산 조건: 지점 10곳 × (사과 재배 방식 4 + 배추 1) = 50개, 양토, 2026, 작물별 기본 작형.
--    이름 = 지점-작형-k재배방식번호-토성-연도. 지점·작물마다 기본 재배 방식 조건이 기본(is_default).
--    TAW = 1000·(FC−WP)·Zr [FAO-56 식 82], RAW = p·TAW [식 83]. 양토 FC 0.25, WP 0.12.
--    작기 끝 = 시작 + 생육단계 일수 합 − 1 (사과 4/1~10/27, 여름배추 7/1~9/28).
insert into public.scenarios (scenario_id, stn_id, crop_id, season_type_id, kc_set_id, soil_code, season_year, season_start, season_end, dr0_mm, taw_mm, raw_mm, is_default) values
  ('101-apple-main-k3-loam-2026', '101', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('101-apple-main-k1-loam-2026', '101', 'apple', 'apple-main', 'apple-k1', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('101-apple-main-k4-loam-2026', '101', 'apple', 'apple-main', 'apple-k4', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('101-apple-main-k2-loam-2026', '101', 'apple', 'apple-main', 'apple-k2', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('101-kimchi_cabbage-summer-k1-loam-2026', '101', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('216-apple-main-k3-loam-2026', '216', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('216-apple-main-k1-loam-2026', '216', 'apple', 'apple-main', 'apple-k1', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('216-apple-main-k4-loam-2026', '216', 'apple', 'apple-main', 'apple-k4', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('216-apple-main-k2-loam-2026', '216', 'apple', 'apple-main', 'apple-k2', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('216-kimchi_cabbage-summer-k1-loam-2026', '216', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('119-apple-main-k3-loam-2026', '119', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('119-apple-main-k1-loam-2026', '119', 'apple', 'apple-main', 'apple-k1', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('119-apple-main-k4-loam-2026', '119', 'apple', 'apple-main', 'apple-k4', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('119-apple-main-k2-loam-2026', '119', 'apple', 'apple-main', 'apple-k2', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('119-kimchi_cabbage-summer-k1-loam-2026', '119', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('131-apple-main-k3-loam-2026', '131', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('131-apple-main-k1-loam-2026', '131', 'apple', 'apple-main', 'apple-k1', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('131-apple-main-k4-loam-2026', '131', 'apple', 'apple-main', 'apple-k4', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('131-apple-main-k2-loam-2026', '131', 'apple', 'apple-main', 'apple-k2', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('131-kimchi_cabbage-summer-k1-loam-2026', '131', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('129-apple-main-k3-loam-2026', '129', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('129-apple-main-k1-loam-2026', '129', 'apple', 'apple-main', 'apple-k1', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('129-apple-main-k4-loam-2026', '129', 'apple', 'apple-main', 'apple-k4', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('129-apple-main-k2-loam-2026', '129', 'apple', 'apple-main', 'apple-k2', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('129-kimchi_cabbage-summer-k1-loam-2026', '129', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('146-apple-main-k3-loam-2026', '146', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('146-apple-main-k1-loam-2026', '146', 'apple', 'apple-main', 'apple-k1', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('146-apple-main-k4-loam-2026', '146', 'apple', 'apple-main', 'apple-k4', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('146-apple-main-k2-loam-2026', '146', 'apple', 'apple-main', 'apple-k2', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('146-kimchi_cabbage-summer-k1-loam-2026', '146', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('156-apple-main-k3-loam-2026', '156', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('156-apple-main-k1-loam-2026', '156', 'apple', 'apple-main', 'apple-k1', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('156-apple-main-k4-loam-2026', '156', 'apple', 'apple-main', 'apple-k4', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('156-apple-main-k2-loam-2026', '156', 'apple', 'apple-main', 'apple-k2', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('156-kimchi_cabbage-summer-k1-loam-2026', '156', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('136-apple-main-k3-loam-2026', '136', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('136-apple-main-k1-loam-2026', '136', 'apple', 'apple-main', 'apple-k1', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('136-apple-main-k4-loam-2026', '136', 'apple', 'apple-main', 'apple-k4', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('136-apple-main-k2-loam-2026', '136', 'apple', 'apple-main', 'apple-k2', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('136-kimchi_cabbage-summer-k1-loam-2026', '136', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('192-apple-main-k3-loam-2026', '192', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('192-apple-main-k1-loam-2026', '192', 'apple', 'apple-main', 'apple-k1', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('192-apple-main-k4-loam-2026', '192', 'apple', 'apple-main', 'apple-k4', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('192-apple-main-k2-loam-2026', '192', 'apple', 'apple-main', 'apple-k2', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('192-kimchi_cabbage-summer-k1-loam-2026', '192', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('189-apple-main-k3-loam-2026', '189', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('189-apple-main-k1-loam-2026', '189', 'apple', 'apple-main', 'apple-k1', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('189-apple-main-k4-loam-2026', '189', 'apple', 'apple-main', 'apple-k4', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('189-apple-main-k2-loam-2026', '189', 'apple', 'apple-main', 'apple-k2', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, false),
  ('189-kimchi_cabbage-summer-k1-loam-2026', '189', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true)
on conflict (scenario_id) do update set
  stn_id = excluded.stn_id, crop_id = excluded.crop_id, season_type_id = excluded.season_type_id,
  kc_set_id = excluded.kc_set_id, soil_code = excluded.soil_code, season_year = excluded.season_year,
  season_start = excluded.season_start, season_end = excluded.season_end, dr0_mm = excluded.dr0_mm,
  taw_mm = excluded.taw_mm, raw_mm = excluded.raw_mm, is_default = excluded.is_default;
