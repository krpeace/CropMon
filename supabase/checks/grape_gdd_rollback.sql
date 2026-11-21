-- 되돌리기 SQL: 포도 적산온도 단계 (데이터 계약 v2.4, 이슈 #201, 결정 0070)
--
-- 실행하지 않는다. 마이그레이션 20261121000000_seed_grape_gdd_stages.sql 을 되돌리고 싶을 때만 SQL Editor 에서 Run.
-- 여러 번 실행해도 결과가 같다.
--
-- 되돌리는 것: 포도 한 줄의 gdd_stages · gdd_stage_labels 를 다시 비우고(null) source 를 옛 글로 돌린다.
--   두 열을 한 문장에서 함께 비우므로 제약 crops_gdd_stage_labels_len(라벨은 단계가 있을 때만, 길이 같음)에 걸리지 않는다.
--   다른 작목 · 다른 열은 건드리지 않는다.
update public.crops
  set gdd_stages = null,
      gdd_stage_labels = null,
      source = 'FAO-56 Table 12 식용 포도, 대표 품종 샤인머스캣. 기준온도 10 °C: Paredes 2025b Table 3, Winkler 1944'
  where crop_id = 'grape';
