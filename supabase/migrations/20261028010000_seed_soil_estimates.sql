-- 목적: 데이터 계약 v1.5 추정 토성 3종 값과 작물 공통(common) 사전 등록 (#35, 결정 0020).
--       FAO-56 Table 19 에 없는 토성 3종(사질식양토·식양토·사질식토)의 추정값(fc, wp)을 넣고,
--       작물 공통 적산온도(heat_daily) 저장을 위한 common 작물을 등록한다.
--
-- 실행 방법:
--   1. 먼저 20261028000000_data_contract_v1_5.sql 을 실행해 둔다.
--   2. Supabase 대시보드 → SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run 을 누른다.
--   여러 번 실행해도 오류가 나지 않는다.
--
-- 근거:
--   - Saxton & Rawls (2006) θ33·θ1500 식, USDA 토성 삼각형 중심 조성(모래·점토: 0.60·0.27 / 0.32·0.34 / 0.52·0.42).
--     유기물 2.5% 기준. TAW = (fc - wp) * 1000 * 0.5 m.
--   - 작물 공통 적산온도 기준온도 5℃, 단계 1000·2000℃·일 (결정 0020).

-- 1. 추정 토성 3종 값 반영 (기존 범위 칸 fc_min~wp_max 은 빈 칸 유지)
update public.soil_types
set fc = 0.278,
    wp = 0.177,
    is_estimated = true,
    source = '추정: Saxton & Rawls (2006), 토성 중심 조성·유기물 2.5%'
where soil_code = 'sandy_clay_loam';

update public.soil_types
set fc = 0.351,
    wp = 0.213,
    is_estimated = true,
    source = '추정: Saxton & Rawls (2006), 토성 중심 조성·유기물 2.5%'
where soil_code = 'clay_loam';

update public.soil_types
set fc = 0.371,
    wp = 0.260,
    is_estimated = true,
    source = '추정: Saxton & Rawls (2006), 토성 중심 조성·유기물 2.5%'
where soil_code = 'sandy_clay';

-- 2. 작물 사전에 작물 공통 (common) 추가: 적산온도(heat_daily) 기록용
insert into public.crops (crop_id, name_ko, kc_ini, kc_mid, kc_end, zr_m, p, t_base_c, gdd_stages, source)
values ('common', '작물 공통', 1.0, 1.0, 1.0, 0.5, 0.40, 5, '{1000,2000}', '작물 공통 고정 조건 (결정 0020)')
on conflict (crop_id) do update set
  name_ko = excluded.name_ko,
  kc_ini = excluded.kc_ini,
  kc_mid = excluded.kc_mid,
  kc_end = excluded.kc_end,
  zr_m = excluded.zr_m,
  p = excluded.p,
  t_base_c = excluded.t_base_c,
  gdd_stages = excluded.gdd_stages,
  source = excluded.source;
