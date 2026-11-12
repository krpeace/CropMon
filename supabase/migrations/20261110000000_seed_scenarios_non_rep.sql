-- 목적: 대표 밖 87곳 계산 조건(scenarios) 사전 등록 (croplib-dp #28 C6, 2단계-나 S5 전, 이슈 #103).
--       사과 초생 재배(apple-k3) 및 여름배추 기본(kimchi_cabbage-k1) 2조건을
--       2026년(174개)과 2027년(174개) 총 348개 줄 등록한다.
--       값의 근거는 docs/DATA_CONTRACT.md 와 docs/decisions/0042-non-rep-scenarios-seed.md.
--
-- 실제 실행·병합 순서 (정정):
--   1. croplib-dp S5-a (#97, 2026-11-11 병합)
--   2. CropMon PR #125 병합 (2026-11-13, 518f612)
--   3. 사용자가 SQL Editor에서 시드 실행 (2026-11-13 00시경)
--   4. 확인 조회 3개 (croplib-dp ①-2창이 읽기 전용으로 실행)
--   5. croplib-dp 작은 dry-run
--   6. croplib-dp NONREP_SCENARIOS 켜기
--   * 주의: S5-a 병합 전에 시드하면 14일 창 규칙이 풀려 회차마다 3/1~어제를 다시 올립니다.
--   * 이력: 당초 계획(PR #125 Draft 유지, croplib-dp 신호 전 실행·병합 금지)에서
--           S5-a(#97) 병합 이후 #125를 먼저 병합하고 SQL을 실행하는 순서로 정정됨.
--
-- 여러 번 실행해도 오류가 나지 않는다 (on conflict do update).
--
-- 실행 뒤 확인 조회 및 기대 결과:
--   1. 연도별 기본 조건 수 확인 (연도마다 total = 224, default = 194)
--      select season_year, count(*) as total_count, count(*) filter (where is_default) as default_count
--      from public.scenarios group by 1 order by 1;
--      -- 기대 결과: 2026년 224(기본 194), 2027년 224(기본 194)
--
--   2. 대표 밖 87곳 지점별 2조건 누락 여부 확인 (87곳 모두 정확히 2조건씩 등록)
--      select season_year, count(*) as valid_station_count from (
--        select sc.season_year, s.stn_id
--        from public.stations s
--        join public.scenarios sc on sc.stn_id = s.stn_id
--        where s.is_active = true and s.is_representative = false
--        group by sc.season_year, s.stn_id
--        having count(sc.scenario_id) = 2
--      ) t group by 1 order by 1;
--      -- 기대 결과: 2026년 87, 2027년 87
--
--   3. 폐지·휴지 8곳에 등록된 조건이 없는지 확인 (0행이어야 함)
--      select count(*) as inactive_scenarios_count
--      from public.scenarios sc
--      join public.stations s on s.stn_id = sc.stn_id
--      where s.is_active = false;
--      -- 기대 결과: 0
--
-- 되돌리기 (Rollback) SQL:
--   외래키에 on delete cascade 가 없으므로 자식 테이블부터 역순으로 삭제한다.
--   삭제 순서: water_outlook_summary -> water_outlook -> water_balance_daily -> scenarios
--   대표 10곳(is_representative = true)의 조건과 데이터는 절대 지우지 않는다.
--
--   1. 전망 요약 삭제
--   delete from public.water_outlook_summary
--   where scenario_id in (
--     select sc.scenario_id from public.scenarios sc
--     join public.stations st on st.stn_id = sc.stn_id
--     where st.is_representative = false and sc.season_year in (2026, 2027)
--   );
--
--   2. 3일 전망 일별 자료 삭제
--   delete from public.water_outlook
--   where scenario_id in (
--     select sc.scenario_id from public.scenarios sc
--     join public.stations st on st.stn_id = sc.stn_id
--     where st.is_representative = false and sc.season_year in (2026, 2027)
--   );
--
--   3. 일별 물수지 관측 자료 삭제
--   delete from public.water_balance_daily
--   where scenario_id in (
--     select sc.scenario_id from public.scenarios sc
--     join public.stations st on st.stn_id = sc.stn_id
--     where st.is_representative = false and sc.season_year in (2026, 2027)
--   );
--
--   4. 계산 조건 348행 삭제 (대표 밖 87곳, 2026·2027년)
--   delete from public.scenarios
--   where stn_id in (
--     select stn_id from public.stations where is_representative = false
--   )
--   and season_year in (2026, 2027);
--
-- 자동 검사: src/infra/supabase/seed.test.ts

-- 1. 2026년 대표 밖 87곳 기본 계산 조건 (87곳 × 2조건 = 174개 줄, 양토, 2026)
insert into public.scenarios (scenario_id, stn_id, crop_id, season_type_id, kc_set_id, soil_code, season_year, season_start, season_end, dr0_mm, taw_mm, raw_mm, is_default) values
  ('105-apple-main-k3-loam-2026', '105', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('105-kimchi_cabbage-summer-k1-loam-2026', '105', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('259-apple-main-k3-loam-2026', '259', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('259-kimchi_cabbage-summer-k1-loam-2026', '259', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('201-apple-main-k3-loam-2026', '201', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('201-kimchi_cabbage-summer-k1-loam-2026', '201', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('294-apple-main-k3-loam-2026', '294', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('294-kimchi_cabbage-summer-k1-loam-2026', '294', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('284-apple-main-k3-loam-2026', '284', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('284-kimchi_cabbage-summer-k1-loam-2026', '284', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('283-apple-main-k3-loam-2026', '283', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('283-kimchi_cabbage-summer-k1-loam-2026', '283', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('185-apple-main-k3-loam-2026', '185', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('185-kimchi_cabbage-summer-k1-loam-2026', '185', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('172-apple-main-k3-loam-2026', '172', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('172-kimchi_cabbage-summer-k1-loam-2026', '172', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('251-apple-main-k3-loam-2026', '251', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('251-kimchi_cabbage-summer-k1-loam-2026', '251', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('262-apple-main-k3-loam-2026', '262', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('262-kimchi_cabbage-summer-k1-loam-2026', '262', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('266-apple-main-k3-loam-2026', '266', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('266-kimchi_cabbage-summer-k1-loam-2026', '266', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('279-apple-main-k3-loam-2026', '279', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('279-kimchi_cabbage-summer-k1-loam-2026', '279', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('140-apple-main-k3-loam-2026', '140', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('140-kimchi_cabbage-summer-k1-loam-2026', '140', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('238-apple-main-k3-loam-2026', '238', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('238-kimchi_cabbage-summer-k1-loam-2026', '238', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('253-apple-main-k3-loam-2026', '253', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('253-kimchi_cabbage-summer-k1-loam-2026', '253', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('247-apple-main-k3-loam-2026', '247', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('247-kimchi_cabbage-summer-k1-loam-2026', '247', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('295-apple-main-k3-loam-2026', '295', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('295-kimchi_cabbage-summer-k1-loam-2026', '295', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('100-apple-main-k3-loam-2026', '100', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('100-kimchi_cabbage-summer-k1-loam-2026', '100', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('143-apple-main-k3-loam-2026', '143', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('143-kimchi_cabbage-summer-k1-loam-2026', '143', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('133-apple-main-k3-loam-2026', '133', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('133-kimchi_cabbage-summer-k1-loam-2026', '133', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('98-apple-main-k3-loam-2026', '98', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('98-kimchi_cabbage-summer-k1-loam-2026', '98', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('106-apple-main-k3-loam-2026', '106', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('106-kimchi_cabbage-summer-k1-loam-2026', '106', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('165-apple-main-k3-loam-2026', '165', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('165-kimchi_cabbage-summer-k1-loam-2026', '165', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('273-apple-main-k3-loam-2026', '273', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('273-kimchi_cabbage-summer-k1-loam-2026', '273', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('288-apple-main-k3-loam-2026', '288', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('288-kimchi_cabbage-summer-k1-loam-2026', '288', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('102-apple-main-k3-loam-2026', '102', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('102-kimchi_cabbage-summer-k1-loam-2026', '102', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('235-apple-main-k3-loam-2026', '235', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('235-kimchi_cabbage-summer-k1-loam-2026', '235', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('258-apple-main-k3-loam-2026', '258', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('258-kimchi_cabbage-summer-k1-loam-2026', '258', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('226-apple-main-k3-loam-2026', '226', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('226-kimchi_cabbage-summer-k1-loam-2026', '226', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('271-apple-main-k3-loam-2026', '271', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('271-kimchi_cabbage-summer-k1-loam-2026', '271', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('159-apple-main-k3-loam-2026', '159', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('159-kimchi_cabbage-summer-k1-loam-2026', '159', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('243-apple-main-k3-loam-2026', '243', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('243-kimchi_cabbage-summer-k1-loam-2026', '243', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('236-apple-main-k3-loam-2026', '236', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('236-kimchi_cabbage-summer-k1-loam-2026', '236', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('104-apple-main-k3-loam-2026', '104', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('104-kimchi_cabbage-summer-k1-loam-2026', '104', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('296-apple-main-k3-loam-2026', '296', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('296-kimchi_cabbage-summer-k1-loam-2026', '296', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('255-apple-main-k3-loam-2026', '255', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('255-kimchi_cabbage-summer-k1-loam-2026', '255', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('93-apple-main-k3-loam-2026', '93', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('93-kimchi_cabbage-summer-k1-loam-2026', '93', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('289-apple-main-k3-loam-2026', '289', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('289-kimchi_cabbage-summer-k1-loam-2026', '289', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('137-apple-main-k3-loam-2026', '137', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('137-kimchi_cabbage-summer-k1-loam-2026', '137', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('108-apple-main-k3-loam-2026', '108', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('108-kimchi_cabbage-summer-k1-loam-2026', '108', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('181-apple-main-k3-loam-2026', '181', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('181-kimchi_cabbage-summer-k1-loam-2026', '181', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('188-apple-main-k3-loam-2026', '188', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('188-kimchi_cabbage-summer-k1-loam-2026', '188', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('239-apple-main-k3-loam-2026', '239', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('239-kimchi_cabbage-summer-k1-loam-2026', '239', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('90-apple-main-k3-loam-2026', '90', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('90-kimchi_cabbage-summer-k1-loam-2026', '90', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('254-apple-main-k3-loam-2026', '254', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('254-kimchi_cabbage-summer-k1-loam-2026', '254', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('174-apple-main-k3-loam-2026', '174', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('174-kimchi_cabbage-summer-k1-loam-2026', '174', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('257-apple-main-k3-loam-2026', '257', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('257-kimchi_cabbage-summer-k1-loam-2026', '257', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('202-apple-main-k3-loam-2026', '202', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('202-kimchi_cabbage-summer-k1-loam-2026', '202', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('168-apple-main-k3-loam-2026', '168', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('168-kimchi_cabbage-summer-k1-loam-2026', '168', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('252-apple-main-k3-loam-2026', '252', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('252-kimchi_cabbage-summer-k1-loam-2026', '252', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('277-apple-main-k3-loam-2026', '277', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('277-kimchi_cabbage-summer-k1-loam-2026', '277', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('121-apple-main-k3-loam-2026', '121', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('121-kimchi_cabbage-summer-k1-loam-2026', '121', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('272-apple-main-k3-loam-2026', '272', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('272-kimchi_cabbage-summer-k1-loam-2026', '272', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('281-apple-main-k3-loam-2026', '281', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('281-kimchi_cabbage-summer-k1-loam-2026', '281', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('170-apple-main-k3-loam-2026', '170', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('170-kimchi_cabbage-summer-k1-loam-2026', '170', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('115-apple-main-k3-loam-2026', '115', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('115-kimchi_cabbage-summer-k1-loam-2026', '115', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('152-apple-main-k3-loam-2026', '152', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('152-kimchi_cabbage-summer-k1-loam-2026', '152', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('130-apple-main-k3-loam-2026', '130', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('130-kimchi_cabbage-summer-k1-loam-2026', '130', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('114-apple-main-k3-loam-2026', '114', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('114-kimchi_cabbage-summer-k1-loam-2026', '114', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('263-apple-main-k3-loam-2026', '263', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('263-kimchi_cabbage-summer-k1-loam-2026', '263', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('278-apple-main-k3-loam-2026', '278', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('278-kimchi_cabbage-summer-k1-loam-2026', '278', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('203-apple-main-k3-loam-2026', '203', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('203-kimchi_cabbage-summer-k1-loam-2026', '203', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('211-apple-main-k3-loam-2026', '211', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('211-kimchi_cabbage-summer-k1-loam-2026', '211', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('112-apple-main-k3-loam-2026', '112', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('112-kimchi_cabbage-summer-k1-loam-2026', '112', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('244-apple-main-k3-loam-2026', '244', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('244-kimchi_cabbage-summer-k1-loam-2026', '244', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('248-apple-main-k3-loam-2026', '248', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('248-kimchi_cabbage-summer-k1-loam-2026', '248', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('260-apple-main-k3-loam-2026', '260', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('260-kimchi_cabbage-summer-k1-loam-2026', '260', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('217-apple-main-k3-loam-2026', '217', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('217-kimchi_cabbage-summer-k1-loam-2026', '217', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('245-apple-main-k3-loam-2026', '245', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('245-kimchi_cabbage-summer-k1-loam-2026', '245', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('184-apple-main-k3-loam-2026', '184', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('184-kimchi_cabbage-summer-k1-loam-2026', '184', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('221-apple-main-k3-loam-2026', '221', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('221-kimchi_cabbage-summer-k1-loam-2026', '221', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('268-apple-main-k3-loam-2026', '268', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('268-kimchi_cabbage-summer-k1-loam-2026', '268', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('155-apple-main-k3-loam-2026', '155', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('155-kimchi_cabbage-summer-k1-loam-2026', '155', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('232-apple-main-k3-loam-2026', '232', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('232-kimchi_cabbage-summer-k1-loam-2026', '232', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('95-apple-main-k3-loam-2026', '95', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('95-kimchi_cabbage-summer-k1-loam-2026', '95', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('276-apple-main-k3-loam-2026', '276', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('276-kimchi_cabbage-summer-k1-loam-2026', '276', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('135-apple-main-k3-loam-2026', '135', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('135-kimchi_cabbage-summer-k1-loam-2026', '135', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('127-apple-main-k3-loam-2026', '127', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('127-kimchi_cabbage-summer-k1-loam-2026', '127', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('162-apple-main-k3-loam-2026', '162', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('162-kimchi_cabbage-summer-k1-loam-2026', '162', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('99-apple-main-k3-loam-2026', '99', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('99-kimchi_cabbage-summer-k1-loam-2026', '99', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('138-apple-main-k3-loam-2026', '138', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('138-kimchi_cabbage-summer-k1-loam-2026', '138', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('264-apple-main-k3-loam-2026', '264', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('264-kimchi_cabbage-summer-k1-loam-2026', '264', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('285-apple-main-k3-loam-2026', '285', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('285-kimchi_cabbage-summer-k1-loam-2026', '285', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('261-apple-main-k3-loam-2026', '261', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('261-kimchi_cabbage-summer-k1-loam-2026', '261', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('177-apple-main-k3-loam-2026', '177', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('177-kimchi_cabbage-summer-k1-loam-2026', '177', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('212-apple-main-k3-loam-2026', '212', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('212-kimchi_cabbage-summer-k1-loam-2026', '212', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true),
  ('169-apple-main-k3-loam-2026', '169', 'apple', 'apple-main', 'apple-k3', 'loam', 2026, '2026-04-01', '2026-10-27', 0, 130, 65, true),
  ('169-kimchi_cabbage-summer-k1-loam-2026', '169', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2026, '2026-07-01', '2026-09-28', 0, 65, 29.25, true)
on conflict (scenario_id) do update set
  stn_id = excluded.stn_id, crop_id = excluded.crop_id, season_type_id = excluded.season_type_id,
  kc_set_id = excluded.kc_set_id, soil_code = excluded.soil_code, season_year = excluded.season_year,
  season_start = excluded.season_start, season_end = excluded.season_end, dr0_mm = excluded.dr0_mm,
  taw_mm = excluded.taw_mm, raw_mm = excluded.raw_mm, is_default = excluded.is_default;

-- 2. 2027년 대표 밖 87곳 기본 계산 조건 (87곳 × 2조건 = 174개 줄, 양토, 2027)
insert into public.scenarios (scenario_id, stn_id, crop_id, season_type_id, kc_set_id, soil_code, season_year, season_start, season_end, dr0_mm, taw_mm, raw_mm, is_default) values
  ('105-apple-main-k3-loam-2027', '105', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('105-kimchi_cabbage-summer-k1-loam-2027', '105', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('259-apple-main-k3-loam-2027', '259', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('259-kimchi_cabbage-summer-k1-loam-2027', '259', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('201-apple-main-k3-loam-2027', '201', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('201-kimchi_cabbage-summer-k1-loam-2027', '201', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('294-apple-main-k3-loam-2027', '294', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('294-kimchi_cabbage-summer-k1-loam-2027', '294', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('284-apple-main-k3-loam-2027', '284', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('284-kimchi_cabbage-summer-k1-loam-2027', '284', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('283-apple-main-k3-loam-2027', '283', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('283-kimchi_cabbage-summer-k1-loam-2027', '283', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('185-apple-main-k3-loam-2027', '185', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('185-kimchi_cabbage-summer-k1-loam-2027', '185', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('172-apple-main-k3-loam-2027', '172', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('172-kimchi_cabbage-summer-k1-loam-2027', '172', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('251-apple-main-k3-loam-2027', '251', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('251-kimchi_cabbage-summer-k1-loam-2027', '251', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('262-apple-main-k3-loam-2027', '262', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('262-kimchi_cabbage-summer-k1-loam-2027', '262', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('266-apple-main-k3-loam-2027', '266', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('266-kimchi_cabbage-summer-k1-loam-2027', '266', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('279-apple-main-k3-loam-2027', '279', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('279-kimchi_cabbage-summer-k1-loam-2027', '279', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('140-apple-main-k3-loam-2027', '140', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('140-kimchi_cabbage-summer-k1-loam-2027', '140', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('238-apple-main-k3-loam-2027', '238', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('238-kimchi_cabbage-summer-k1-loam-2027', '238', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('253-apple-main-k3-loam-2027', '253', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('253-kimchi_cabbage-summer-k1-loam-2027', '253', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('247-apple-main-k3-loam-2027', '247', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('247-kimchi_cabbage-summer-k1-loam-2027', '247', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('295-apple-main-k3-loam-2027', '295', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('295-kimchi_cabbage-summer-k1-loam-2027', '295', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('100-apple-main-k3-loam-2027', '100', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('100-kimchi_cabbage-summer-k1-loam-2027', '100', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('143-apple-main-k3-loam-2027', '143', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('143-kimchi_cabbage-summer-k1-loam-2027', '143', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('133-apple-main-k3-loam-2027', '133', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('133-kimchi_cabbage-summer-k1-loam-2027', '133', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('98-apple-main-k3-loam-2027', '98', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('98-kimchi_cabbage-summer-k1-loam-2027', '98', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('106-apple-main-k3-loam-2027', '106', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('106-kimchi_cabbage-summer-k1-loam-2027', '106', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('165-apple-main-k3-loam-2027', '165', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('165-kimchi_cabbage-summer-k1-loam-2027', '165', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('273-apple-main-k3-loam-2027', '273', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('273-kimchi_cabbage-summer-k1-loam-2027', '273', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('288-apple-main-k3-loam-2027', '288', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('288-kimchi_cabbage-summer-k1-loam-2027', '288', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('102-apple-main-k3-loam-2027', '102', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('102-kimchi_cabbage-summer-k1-loam-2027', '102', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('235-apple-main-k3-loam-2027', '235', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('235-kimchi_cabbage-summer-k1-loam-2027', '235', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('258-apple-main-k3-loam-2027', '258', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('258-kimchi_cabbage-summer-k1-loam-2027', '258', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('226-apple-main-k3-loam-2027', '226', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('226-kimchi_cabbage-summer-k1-loam-2027', '226', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('271-apple-main-k3-loam-2027', '271', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('271-kimchi_cabbage-summer-k1-loam-2027', '271', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('159-apple-main-k3-loam-2027', '159', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('159-kimchi_cabbage-summer-k1-loam-2027', '159', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('243-apple-main-k3-loam-2027', '243', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('243-kimchi_cabbage-summer-k1-loam-2027', '243', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('236-apple-main-k3-loam-2027', '236', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('236-kimchi_cabbage-summer-k1-loam-2027', '236', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('104-apple-main-k3-loam-2027', '104', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('104-kimchi_cabbage-summer-k1-loam-2027', '104', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('296-apple-main-k3-loam-2027', '296', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('296-kimchi_cabbage-summer-k1-loam-2027', '296', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('255-apple-main-k3-loam-2027', '255', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('255-kimchi_cabbage-summer-k1-loam-2027', '255', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('93-apple-main-k3-loam-2027', '93', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('93-kimchi_cabbage-summer-k1-loam-2027', '93', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('289-apple-main-k3-loam-2027', '289', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('289-kimchi_cabbage-summer-k1-loam-2027', '289', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('137-apple-main-k3-loam-2027', '137', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('137-kimchi_cabbage-summer-k1-loam-2027', '137', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('108-apple-main-k3-loam-2027', '108', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('108-kimchi_cabbage-summer-k1-loam-2027', '108', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('181-apple-main-k3-loam-2027', '181', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('181-kimchi_cabbage-summer-k1-loam-2027', '181', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('188-apple-main-k3-loam-2027', '188', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('188-kimchi_cabbage-summer-k1-loam-2027', '188', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('239-apple-main-k3-loam-2027', '239', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('239-kimchi_cabbage-summer-k1-loam-2027', '239', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('90-apple-main-k3-loam-2027', '90', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('90-kimchi_cabbage-summer-k1-loam-2027', '90', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('254-apple-main-k3-loam-2027', '254', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('254-kimchi_cabbage-summer-k1-loam-2027', '254', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('174-apple-main-k3-loam-2027', '174', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('174-kimchi_cabbage-summer-k1-loam-2027', '174', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('257-apple-main-k3-loam-2027', '257', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('257-kimchi_cabbage-summer-k1-loam-2027', '257', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('202-apple-main-k3-loam-2027', '202', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('202-kimchi_cabbage-summer-k1-loam-2027', '202', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('168-apple-main-k3-loam-2027', '168', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('168-kimchi_cabbage-summer-k1-loam-2027', '168', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('252-apple-main-k3-loam-2027', '252', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('252-kimchi_cabbage-summer-k1-loam-2027', '252', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('277-apple-main-k3-loam-2027', '277', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('277-kimchi_cabbage-summer-k1-loam-2027', '277', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('121-apple-main-k3-loam-2027', '121', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('121-kimchi_cabbage-summer-k1-loam-2027', '121', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('272-apple-main-k3-loam-2027', '272', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('272-kimchi_cabbage-summer-k1-loam-2027', '272', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('281-apple-main-k3-loam-2027', '281', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('281-kimchi_cabbage-summer-k1-loam-2027', '281', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('170-apple-main-k3-loam-2027', '170', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('170-kimchi_cabbage-summer-k1-loam-2027', '170', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('115-apple-main-k3-loam-2027', '115', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('115-kimchi_cabbage-summer-k1-loam-2027', '115', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('152-apple-main-k3-loam-2027', '152', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('152-kimchi_cabbage-summer-k1-loam-2027', '152', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('130-apple-main-k3-loam-2027', '130', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('130-kimchi_cabbage-summer-k1-loam-2027', '130', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('114-apple-main-k3-loam-2027', '114', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('114-kimchi_cabbage-summer-k1-loam-2027', '114', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('263-apple-main-k3-loam-2027', '263', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('263-kimchi_cabbage-summer-k1-loam-2027', '263', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('278-apple-main-k3-loam-2027', '278', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('278-kimchi_cabbage-summer-k1-loam-2027', '278', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('203-apple-main-k3-loam-2027', '203', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('203-kimchi_cabbage-summer-k1-loam-2027', '203', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('211-apple-main-k3-loam-2027', '211', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('211-kimchi_cabbage-summer-k1-loam-2027', '211', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('112-apple-main-k3-loam-2027', '112', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('112-kimchi_cabbage-summer-k1-loam-2027', '112', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('244-apple-main-k3-loam-2027', '244', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('244-kimchi_cabbage-summer-k1-loam-2027', '244', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('248-apple-main-k3-loam-2027', '248', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('248-kimchi_cabbage-summer-k1-loam-2027', '248', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('260-apple-main-k3-loam-2027', '260', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('260-kimchi_cabbage-summer-k1-loam-2027', '260', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('217-apple-main-k3-loam-2027', '217', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('217-kimchi_cabbage-summer-k1-loam-2027', '217', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('245-apple-main-k3-loam-2027', '245', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('245-kimchi_cabbage-summer-k1-loam-2027', '245', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('184-apple-main-k3-loam-2027', '184', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('184-kimchi_cabbage-summer-k1-loam-2027', '184', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('221-apple-main-k3-loam-2027', '221', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('221-kimchi_cabbage-summer-k1-loam-2027', '221', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('268-apple-main-k3-loam-2027', '268', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('268-kimchi_cabbage-summer-k1-loam-2027', '268', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('155-apple-main-k3-loam-2027', '155', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('155-kimchi_cabbage-summer-k1-loam-2027', '155', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('232-apple-main-k3-loam-2027', '232', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('232-kimchi_cabbage-summer-k1-loam-2027', '232', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('95-apple-main-k3-loam-2027', '95', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('95-kimchi_cabbage-summer-k1-loam-2027', '95', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('276-apple-main-k3-loam-2027', '276', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('276-kimchi_cabbage-summer-k1-loam-2027', '276', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('135-apple-main-k3-loam-2027', '135', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('135-kimchi_cabbage-summer-k1-loam-2027', '135', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('127-apple-main-k3-loam-2027', '127', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('127-kimchi_cabbage-summer-k1-loam-2027', '127', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('162-apple-main-k3-loam-2027', '162', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('162-kimchi_cabbage-summer-k1-loam-2027', '162', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('99-apple-main-k3-loam-2027', '99', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('99-kimchi_cabbage-summer-k1-loam-2027', '99', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('138-apple-main-k3-loam-2027', '138', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('138-kimchi_cabbage-summer-k1-loam-2027', '138', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('264-apple-main-k3-loam-2027', '264', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('264-kimchi_cabbage-summer-k1-loam-2027', '264', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('285-apple-main-k3-loam-2027', '285', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('285-kimchi_cabbage-summer-k1-loam-2027', '285', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('261-apple-main-k3-loam-2027', '261', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('261-kimchi_cabbage-summer-k1-loam-2027', '261', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('177-apple-main-k3-loam-2027', '177', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('177-kimchi_cabbage-summer-k1-loam-2027', '177', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('212-apple-main-k3-loam-2027', '212', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('212-kimchi_cabbage-summer-k1-loam-2027', '212', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true),
  ('169-apple-main-k3-loam-2027', '169', 'apple', 'apple-main', 'apple-k3', 'loam', 2027, '2027-04-01', '2027-10-27', 0, 130, 65, true),
  ('169-kimchi_cabbage-summer-k1-loam-2027', '169', 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', 'loam', 2027, '2027-07-01', '2027-09-28', 0, 65, 29.25, true)
on conflict (scenario_id) do update set
  stn_id = excluded.stn_id, crop_id = excluded.crop_id, season_type_id = excluded.season_type_id,
  kc_set_id = excluded.kc_set_id, soil_code = excluded.soil_code, season_year = excluded.season_year,
  season_start = excluded.season_start, season_end = excluded.season_end, dr0_mm = excluded.dr0_mm,
  taw_mm = excluded.taw_mm, raw_mm = excluded.raw_mm, is_default = excluded.is_default;
