-- 목적: 데이터 계약 v2.1(이슈 #184, 결정 0062)의 사전 값. 포도 작목 · 재배 방식 · 작형 둘, 배추 기준온도와 작형 이름, 적산 시작 월-일.
--
-- 실행 방법:
--   1. 먼저 20261120000000_data_contract_v2_1_farms.sql 을 실행해 둔다 (열 is_protected · cum_start_mmdd · gdd_stage_labels 가 필요하다).
--   2. SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run. 여러 번 실행해도 오류가 나지 않는다 (같은 키는 값만 이 파일 내용으로 고친다).
--
-- 값을 고칠 때는 이 파일을 고치지 말고, 고친 값을 담은 새 파일을 더한다.
-- 자동 검사: src/infra/supabase/seed.test.ts

-- 1. 적산 시작 월-일 (cum_start_mmdd): 적산온도 · 적산일사를 어느 월-일부터 더하는지. 비어 있으면 적산온도를 내지 않는다(시설가온).
--    이 열을 읽어 계열을 만드는 일은 D1-3 · croplib-dp 이다. 사과 · 배추는 1월 1일부터.
update public.crop_seasons set cum_start_mmdd = '01-01'
  where season_type_id in ('apple-main', 'kimchi_cabbage-summer');

-- 2. 배추 기준온도 4 → 5 °C (위승환 외 2018, 한국농림기상학회지 20(2)).
--    배추 적산온도 줄은 croplib-dp 수집기가 다음 아침에 새 기준으로 다시 쓴다 (소급 작업 없음).
update public.crops set t_base_c = 5 where crop_id = 'kimchi_cabbage';

-- 3. 배추 여름 작형 이름 "고랭지배추" (키 kimchi_cabbage-summer 는 그대로 — 공개 계산 조건 224개가 이 키를 쓴다).
update public.crop_seasons set name_ko = '고랭지배추' where season_type_id = 'kimchi_cabbage-summer';

-- 4. 포도 작목. Kc 0.30 / 0.85 / 0.45 (FAO-56 Table 12 식용 포도), Zr 1.0 m, p 0.35, 높이 2.0 m.
--    t_base_c 10 (Paredes 2025b Table 3 · Winkler 1944).
--    gdd_stages · gdd_stage_labels 는 비워 둔다 — 세 숫자(만개 · 변색기 · 수확기)는 croplib-dp 가 계산 중이고,
--    결과가 오면 작은 시드 이슈로 넣는다(그때 라벨 ["만개","변색기","수확기"] 와 함께).
insert into public.crops (crop_id, name_ko, kc_ini, kc_mid, kc_end, zr_m, p, h_m, source, t_base_c) values
  ('grape', '포도', 0.30, 0.85, 0.45, 1.0, 0.35, 2.0, 'FAO-56 Table 12 식용 포도, 대표 품종 샤인머스캣. 기준온도 10 °C: Paredes 2025b Table 3, Winkler 1944', 10)
on conflict (crop_id) do update set
  name_ko = excluded.name_ko, kc_ini = excluded.kc_ini, kc_mid = excluded.kc_mid, kc_end = excluded.kc_end,
  zr_m = excluded.zr_m, p = excluded.p, h_m = excluded.h_m, source = excluded.source, t_base_c = excluded.t_base_c;

-- 5. 포도 재배 방식 (기본 하나)
insert into public.crop_kc_sets (kc_set_id, crop_id, set_no, name_ko, note, kc_ini, kc_mid, kc_end, is_default, sort_order, source) values
  ('grape-k1', 'grape', 1, '기본', '식용 포도 값', 0.30, 0.85, 0.45, true, 1, 'FAO-56 Table 12 식용 포도')
on conflict (kc_set_id) do update set
  crop_id = excluded.crop_id, set_no = excluded.set_no, name_ko = excluded.name_ko, note = excluded.note,
  kc_ini = excluded.kc_ini, kc_mid = excluded.kc_mid, kc_end = excluded.kc_end,
  is_default = excluded.is_default, sort_order = excluded.sort_order, source = excluded.source;

-- 6. 포도 작형 둘. 시설 재배(is_protected)라 croplib-dp 가 비를 0으로 계산한다.
--    비가림: 단계 일수 25 · 45 · 90 · 45 (합 205) — 천미건 외 2017 · Yamada 외 2008 · Yun 외 2009.
--    시설가온: 단계 일수 35 · 40 · 85 · 30 (합 190) — 오카야마현 성과(참조급, 동료심사 근거 없음). 시작일은 회원이 고르므로 비운다.
--    ※ 단계 일수가 있으면 시작일이 비어도 화면 선택지에 나온다 (F2 가 "단계 일수 네 개가 모두 있음"으로 거른다).
insert into public.crop_seasons (season_type_id, crop_id, name_ko, start_mmdd, l_ini_d, l_dev_d, l_mid_d, l_late_d, is_default, source, is_protected, cum_start_mmdd) values
  ('grape-rainshelter', 'grape', '포도 비가림', '04-20', 25, 45, 90, 45, true, '천미건 외 2017 · Yamada 외 2008 · Yun 외 2009', true, '04-20'),
  ('grape-heated', 'grape', '포도 시설가온', null, 35, 40, 85, 30, false, '오카야마현 성과(참조급, 동료심사 근거 없음)', true, null)
on conflict (season_type_id) do update set
  crop_id = excluded.crop_id, name_ko = excluded.name_ko, start_mmdd = excluded.start_mmdd,
  l_ini_d = excluded.l_ini_d, l_dev_d = excluded.l_dev_d, l_mid_d = excluded.l_mid_d, l_late_d = excluded.l_late_d,
  is_default = excluded.is_default, source = excluded.source,
  is_protected = excluded.is_protected, cum_start_mmdd = excluded.cum_start_mmdd;
