-- 목적: 데이터 계약 v1 의 사전 자료(지점·작물·작형·토성)를 넣는다. 기본 계산 조건은 v1.1 파일로 옮겼다.
--       값의 근거는 docs/DATA_CONTRACT.md 와 docs/decisions/0004-data-contract-v1.md.
--
-- 실행 방법:
--   1. 먼저 20261024000000_data_contract_v1.sql 을 실행해 둔다 (표가 있어야 한다).
--   2. Supabase 대시보드 → SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run 을 누른다.
--   3. 이어서 20261024020000_data_contract_v1_1.sql, 20261024030000_seed_kc_sets.sql 을 실행한다.
--   여러 번 실행해도 오류가 나지 않는다. 같은 키가 있으면 값만 이 파일 내용으로 고친다.
--
-- 값을 고칠 때는 이 파일을 고치지 말고, 고친 값을 담은 새 파일을 더한다.
-- 자동 검사: src/infra/supabase/seed.test.ts 가 값과 계산(TAW, RAW, 작기 끝)을 다시 확인한다.

-- 1. 지점 10곳 (ASOS). 좌표·고도·풍속계 높이는 cropwater stations_backup.csv,
--    예보 격자는 cropwater kma_grid.py 로 계산 (춘천 73·134). 11/06 예보 수집은 춘천만.
insert into public.stations (stn_id, name_ko, lat, lon, elev_m, wind_height_m, grid_nx, grid_ny, has_forecast, sort_order) values
  ('101', '춘천', 37.90262, 127.7357, 75.82, 10.0, 73, 134, true, 1),
  ('216', '태백', 37.17038, 128.98929, 714.45, 16.0, 95, 119, false, 2),
  ('119', '수원', 37.25746, 126.983, 39.81, 18.7, 60, 120, false, 3),
  ('131', '청주', 36.63924, 127.44066, 58.7, 10.0, 68, 107, false, 4),
  ('129', '서산', 36.77658, 126.4939, 25.25, 20.2, 52, 109, false, 5),
  ('146', '전주', 35.84092, 127.11718, 60.44, 10.0, 63, 89, false, 6),
  ('156', '광주', 35.17294, 126.89156, 70.28, 17.5, 59, 75, false, 7),
  ('136', '안동', 36.57293, 128.70733, 141.26, 10.0, 90, 106, false, 8),
  ('192', '진주', 35.16378, 128.04004, 29.35, 10.0, 79, 75, false, 9),
  ('189', '서귀포', 33.24616, 126.5653, 51.86, 10.0, 53, 32, false, 10)
on conflict (stn_id) do update set
  name_ko = excluded.name_ko, lat = excluded.lat, lon = excluded.lon, elev_m = excluded.elev_m,
  wind_height_m = excluded.wind_height_m, grid_nx = excluded.grid_nx, grid_ny = excluded.grid_ny,
  has_forecast = excluded.has_forecast, sort_order = excluded.sort_order;

-- 2. 작물 (FAO-56 표준값 층)
insert into public.crops (crop_id, name_ko, kc_ini, kc_mid, kc_end, zr_m, p, h_m, source) values
  ('apple', '사과', 0.45, 0.95, 0.70, 1, 0.5, 3.2, 'FAO-56 Table 12 (cropwater crops_library.csv 시나리오 1)'),
  ('kimchi_cabbage', '배추', 0.70, 1.05, 0.95, 0.5, 0.45, 0.4, 'FAO-56 Table 12 양배추 값 임시 적용 (cropwater crops_library.csv). 태백 실측으로 보정 예정')
on conflict (crop_id) do update set
  name_ko = excluded.name_ko, kc_ini = excluded.kc_ini, kc_mid = excluded.kc_mid, kc_end = excluded.kc_end,
  zr_m = excluded.zr_m, p = excluded.p, h_m = excluded.h_m, source = excluded.source;

