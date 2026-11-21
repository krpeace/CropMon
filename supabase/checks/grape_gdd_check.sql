-- 확인 SQL: 포도 적산온도 단계 시드 (데이터 계약 v2.4, 이슈 #201, 결정 0070)
--
-- 언제: 마이그레이션 20261121000000_seed_grape_gdd_stages.sql 을 Run 하기 **전** (한 번 더 확인하고 싶으면 Run 한 뒤에도 된다 — 같은 결과가 나온다).
-- 방법: SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run.
-- 결과: 항목마다 true/false 한 줄, 맨 끝 줄 all_ok = true 면 통과. 검토 채팅에 all_ok 만 알린다 (개인 값 없음).
--
-- 아무것도 남기지 않는다. 시드와 **같은 update 문**을 안에서 실행해 보고, 끝에서 일부러 오류를 내 그 변경을 되돌린다
-- (결과는 되돌려지지 않는 변수로 꺼내 보여 준다). 그래서 이 확인 SQL 을 먼저 돌려도 사전 값은 바뀌지 않는다.
-- 항목이 하나라도 false 이면 그 항목 이름을 알려 주세요.
--
-- 순서: "한 일 → 변수 → 상태 확인". 실행 전 스냅샷과 영향받은 줄 수(get diagnostics)를 먼저 변수에 담고, 그 뒤에 상태를 읽는다
--   (한 식 안에 함수 호출 결과와 (select …)를 같이 쓰면 select 가 먼저 계산돼 한 일 이전 상태를 읽을 수 있다 — InitPlan, l4 확인 SQL 3h · 3i 가 false 였던 원인).

drop table if exists pg_temp.grape_gdd_results;
create temp table grape_gdd_results (seq int, item text, ok boolean);

-- ---------------------------------------------------------------------------
-- 도우미 (이 세션 안에서만 있다)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.item(p_res jsonb, p_name text, p_ok boolean)
returns jsonb language sql as $f$
  select p_res || jsonb_build_array(jsonb_build_object(
    'seq', jsonb_array_length(p_res) + 1, 'item', p_name, 'ok', coalesce(p_ok, false)));
$f$;

do $check$
declare
  res jsonb := '[]'::jsonb;
  -- 실행 전 스냅샷 (변수)
  before_grape   jsonb;   -- 포도 줄에서 gdd_stages · gdd_stage_labels · source 를 뺀 나머지 열
  before_others  jsonb;   -- 포도가 아닌 작목 줄 전체
  before_count   bigint;  -- 작목 줄 수
  before_seasons jsonb;   -- 포도 작형의 cum_start_mmdd
  old_source     text := 'FAO-56 Table 12 식용 포도, 대표 품종 샤인머스캣. 기준온도 10 °C: Paredes 2025b Table 3, Winkler 1944';
  -- 한 일 뒤의 값 (변수)
  n              int;     -- 첫 실행이 고친 줄 수
  n2             int;     -- 한 번 더 실행이 고친 줄 수
  after_first    text;    -- 첫 실행 뒤 source
  after_second   text;    -- 한 번 더 실행 뒤 source
  stages_first   int[];
  stages_second  int[];
begin
  begin
    -- ===================================================================
    -- 0. 실행 전 스냅샷 (한 일을 하기 전에 먼저 변수에 담는다)
    -- ===================================================================
    select to_jsonb(c) - 'gdd_stages' - 'gdd_stage_labels' - 'source' into before_grape
      from public.crops c where c.crop_id = 'grape';
    select coalesce(jsonb_agg(to_jsonb(c) order by c.crop_id), '[]'::jsonb) into before_others
      from public.crops c where c.crop_id <> 'grape';
    select count(*) into before_count from public.crops;
    select coalesce(jsonb_agg(jsonb_build_object('id', s.season_type_id, 'cum', s.cum_start_mmdd) order by s.season_type_id), '[]'::jsonb)
      into before_seasons from public.crop_seasons s where s.crop_id = 'grape';

    -- ===================================================================
    -- 1. 한 일: 시드 파일과 같은 update (글자까지 같다 — contract.test.ts 가 견준다)
    -- ===================================================================
    update public.crops
      set gdd_stages = '{370,1040,2050}',
          gdd_stage_labels = '{"만개","변색기","수확기"}',
          source = 'FAO-56 Table 12 식용 포도, 대표 품종 샤인머스캣. 기준온도 10 °C: Paredes 2025b Table 3, Winkler 1944. 적산온도 단계(만개 370 · 변색기 1040 · 수확기 2050 ℃): 비가림 04-20 기준, 기준온도 10 °C, 평년 2016–2025, 구미 · 영천 · 상주 · 추풍령 · 거창 다섯 지점 평균을 10 단위로 반올림 (croplib-dp #126)'
      where crop_id = 'grape';
    get diagnostics n = row_count;
    select c.source, c.gdd_stages into after_first, stages_first from public.crops c where c.crop_id = 'grape';

    -- 한 번 더 (여러 번 실행해도 같은 결과인지)
    update public.crops
      set gdd_stages = '{370,1040,2050}',
          gdd_stage_labels = '{"만개","변색기","수확기"}',
          source = 'FAO-56 Table 12 식용 포도, 대표 품종 샤인머스캣. 기준온도 10 °C: Paredes 2025b Table 3, Winkler 1944. 적산온도 단계(만개 370 · 변색기 1040 · 수확기 2050 ℃): 비가림 04-20 기준, 기준온도 10 °C, 평년 2016–2025, 구미 · 영천 · 상주 · 추풍령 · 거창 다섯 지점 평균을 10 단위로 반올림 (croplib-dp #126)'
      where crop_id = 'grape';
    get diagnostics n2 = row_count;
    select c.source, c.gdd_stages into after_second, stages_second from public.crops c where c.crop_id = 'grape';

    -- ===================================================================
    -- 2. 상태 확인 (위에서 변수에 담은 뒤에 읽는다)
    -- ===================================================================
    res := pg_temp.item(res, '1 영향받은 줄 1 (포도 한 줄만 고침)', n = 1);
    res := pg_temp.item(res, '2 단계 세 값 370 · 1040 · 2050',
      (select gdd_stages = '{370,1040,2050}' from public.crops where crop_id = 'grape'));
    res := pg_temp.item(res, '3 라벨 세 값 만개 · 변색기 · 수확기',
      (select gdd_stage_labels = '{만개,변색기,수확기}' from public.crops where crop_id = 'grape'));
    res := pg_temp.item(res, '4 단계와 라벨 길이 같음 (3 = 3)',
      (select cardinality(gdd_stages) = 3 and cardinality(gdd_stage_labels) = cardinality(gdd_stages)
         from public.crops where crop_id = 'grape'));
    res := pg_temp.item(res, '5 기준온도 10 그대로',
      (select t_base_c = 10 from public.crops where crop_id = 'grape'));
    res := pg_temp.item(res, '6 나머지 열이 실행 전과 같음 (Kc · Zr · p · 높이 · 기준온도 · 이름)',
      (select (to_jsonb(c) - 'gdd_stages' - 'gdd_stage_labels' - 'source') = before_grape
         from public.crops c where c.crop_id = 'grape'));
    res := pg_temp.item(res, '7 source 앞부분은 원래 글 그대로이고 뒤에 비가림 04-20 기준 근거가 붙음',
      left(after_first, length(old_source)) = old_source
      and length(after_first) > length(old_source)
      and after_first like '%비가림 04-20 기준%'
      and after_first like '%croplib-dp #126%');
    res := pg_temp.item(res, '8 한 번 더 실행해도 같은 결과 (source 근거가 두 번 안 붙음 · 값 그대로 · 줄 1)',
      after_second = after_first and stages_second = stages_first and n2 = 1);
    res := pg_temp.item(res, '9 사과 · 배추 · 공통 줄이 실행 전과 같음 (포도가 아닌 작목 줄 전체)',
      (select coalesce(jsonb_agg(to_jsonb(c) order by c.crop_id), '[]'::jsonb) = before_others
         from public.crops c where c.crop_id <> 'grape'));
    res := pg_temp.item(res, '10 작목 줄 수 그대로 (줄이 늘거나 줄지 않음)',
      (select count(*) = before_count from public.crops));
    res := pg_temp.item(res, '11 포도 비가림 cum_start_mmdd 04-20 그대로 (비가림 04-20)',
      (select cum_start_mmdd = '04-20' from public.crop_seasons where season_type_id = 'grape-rainshelter'));
    res := pg_temp.item(res, '12 포도 시설가온 cum_start_mmdd 비어 있음 그대로 (시설가온 비어 있음)',
      (select cum_start_mmdd is null from public.crop_seasons where season_type_id = 'grape-heated'));
    res := pg_temp.item(res, '13 포도 작형 둘의 적산 시작이 실행 전과 같음',
      (select coalesce(jsonb_agg(jsonb_build_object('id', s.season_type_id, 'cum', s.cum_start_mmdd) order by s.season_type_id), '[]'::jsonb) = before_seasons
         from public.crop_seasons s where s.crop_id = 'grape'));
    res := pg_temp.item(res, '14 사과 8 · 배추 4 · 공통 6 단계 개수 그대로',
      (select cardinality(gdd_stages) from public.crops where crop_id = 'apple') = 8
      and (select cardinality(gdd_stages) from public.crops where crop_id = 'kimchi_cabbage') = 4
      and (select cardinality(gdd_stages) from public.crops where crop_id = 'common') = 6);
    res := pg_temp.item(res, '15 라벨 길이 제약 crops_gdd_stage_labels_len 이 있음',
      exists (select 1 from pg_constraint
               where conrelid = 'public.crops'::regclass and conname = 'crops_gdd_stage_labels_len'));

    -- 여기서 일부러 오류를 내 위의 변경(포도 줄 두 번 고침)을 되돌린다.
    raise exception 'grape_gdd_check_rollback';
  exception
    when raise_exception then
      if sqlerrm <> 'grape_gdd_check_rollback' then
        raise;
      end if;
  end;

  insert into grape_gdd_results (seq, item, ok)
  select (r ->> 'seq')::int, r ->> 'item', (r ->> 'ok')::boolean
  from jsonb_array_elements(res) r;
end
$check$;

-- 마지막 줄 all_ok 가 true 면 통과. 위 DO 의 변경은 모두 되돌려졌다 (사전 값이 바뀌지 않음).
select seq, item, ok from grape_gdd_results
union all
select 999, 'all_ok', coalesce(bool_and(coalesce(ok, false)), false) and count(*) = 15 from grape_gdd_results
order by seq;