-- 3. 작형. 값이 빈 작형은 화면 선택지에 나오지 않는다.
insert into public.crop_seasons (season_type_id, crop_id, name_ko, start_mmdd, l_ini_d, l_dev_d, l_mid_d, l_late_d, is_default, source) values
  ('apple-main', 'apple', '사과', '04-01', 20, 70, 90, 30, true, 'cropwater crops_library.csv'),
  ('kimchi_cabbage-spring', 'kimchi_cabbage', '봄배추', null, null, null, null, null, false, '값 미정'),
  ('kimchi_cabbage-summer', 'kimchi_cabbage', '여름배추(고랭지)', '07-01', 25, 30, 25, 10, true, 'cropwater crops_library.csv. 태백 실측으로 보정 예정'),
  ('kimchi_cabbage-autumn', 'kimchi_cabbage', '가을배추', null, null, null, null, null, false, '값 미정'),
  ('kimchi_cabbage-winter', 'kimchi_cabbage', '월동배추', null, null, null, null, null, false, '값 미정')
on conflict (season_type_id) do update set
  crop_id = excluded.crop_id, name_ko = excluded.name_ko, start_mmdd = excluded.start_mmdd,
  l_ini_d = excluded.l_ini_d, l_dev_d = excluded.l_dev_d, l_mid_d = excluded.l_mid_d, l_late_d = excluded.l_late_d,
  is_default = excluded.is_default, source = excluded.source;

-- 4. 토성 12종. FAO-56 Table 19 범위 그대로, 계산값(fc, wp)은 범위 가운데. Table 19 에 없는 3종은 비움.
--    미사질식토 포장용수량 하한은 원문 인쇄 "0-30" 을 0.30 으로 읽음.
insert into public.soil_types (soil_code, name_ko, fc_min, fc_max, wp_min, wp_max, fc, wp, is_default, sort_order, source) values
  ('sand', '사토', 0.07, 0.17, 0.02, 0.07, 0.12, 0.045, false, 1, 'FAO-56 Table 19'),
  ('loamy_sand', '양질사토', 0.11, 0.19, 0.03, 0.10, 0.15, 0.065, false, 2, 'FAO-56 Table 19'),
  ('sandy_loam', '사양토', 0.18, 0.28, 0.06, 0.16, 0.23, 0.11, false, 3, 'FAO-56 Table 19'),
  ('sandy_clay_loam', '사질식양토', null, null, null, null, null, null, false, 4, 'FAO-56 Table 19 에 없음 (값 준비 중)'),
  ('loam', '양토', 0.20, 0.30, 0.07, 0.17, 0.25, 0.12, true, 5, 'FAO-56 Table 19'),
  ('silt_loam', '미사질양토', 0.22, 0.36, 0.09, 0.21, 0.29, 0.15, false, 6, 'FAO-56 Table 19'),
  ('silt', '미사토', 0.28, 0.36, 0.12, 0.22, 0.32, 0.17, false, 7, 'FAO-56 Table 19'),
  ('clay_loam', '식양토', null, null, null, null, null, null, false, 8, 'FAO-56 Table 19 에 없음 (값 준비 중)'),
  ('silty_clay_loam', '미사질식양토', 0.30, 0.37, 0.17, 0.24, 0.335, 0.205, false, 9, 'FAO-56 Table 19'),
  ('sandy_clay', '사질식토', null, null, null, null, null, null, false, 10, 'FAO-56 Table 19 에 없음 (값 준비 중)'),
  ('silty_clay', '미사질식토', 0.30, 0.42, 0.17, 0.29, 0.36, 0.23, false, 11, 'FAO-56 Table 19'),
  ('clay', '식토', 0.32, 0.40, 0.20, 0.24, 0.36, 0.22, false, 12, 'FAO-56 Table 19')
on conflict (soil_code) do update set
  name_ko = excluded.name_ko, fc_min = excluded.fc_min, fc_max = excluded.fc_max,
  wp_min = excluded.wp_min, wp_max = excluded.wp_max, fc = excluded.fc, wp = excluded.wp,
  is_default = excluded.is_default, sort_order = excluded.sort_order, source = excluded.source;

-- 5. 기본 계산 조건은 데이터 계약 v1.1 에서 재배 방식(crop_kc_sets)이 더해져
--    20261024030000_seed_kc_sets.sql 로 옮겼다 (2026-10-24). 이 파일을 다시 실행해도 오류가 나지 않게 하려는 것이다.
