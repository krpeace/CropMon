-- 확인 SQL: 농장 DB + 사전 (데이터 계약 v2.1, 이슈 #184, 결정 0062)
--
-- 언제: 마이그레이션 20261120000000 · 20261120010000 · 20261120020000 을 이름 순서대로 Run 한 뒤 (v2.3 20261120200000 을 Run 한 뒤에도 그대로 통과한다 — 가짜 회원을 동의한 회원으로 만들도록 고쳤다).
-- 방법: SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run.
-- 결과: 항목마다 true/false 한 줄, 맨 끝 줄 all_ok = true 면 통과. 검토 채팅에 all_ok 만 알린다 (개인 값 없음).
--
-- 회원 DB(D1-1, 20261119000000_data_contract_v2_0_members.sql)가 이미 실행돼 있으면 탈퇴 함수 · 회원 표도 함께 시험하고,
--   아직 없으면 그 항목(9b · 9c)만 "건너뜀"으로 참 처리한다(이 파일은 D1-1 없이도 돌아간다). D1-1 을 나중에 실행했다면 다시 Run 한다.
-- 아무것도 남기지 않는다. 가짜 회원(@example.invalid, 번호는 gen_random_uuid())과 농장을 만들어 시험하고,
-- 끝에서 일부러 오류를 내 그 안의 변경을 모두 되돌린다 (결과는 되돌려지지 않는 변수로 꺼내 보여 준다).
-- 항목이 하나라도 false 이면 그 항목 이름을 알려 주세요.
--
-- ⚠ 진짜 작업을 깨우지 않는다 (이중으로 막음):
--   ① 맨 앞에서 set_config('cropmon.skip_wake', 'on', true) — 이 트랜잭션에서만, 깨우는 함수가 이 값을 보고 건너뛴다.
--   ② net.http_request_queue 는 일반 표라 같은 트랜잭션의 요청은 일부러 낸 오류로 같이 취소된다.
--   끝에서 net.http_request_queue 줄 수와 마지막 깨우기 시각이 그대로인지도 항목으로 본다.
--   깨우기 판단(2분 창 · 스위치)은 시각 · 스위치를 인자로 받는 함수 ops.farm_calc_wake_due 의 판단표로 시험한다. 깨우기 스위치(ops.farm_calc_wake.enabled)는
--   기본이 꺼짐이라 요청 기록만 하고 안 부른다 — 이 확인 SQL 은 켜지도 않는다(8e 이후에 이 트랜잭션 안에서만 켰다 되돌려진다).
--
-- "오늘"을 바꿔야 하는 날짜 규칙은 안쪽 함수(sync_farm_seasons_at, farm_season_window)에 날짜를 넣어 시험한다.
-- 트리거가 거치는 시험(관수 기록 · 지난 줄 자르기 · 다시 계산 범위)은 진짜 오늘 d 를 기준으로 한 상대 날짜(d - 10 등)로 써서,
-- 어느 날 돌려도 같은 결과가 나온다.

drop table if exists pg_temp.d1_2_results;
create temp table d1_2_results (seq int, item text, ok boolean);

-- ---------------------------------------------------------------------------
-- 도우미 (이 세션 안에서만 있다)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.item(p_res jsonb, p_name text, p_ok boolean)
returns jsonb language sql as $f$
  select p_res || jsonb_build_array(jsonb_build_object(
    'seq', jsonb_array_length(p_res) + 1, 'item', p_name, 'ok', coalesce(p_ok, false)));
$f$;

-- 회원(authenticated) 으로 SQL 을 실행해 'ok' 또는 오류 코드(sqlstate)를 돌려준다. RLS · 열 권한이 실제로 걸린다.
create or replace function pg_temp.as_member(p_uid uuid, p_sql text)
returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  begin
    execute p_sql;
    v := 'ok';
  exception when others then
    v := sqlstate;
  end;
  execute 'reset role';
  return v;
end;
$f$;

-- 비회원(anon) 으로
create or replace function pg_temp.as_anon(p_sql text)
returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
  begin
    execute p_sql;
    v := 'ok';
  exception when others then
    v := sqlstate;
  end;
  execute 'reset role';
  return v;
end;
$f$;

-- 서버 키(service_role) 로 값을 돌려주는 SQL 을 실행한다 (croplib-dp 가 부르는 것과 같은 권한)
create or replace function pg_temp.as_service_int(p_sql text)
returns bigint language plpgsql as $f$
declare n bigint;
begin
  perform set_config('role', 'service_role', true);
  execute p_sql into n;
  execute 'reset role';
  return n;
end;
$f$;

-- 회원으로 읽어 줄 수를 센다 (RLS 가 걸린 상태)
create or replace function pg_temp.member_count(p_uid uuid, p_sql text)
returns bigint language plpgsql as $f$
declare n bigint;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  execute 'select count(*) from (' || p_sql || ') q' into n;
  execute 'reset role';
  return n;
end;
$f$;

-- 회원으로 고치기 · 지우기를 실행해 영향받은 줄 수를 돌려준다 (RLS 에 걸리면 0)
create or replace function pg_temp.member_rows(p_uid uuid, p_sql text)
returns int language plpgsql as $f$
declare n int;
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
  execute p_sql;
  get diagnostics n = row_count;
  execute 'reset role';
  return n;
end;
$f$;

create or replace function pg_temp.new_user()
returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (u, u::text || '@example.invalid', '{"provider":"kakao"}', '{"name":"가짜"}');
  -- v2.3(결정 0065)부터 동의한 회원만 농장 · 관수 기록을 넣고 고칠 수 있다. 이 파일의 가짜 회원은 모두 동의한 회원으로 만든다
  -- (동의 전 회원 시험은 l4_consent_check.sql). 가입 트리거가 줄을 만들었으면 고치고, 빠졌으면 넣는다.
  if to_regclass('public.members') is not null then
    insert into public.members (user_id, terms_version, terms_agreed_at, privacy_version, privacy_confirmed_at, age14_confirmed_at)
    values (u, 'terms-test', now(), 'privacy-test', now(), now())
    on conflict (user_id) do update
      set terms_version = excluded.terms_version, terms_agreed_at = excluded.terms_agreed_at,
          privacy_version = excluded.privacy_version, privacy_confirmed_at = excluded.privacy_confirmed_at,
          age14_confirmed_at = excluded.age14_confirmed_at;
  end if;
  return u;
end;
$f$;

-- 농장 하나(관리자 권한으로 직접 넣는다). 작물 공통이면 crop 'common' · 나머지는 null.
create or replace function pg_temp.new_farm(p_uid uuid, p_crop text, p_season text, p_kc text, p_mmdd text)
returns uuid language plpgsql as $f$
declare f uuid;
begin
  insert into public.farms (user_id, name, address, stn_id, irrigated_area_m2, crop_id, season_type_id, kc_set_id,
                            season_start_mmdd, season_start_source)
  values (p_uid, '가짜농장', '가짜 주소', '101', 1000, p_crop, p_season, p_kc, p_mmdd,
          case when p_mmdd is null then null else 'user' end)
  returning farm_id into f;
  return f;
end;
$f$;

-- 농장 하나와 그 딸린 줄 일곱 표를 만든다(관리자 권한): 농장 · 작기 줄 · 관수 기록 둘 · 계산 상태 · 결과 세 표. 농장 번호를 돌려준다.
create or replace function pg_temp.seed_farm_data(p_uid uuid, p_run bigint)
returns uuid language plpgsql as $f$
declare
  f uuid := pg_temp.new_farm(p_uid, 'apple', 'apple-main', 'apple-k3', '04-01');
  d date := public.kst_today();
begin
  delete from public.farm_seasons where farm_id = f;
  insert into public.farm_seasons (farm_id, crop_id, season_type_id, kc_set_id, start_date, end_date)
    values (f, 'apple', 'apple-main', 'apple-k3', d - 10, d + 100);
  insert into public.irrigation_logs (farm_id, date, volume_l) values (f, d - 1, 100), (f, d, 200);
  insert into public.farm_water_daily (farm_id, date, eto_src, status, calc_version) values (f, d, '관측', 'normal', 't');
  insert into public.farm_water_outlook (farm_id, run_id, target_date, lead_day, status, calc_version) values (f, p_run, d, 0, 'normal', 't');
  insert into public.farm_water_outlook_summary (farm_id, run_id, horizon_days, start_date, status_start, calc_version) values (f, p_run, 3, d, 'normal', 't');
  return f;
end;
$f$;

-- 한 농장에 남은 줄 수 (농장 표 일곱 합)
create or replace function pg_temp.rows_left(p_farm uuid)
returns bigint language sql as $f$
  select (select count(*) from public.farms where farm_id = p_farm)
       + (select count(*) from public.farm_seasons where farm_id = p_farm)
       + (select count(*) from public.irrigation_logs where farm_id = p_farm)
       + (select count(*) from public.farm_calc_status where farm_id = p_farm)
       + (select count(*) from public.farm_water_daily where farm_id = p_farm)
       + (select count(*) from public.farm_water_outlook where farm_id = p_farm)
       + (select count(*) from public.farm_water_outlook_summary where farm_id = p_farm);
$f$;

-- "끝남" 표시(done_at = 지금). 바로 다음 요청의 requested_at 이 확실히 더 크도록 아주 짧게(3ms) 쉰다.
create or replace function pg_temp.mark_done(p_farm uuid)
returns void language plpgsql as $f$
begin
  update public.farm_calc_status set done_at = clock_timestamp() where farm_id = p_farm;
  perform pg_sleep(0.003);
end;
$f$;

-- 작기 날짜 규칙 결과를 글자로: "시작~끝" (+ " 미정")
create or replace function pg_temp.win(p_mmdd text, p_len int, p_today text)
returns text language sql as $f$
  select to_char(start_date, 'YYYY-MM-DD') || '~' || to_char(end_date, 'YYYY-MM-DD')
         || case when start_unset then ' 미정' else '' end
  from public.farm_season_window(p_mmdd, p_len, p_today::date);
$f$;

-- 한 농장의 작기 줄을 "시작~끝" 글자들로
create or replace function pg_temp.rows_of(p_farm uuid)
returns text language sql as $f$
  select coalesce(string_agg(to_char(start_date, 'YYYY-MM-DD') || '~' || to_char(end_date, 'YYYY-MM-DD'), ' | ' order by start_date), '')
  from public.farm_seasons where farm_id = p_farm;
$f$;

do $check$
declare
  res        jsonb := '[]'::jsonb;
  d          date := public.kst_today();
  q_before   bigint;
  wake_before timestamptz;
  v          text;
  n          bigint;
  ok1        boolean;
  ok2        boolean;
  t          text;
  v_off        int;
  u_a uuid; u_b uuid; u_s uuid; u_u uuid; u_h uuid; u_g uuid; u_c uuid; u_o uuid; u_o2 uuid; u_i uuid; u_cm uuid;
  u_x uuid; u_r uuid; u_d uuid; u_d2 uuid; u_w uuid; u_bad uuid;
  f_a uuid; f_b uuid; f_s uuid; f_u uuid; f_h uuid; f_g uuid; f_c uuid; f_o uuid; f_o2 uuid; f_i uuid; f_cm uuid;
  f_x uuid; f_r uuid; f_d uuid; f_d2 uuid; f_w uuid;
  s_id uuid;
  s_upd timestamptz;
  req_before timestamptz;
  run_id_x bigint;
  scen_x text;
begin
  perform set_config('cropmon.skip_wake', 'on', true);
  select count(*) into q_before from net.http_request_queue;
  select w.last_wake_at into wake_before from ops.farm_calc_wake w where w.id = 1;

  begin
    -- ===================================================================
    -- 1. 표 · 권한(RLS) · 열 권한
    -- ===================================================================
    u_a := pg_temp.new_user();
    u_b := pg_temp.new_user();

    v := pg_temp.as_member(u_a, $q$insert into public.farms (name, address, stn_id, irrigated_area_m2, crop_id, season_type_id, kc_set_id, season_start_mmdd, season_start_source)
         values ('가짜농장', '가짜 주소', '101', 1000, 'apple', 'apple-main', 'apple-k3', '04-01', 'user')$q$);
    res := pg_temp.item(res, '1a 회원 A 가 자기 농장을 만들 수 있다 (user_id 는 로그인한 사람으로 저절로 채워짐)', v = 'ok');
    select farm_id into f_a from public.farms where user_id = u_a;
    res := pg_temp.item(res, '1b 농장이 A 의 것으로 생김', f_a is not null);

    res := pg_temp.item(res, '1c 두 번째 농장은 거절된다 (회원 1명 = 농장 1개, farms_one_per_user)',
      pg_temp.as_member(u_a, $q$insert into public.farms (name, address, stn_id, irrigated_area_m2, crop_id)
         values ('두번째', '가짜 주소', '101', 500, 'common')$q$) = '23505');

    res := pg_temp.item(res, '1d 남의 user_id 로 농장을 만들 수 없다 (RLS)',
      pg_temp.as_member(u_a, format($q$insert into public.farms (user_id, name, address, stn_id, irrigated_area_m2, crop_id)
         values (%L, '남의농장', '가짜 주소', '101', 500, 'common')$q$, u_b)) = '42501');

    res := pg_temp.item(res, '1e user_id 를 바꿀 수 없다 (열 권한)',
      pg_temp.as_member(u_a, format('update public.farms set user_id = %L where farm_id = %L', u_b, f_a)) = '42501');
    res := pg_temp.item(res, '1f farm_id · created_at 을 바꿀 수 없다 (열 권한)',
      pg_temp.as_member(u_a, format('update public.farms set farm_id = gen_random_uuid() where farm_id = %L', f_a)) = '42501'
      and pg_temp.as_member(u_a, format('update public.farms set created_at = now() where farm_id = %L', f_a)) = '42501');
    res := pg_temp.item(res, '1g 회원이 자기 농장 이름 · 면적은 고칠 수 있다',
      pg_temp.member_rows(u_a, format($q$update public.farms set name = '바꾼이름', irrigated_area_m2 = 1200 where farm_id = %L$q$, f_a)) = 1);

    f_b := pg_temp.new_farm(u_b, 'apple', 'apple-main', 'apple-k3', '04-01');
    res := pg_temp.item(res, '1h 회원 A 는 B 의 농장을 보지 못한다',
      pg_temp.member_count(u_a, format('select 1 from public.farms where farm_id = %L', f_b)) = 0);
    res := pg_temp.item(res, '1i 회원 A 는 B 의 농장을 고치지도 지우지도 못한다 (영향 0줄)',
      pg_temp.member_rows(u_a, format($q$update public.farms set name = '해킹' where farm_id = %L$q$, f_b)) = 0
      and pg_temp.member_rows(u_a, format('delete from public.farms where farm_id = %L', f_b)) = 0);

    ok1 := true;
    foreach t in array array['farms', 'farm_seasons', 'irrigation_logs', 'farm_calc_status', 'farm_water_daily',
                             'farm_water_outlook', 'farm_water_outlook_summary'] loop
      if pg_temp.as_anon('select 1 from public.' || t) <> '42501' then ok1 := false; end if;
    end loop;
    res := pg_temp.item(res, '1j 비회원은 새 표 7개를 하나도 읽지 못한다', ok1);

    ok1 := true; ok2 := true;
    foreach t in array array['farm_seasons', 'farm_calc_status', 'farm_water_daily', 'farm_water_outlook', 'farm_water_outlook_summary'] loop
      if pg_temp.as_member(u_a, 'insert into public.' || t || ' default values') <> '42501' then ok1 := false; end if;
      if pg_temp.as_member(u_a, 'delete from public.' || t) <> '42501' then ok1 := false; end if;
    end loop;
    if pg_temp.as_member(u_a, 'update public.farm_seasons set start_date = start_date') <> '42501' then ok2 := false; end if;
    if pg_temp.as_member(u_a, 'update public.farm_calc_status set error = null') <> '42501' then ok2 := false; end if;
    if pg_temp.as_member(u_a, 'update public.farm_water_daily set filled = filled') <> '42501' then ok2 := false; end if;
    if pg_temp.as_member(u_a, 'update public.farm_water_outlook set calc_version = calc_version') <> '42501' then ok2 := false; end if;
    if pg_temp.as_member(u_a, 'update public.farm_water_outlook_summary set calc_version = calc_version') <> '42501' then ok2 := false; end if;
    res := pg_temp.item(res, '1k 회원은 farm_seasons · farm_calc_status · farm_water_* 에 넣기 · 지우기를 못 한다', ok1);
    res := pg_temp.item(res, '1l 회원은 farm_seasons · farm_calc_status · farm_water_* 를 고치지도 못한다', ok2);

    -- 결과 표 줄 (관리자 권한으로 넣는다): A 와 B 각각
    insert into public.farm_water_daily (farm_id, date, eto_src, status, calc_version) values
      (f_a, d, '관측', 'normal', 't'), (f_b, d, '관측', 'normal', 't');
    res := pg_temp.item(res, '1m 회원은 자기 농장의 작기 · 계산 상태 · 물수지는 읽고 B 의 것은 못 읽는다',
      pg_temp.member_count(u_a, format('select 1 from public.farm_seasons where farm_id = %L', f_a)) >= 1
      and pg_temp.member_count(u_a, format('select 1 from public.farm_calc_status where farm_id = %L', f_a)) = 1
      and pg_temp.member_count(u_a, format('select 1 from public.farm_water_daily where farm_id = %L', f_a)) = 1
      and pg_temp.member_count(u_a, format('select 1 from public.farm_seasons where farm_id = %L', f_b)) = 0
      and pg_temp.member_count(u_a, format('select 1 from public.farm_calc_status where farm_id = %L', f_b)) = 0
      and pg_temp.member_count(u_a, format('select 1 from public.farm_water_daily where farm_id = %L', f_b)) = 0);

    -- ===================================================================
    -- 2. 입력 검사 (작물 · 작형 · 재배 방식 관계, 날짜, 면적)
    -- ===================================================================
    u_bad := pg_temp.new_user();
    res := pg_temp.item(res, '2a 작물 공통인데 작형이 있으면 거절',
      pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id, season_type_id)
        values ('주소', '101', 100, 'common', 'apple-main')$q$) = '23514');
    res := pg_temp.item(res, '2b 작물 공통이 아닌데 작형이 없으면 거절',
      pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id)
        values ('주소', '101', 100, 'apple')$q$) = '23514');
    res := pg_temp.item(res, '2c 작목과 안 맞는 작형 거절 (사과에 포도 시설가온)',
      pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id, season_type_id)
        values ('주소', '101', 100, 'apple', 'grape-heated')$q$) = '23503');
    res := pg_temp.item(res, '2d 작목과 안 맞는 재배 방식 거절 (포도에 사과 k1)',
      pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id, season_type_id, kc_set_id)
        values ('주소', '101', 100, 'grape', 'grape-heated', 'apple-k1')$q$) = '23503');
    res := pg_temp.item(res, '2e 작물 공통이면 재배 방식 · 시작일도 비어 있어야 한다',
      pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id, kc_set_id)
        values ('주소', '101', 100, 'common', 'apple-k1')$q$) in ('23514', '23503')
      and pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id, season_start_mmdd, season_start_source)
        values ('주소', '101', 100, 'common', '04-01', 'user')$q$) = '23514');
    res := pg_temp.item(res, '2f 시작일 02-29 · 04-31 · 06-31 · 13-01 · 형식 틀림 거절',
      (select bool_and(pg_temp.as_member(u_bad, format($q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id, season_type_id, season_start_mmdd, season_start_source)
        values ('주소', '101', 100, 'apple', 'apple-main', %L, 'user')$q$, m)) = '23514')
       from unnest(array['02-29', '04-31', '06-31', '13-01', '4-1', '00-10', '04-00']) m));
    res := pg_temp.item(res, '2g 시작일 02-28 · 12-31 · 04-30 은 통과하고, 미정(비움)도 통과한다 (is_valid_mmdd)',
      public.is_valid_mmdd('02-28') and public.is_valid_mmdd('12-31') and public.is_valid_mmdd('04-30')
      and not public.is_valid_mmdd('02-29') and public.is_valid_mmdd(null) is null);
    res := pg_temp.item(res, '2h 시작일이 비었는데 출처가 있거나 그 반대면 거절',
      pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id, season_type_id, season_start_source)
        values ('주소', '101', 100, 'apple', 'apple-main', 'user')$q$) = '23514'
      and pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id, season_type_id, season_start_mmdd)
        values ('주소', '101', 100, 'apple', 'apple-main', '04-01')$q$) = '23514');
    res := pg_temp.item(res, '2i 관개 면적 0 · 음수 거절, 주소 비어 있으면 거절, 지점 없으면 거절',
      pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id) values ('주소', '101', 0, 'common')$q$) = '23514'
      and pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id) values ('주소', '101', -5, 'common')$q$) = '23514'
      and pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id) values ('  ', '101', 100, 'common')$q$) = '23514'
      and pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id) values ('주소', '99999', 100, 'common')$q$) = '23503');
    res := pg_temp.item(res, '2j 토성 · 출처 · 단위 값이 사전 밖이면 거절',
      pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id, soil_code) values ('주소', '101', 100, 'common', 'mud')$q$) = '23503'
      and pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id, soil_source) values ('주소', '101', 100, 'common', 'guess')$q$) = '23514'
      and pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2, crop_id, area_input_unit) values ('주소', '101', 100, 'common', 'acre')$q$) = '23514');
    v := pg_temp.as_member(u_bad, $q$insert into public.farms (address, stn_id, irrigated_area_m2) values ('주소', '101', 100)$q$);
    res := pg_temp.item(res, '2k 작물 공통 농장이 기본값(이름 "내 농장" · 토성 양토 · 단위 m2 · 출처 default)으로 만들어진다',
      v = 'ok'
      and exists (select 1 from public.farms where user_id = u_bad and name = '내 농장' and soil_code = 'loam'
                  and area_input_unit = 'm2' and soil_source = 'default' and crop_id = 'common' and season_type_id is null));

    -- ===================================================================
    -- 3. 작기 연도 규칙 — farm_season_window (날짜 계산만)
    -- ===================================================================
    res := pg_temp.item(res, '3a 사과 04-01 (210일): 작기 전 · 시작 당일 · 중 · 끝나는 날 당일은 모두 2026-04-01~2026-10-27',
      pg_temp.win('04-01', 210, '2026-03-15') = '2026-04-01~2026-10-27'
      and pg_temp.win('04-01', 210, '2026-04-01') = '2026-04-01~2026-10-27'
      and pg_temp.win('04-01', 210, '2026-07-01') = '2026-04-01~2026-10-27'
      and pg_temp.win('04-01', 210, '2026-10-27') = '2026-04-01~2026-10-27');
    res := pg_temp.item(res, '3b 사과 끝난 다음 날은 다음 작기 2027-04-01~2027-10-27',
      pg_temp.win('04-01', 210, '2026-10-28') = '2027-04-01~2027-10-27'
      and pg_temp.win('04-01', 210, '2026-11-20') = '2027-04-01~2027-10-27');
    res := pg_temp.item(res, '3c 배추 07-01 (90일): 2026-07-01~2026-09-28',
      pg_temp.win('07-01', 90, '2026-07-01') = '2026-07-01~2026-09-28'
      and pg_temp.win('07-01', 90, '2026-09-28') = '2026-07-01~2026-09-28'
      and pg_temp.win('07-01', 90, '2026-09-29') = '2027-07-01~2027-09-28');
    res := pg_temp.item(res, '3d 포도 비가림 04-20 (205일): 2026-04-20~2026-11-10, 다음 날부터는 2027 작기',
      pg_temp.win('04-20', 205, '2026-06-01') = '2026-04-20~2026-11-10'
      and pg_temp.win('04-20', 205, '2026-11-10') = '2026-04-20~2026-11-10'
      and pg_temp.win('04-20', 205, '2026-11-11') = '2027-04-20~2027-11-10');
    res := pg_temp.item(res, '3e 포도 시설가온 12-01 (190일): 2026-11-17 은 다음 작기 2026-12-01~2027-06-08',
      pg_temp.win('12-01', 190, '2026-11-17') = '2026-12-01~2027-06-08');
    res := pg_temp.item(res, '3f 시설가온 12-01: 2027-02-10 은 작기 중(끝 2027-06-08), 끝나는 날 당일도 작기 중, 다음 날은 2027-12-01~2028-06-07 (윤년)',
      pg_temp.win('12-01', 190, '2027-02-10') = '2026-12-01~2027-06-08'
      and pg_temp.win('12-01', 190, '2027-06-08') = '2026-12-01~2027-06-08'
      and pg_temp.win('12-01', 190, '2027-06-09') = '2027-12-01~2028-06-07');
    res := pg_temp.item(res, '3g 시설가온 미정(비움): 1월 1일로 대신하고 "미정" 표시 (2027-01-01~2027-07-09)',
      pg_temp.win(null, 190, '2026-11-17') = '2027-01-01~2027-07-09 미정'
      and pg_temp.win(null, 190, '2027-03-01') = '2027-01-01~2027-07-09 미정'
      and pg_temp.win(null, 190, '2027-07-10') = '2028-01-01~2028-07-08 미정');
    res := pg_temp.item(res, '3h 윤년 경계: 03-01 시작 300일, 2028-02-29 는 다음 작기 2028-03-01~2028-12-25',
      pg_temp.win('03-01', 300, '2028-02-29') = '2028-03-01~2028-12-25');
    v := null;
    begin perform pg_temp.win('04-01', 0, '2026-01-01'); v := 'ok'; exception when others then v := sqlstate; end;
    ok1 := v = '22023';
    begin perform pg_temp.win('04-01', 367, '2026-01-01'); v := 'ok'; exception when others then v := sqlstate; end;
    res := pg_temp.item(res, '3i 작기 일수가 1~366 밖이면 거절', ok1 and v = '22023');

    -- ===================================================================
    -- 4. sync_farm_seasons_at — 날짜 줄 만들기 · 고치기 (날짜를 넣어 시험)
    -- ===================================================================
    u_s := pg_temp.new_user();
    f_s := pg_temp.new_farm(u_s, 'apple', 'apple-main', 'apple-k3', '04-01');
    res := pg_temp.item(res, '4a 농장을 만들면 작기 줄이 하나 생기고 규칙(오늘 기준)과 같다',
      (select count(*) from public.farm_seasons where farm_id = f_s) = 1
      and exists (select 1 from public.farm_seasons s, public.farm_season_window('04-01', 210, d) w
                   where s.farm_id = f_s and s.start_date = w.start_date and s.end_date = w.end_date
                     and s.crop_id = 'apple' and s.season_type_id = 'apple-main' and s.kc_set_id = 'apple-k3' and not s.start_unset));
    res := pg_temp.item(res, '4b 농장을 만들면 계산 상태 줄도 저절로 생긴다',
      exists (select 1 from public.farm_calc_status where farm_id = f_s));

    delete from public.farm_seasons where farm_id = f_s;
    perform public.sync_farm_seasons_at(f_s, '2026-11-20');
    res := pg_temp.item(res, '4c 오늘이 2026-11-20 이면 다음 작기 한 줄 2027-04-01~2027-10-27',
      pg_temp.rows_of(f_s) = '2027-04-01~2027-10-27');
    select farm_season_id into s_id from public.farm_seasons where farm_id = f_s;
    perform public.sync_farm_seasons_at(f_s, '2027-05-01');
    res := pg_temp.item(res, '4d 작기 중에 다시 불러도 같은 줄 그대로 (새 줄 안 생김)',
      pg_temp.rows_of(f_s) = '2027-04-01~2027-10-27' and exists (select 1 from public.farm_seasons where farm_season_id = s_id));
    perform public.sync_farm_seasons_at(f_s, '2027-10-27');
    res := pg_temp.item(res, '4e 끝나는 날 당일(2027-10-27)은 아직 작기 중 — 새 줄 안 생김',
      pg_temp.rows_of(f_s) = '2027-04-01~2027-10-27');
    select updated_at into s_upd from public.farm_seasons where farm_season_id = s_id;
    perform public.sync_farm_seasons_at(f_s, '2027-10-28');
    res := pg_temp.item(res, '4f 끝난 다음 날(2027-10-28)은 지난 줄이 남고 다음 작기 줄이 생긴다 (2028 윤년 작기 2028-04-01~2028-10-27)',
      pg_temp.rows_of(f_s) = '2027-04-01~2027-10-27 | 2028-04-01~2028-10-27');
    res := pg_temp.item(res, '4g 지난 줄은 고치지 않는다 (같은 줄 · 수정 시각 그대로)',
      exists (select 1 from public.farm_seasons where farm_season_id = s_id and updated_at = s_upd));
    perform public.sync_farm_seasons_at(f_s, '2027-10-28');
    res := pg_temp.item(res, '4h 다시 불러도 두 줄 그대로 (여러 번 불러도 같은 결과)',
      pg_temp.rows_of(f_s) = '2027-04-01~2027-10-27 | 2028-04-01~2028-10-27');

    -- 작물 공통으로 바꾸면: 지금 · 앞으로 올 줄은 지우고 지난 줄은 남긴다
    alter table public.farms disable trigger farms_after_update_crop;
    update public.farms set crop_id = 'common', season_type_id = null, kc_set_id = null,
      season_start_mmdd = null, season_start_source = null where farm_id = f_s;
    alter table public.farms enable trigger farms_after_update_crop;
    perform public.sync_farm_seasons_at(f_s, '2027-10-28');
    res := pg_temp.item(res, '4i 작물 공통이면 줄을 만들지 않고 앞으로 올 줄은 지운다 — 지난 줄은 남는다',
      pg_temp.rows_of(f_s) = '2027-04-01~2027-10-27');

    u_u := pg_temp.new_user();
    f_u := pg_temp.new_farm(u_u, 'grape', 'grape-heated', 'grape-k1', null);
    delete from public.farm_seasons where farm_id = f_u;
    perform public.sync_farm_seasons_at(f_u, '2026-11-17');
    res := pg_temp.item(res, '4j 시설가온 시작 미정이면 1월 1일로 대신하고 start_unset = true',
      pg_temp.rows_of(f_u) = '2027-01-01~2027-07-09'
      and (select start_unset from public.farm_seasons where farm_id = f_u));

    u_h := pg_temp.new_user();
    f_h := pg_temp.new_farm(u_h, 'grape', 'grape-heated', 'grape-k1', '12-01');
    delete from public.farm_seasons where farm_id = f_h;
    perform public.sync_farm_seasons_at(f_h, '2026-11-17');
    ok1 := pg_temp.rows_of(f_h) = '2026-12-01~2027-06-08';
    select farm_season_id into s_id from public.farm_seasons where farm_id = f_h;
    perform public.sync_farm_seasons_at(f_h, '2027-02-10');
    res := pg_temp.item(res, '4k 시설가온 12-01: 2026-11-17 은 다음 작기, 2027-02-10 은 같은 줄이 작기 중 (끝 2027-06-08)',
      ok1 and pg_temp.rows_of(f_h) = '2026-12-01~2027-06-08'
      and exists (select 1 from public.farm_seasons where farm_season_id = s_id and not start_unset));

    u_g := pg_temp.new_user();
    f_g := pg_temp.new_farm(u_g, 'grape', 'grape-rainshelter', 'grape-k1', '04-20');
    delete from public.farm_seasons where farm_id = f_g;
    perform public.sync_farm_seasons_at(f_g, '2026-11-20');
    u_c := pg_temp.new_user();
    f_c := pg_temp.new_farm(u_c, 'kimchi_cabbage', 'kimchi_cabbage-summer', 'kimchi_cabbage-k1', '07-01');
    delete from public.farm_seasons where farm_id = f_c;
    perform public.sync_farm_seasons_at(f_c, '2026-11-20');
    res := pg_temp.item(res, '4l 포도 비가림 04-20 은 2027-04-20~2027-11-10, 배추 07-01 은 2027-07-01~2027-09-28',
      pg_temp.rows_of(f_g) = '2027-04-20~2027-11-10' and pg_temp.rows_of(f_c) = '2027-07-01~2027-09-28');

    ok1 := false; ok2 := false;
    begin
      insert into public.farm_seasons (farm_id, crop_id, season_type_id, start_date, end_date)
      values (f_g, 'grape', 'grape-rainshelter', '2031-01-01', '2032-03-01');
    exception when others then ok1 := sqlstate = '23514';
    end;
    begin
      insert into public.farm_seasons (farm_id, crop_id, season_type_id, start_date, end_date)
      values (f_g, 'grape', 'grape-rainshelter', '2031-05-02', '2031-05-01');
    exception when others then ok2 := sqlstate = '23514';
    end;
    v := null;
    begin
      insert into public.farm_seasons (farm_id, crop_id, season_type_id, start_date, end_date)
      values (f_g, 'grape', 'grape-rainshelter', '2027-06-01', '2027-06-30');
    exception when others then v := sqlstate;
    end;
    res := pg_temp.item(res, '4n 1년(366일) 넘는 작기 · 끝이 시작보다 빠른 작기 거절', ok1 and ok2);
    res := pg_temp.item(res, '4o 같은 농장의 날짜가 겹치는 작기 줄은 거절 (배제 제약)', v = '23P01');

    n := pg_temp.as_service_int('select public.sync_all_farm_seasons()');
    res := pg_temp.item(res, '4p sync_all_farm_seasons(): 서버 키로 부르면 처리한 농장 수(= 전체 농장 수)를 돌려주고, 회원 · 비회원은 못 부른다',
      n = (select count(*) from public.farms) and n >= 6
      and pg_temp.as_member(u_a, 'select public.sync_all_farm_seasons()') = '42501'
      and pg_temp.as_anon('select public.sync_all_farm_seasons()') = '42501'
      and has_function_privilege('service_role', 'public.sync_all_farm_seasons()', 'execute')
      and not has_function_privilege('authenticated', 'public.sync_all_farm_seasons()', 'execute')
      and not has_function_privilege('anon', 'public.sync_all_farm_seasons()', 'execute'));

    -- ===================================================================
    -- 5. 지난 줄과 겹칠 때: 지난 줄의 끝을 자르고, 통째로 겹치면 지운다 (진짜 오늘 d 기준)
    -- ===================================================================
    v_off := 60;
    while to_char(d - v_off, 'MM-DD') = '02-29' loop v_off := v_off + 1; end loop;
    u_o := pg_temp.new_user();
    f_o := pg_temp.new_farm(u_o, 'common', null, null, null);
    insert into public.farm_seasons (farm_id, crop_id, season_type_id, kc_set_id, start_date, end_date)
      values (f_o, 'apple', 'apple-main', 'apple-k3', d - 100, d - 50);
    update public.farm_calc_status set requested_at = null, recalc_from = null, done_at = null where farm_id = f_o;
    update public.farms set crop_id = 'grape', season_type_id = 'grape-heated', kc_set_id = 'grape-k1',
      season_start_mmdd = to_char(d - v_off, 'MM-DD'), season_start_source = 'user' where farm_id = f_o;
    res := pg_temp.item(res, '5a 지난 줄과 겹치면 지난 줄의 끝을 새 줄 시작 전날로 자른다 (사과 → 시설가온 예)',
      pg_temp.rows_of(f_o) = to_char(d - 100, 'YYYY-MM-DD') || '~' || to_char(d - v_off - 1, 'YYYY-MM-DD')
        || ' | ' || to_char(d - v_off, 'YYYY-MM-DD') || '~' || to_char(d - v_off + 189, 'YYYY-MM-DD'));
    res := pg_temp.item(res, '5b 새 줄의 시작은 회원이 고른 날짜 그대로이고 두 줄은 겹치지 않는다',
      (select count(*) from public.farm_seasons a join public.farm_seasons b
         on a.farm_id = b.farm_id and a.farm_season_id < b.farm_season_id
        and daterange(a.start_date, a.end_date, '[]') && daterange(b.start_date, b.end_date, '[]')
       where a.farm_id = f_o) = 0
      and exists (select 1 from public.farm_seasons where farm_id = f_o and season_type_id = 'grape-heated' and start_date = d - v_off));
    res := pg_temp.item(res, '5c 자른 기간부터 다시 계산된다 — recalc_from 이 새 줄 시작일(자른 기간의 첫날)이다',
      (select recalc_from = d - v_off and requested_at is not null from public.farm_calc_status where farm_id = f_o));

    u_o2 := pg_temp.new_user();
    f_o2 := pg_temp.new_farm(u_o2, 'common', null, null, null);
    insert into public.farm_seasons (farm_id, crop_id, season_type_id, kc_set_id, start_date, end_date)
      values (f_o2, 'apple', 'apple-main', 'apple-k3', d - v_off + 2, d - v_off + 5);
    update public.farms set crop_id = 'grape', season_type_id = 'grape-heated', kc_set_id = 'grape-k1',
      season_start_mmdd = to_char(d - v_off, 'MM-DD'), season_start_source = 'user' where farm_id = f_o2;
    res := pg_temp.item(res, '5d 지난 줄이 새 줄 안에 통째로 들어가면 지운다 (새 줄 한 줄만 남음)',
      (select count(*) from public.farm_seasons where farm_id = f_o2) = 1
      and exists (select 1 from public.farm_seasons where farm_id = f_o2 and season_type_id = 'grape-heated'));

    -- 시작일을 바꾸면 지금 줄이 고쳐지고 새 줄이 안 생긴다. 지난 줄은 그대로.
    u_x := pg_temp.new_user();
    f_x := pg_temp.new_farm(u_x, 'apple', 'apple-main', 'apple-k3', '04-01');
    insert into public.farm_seasons (farm_id, crop_id, season_type_id, kc_set_id, start_date, end_date)
      values (f_x, 'apple', 'apple-main', 'apple-k3', d - 800, d - 700);
    select farm_season_id into s_id from public.farm_seasons where farm_id = f_x and start_date > d - 600;
    select updated_at into s_upd from public.farm_seasons where farm_id = f_x and start_date = d - 800;
    update public.farms set season_start_mmdd = '06-15' where farm_id = f_x;
    res := pg_temp.item(res, '5e 시작일을 바꾸면 지금 줄이 고쳐지고 (같은 줄, 새 줄 없음) 지난 줄은 그대로다',
      (select count(*) from public.farm_seasons where farm_id = f_x) = 2
      and exists (select 1 from public.farm_seasons s, public.farm_season_window('06-15', 210, d) w
                   where s.farm_season_id = s_id and s.start_date = w.start_date and s.end_date = w.end_date)
      and exists (select 1 from public.farm_seasons where farm_id = f_x and start_date = d - 800 and end_date = d - 700 and updated_at = s_upd));

    -- ===================================================================
    -- 6. 관수 기록 날짜 규칙 (회원으로 넣는다 — RLS · 열 권한 · 트리거가 모두 걸린다)
    -- ===================================================================
    u_i := pg_temp.new_user();
    f_i := pg_temp.new_farm(u_i, 'apple', 'apple-main', 'apple-k3', '04-01');
    delete from public.farm_seasons where farm_id = f_i;
    insert into public.farm_seasons (farm_id, crop_id, season_type_id, kc_set_id, start_date, end_date)
      values (f_i, 'apple', 'apple-main', 'apple-k3', d - 10, d + 100);

    res := pg_temp.item(res, '6a 작기 안(시작일 ~ 오늘)은 넣을 수 있다: 오늘 · 시작일 당일 · 하루 여러 줄',
      pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (farm_id, date, volume_l, input_unit, memo) values (%L, %L, 1500, 'L', '오늘')$q$, f_i, d)) = 'ok'
      and pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (farm_id, date, volume_l, input_unit) values (%L, %L, 2, 'ton')$q$, f_i, d - 10)) = 'ok'
      and pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 700)$q$, f_i, d)) = 'ok');
    res := pg_temp.item(res, '6b 작기 시작 전날 · 미래(내일)는 거절',
      pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 100)$q$, f_i, d - 11)) = '23514'
      and pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 100)$q$, f_i, d + 1)) = '23514');
    res := pg_temp.item(res, '6c 양 0 · 음수, 단위가 L · ton 이 아닌 것, 메모 501자는 거절',
      pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 0)$q$, f_i, d)) = '23514'
      and pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, -3)$q$, f_i, d)) = '23514'
      and pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (farm_id, date, volume_l, input_unit) values (%L, %L, 5, 'kg')$q$, f_i, d)) = '23514'
      and pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (farm_id, date, volume_l, memo) values (%L, %L, 5, %L)$q$, f_i, d, repeat('가', 501))) = '23514');
    res := pg_temp.item(res, '6d 남의 농장에 넣을 수 없다 (RLS), log_id · created_at 을 정할 수 없다 (열 권한)',
      pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 100)$q$, f_b, d)) in ('42501', '23514')
      and pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (log_id, farm_id, date, volume_l) values (gen_random_uuid(), %L, %L, 100)$q$, f_i, d)) = '42501'
      and pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (farm_id, date, volume_l, created_at) values (%L, %L, 100, now())$q$, f_i, d)) = '42501');

    insert into public.irrigation_logs (farm_id, date, volume_l) values (f_i, d - 5, 300);
    v := pg_temp.as_member(u_i, format($q$update public.irrigation_logs set date = %L where farm_id = %L and date = %L and volume_l = 300$q$, d + 1, f_i, d - 5));
    ok1 := v = '23514';
    v := pg_temp.as_member(u_i, format($q$update public.irrigation_logs set date = %L where farm_id = %L and date = %L and volume_l = 300$q$, d - 11, f_i, d - 5));
    ok1 := ok1 and v = '23514';
    n := pg_temp.member_rows(u_i, format($q$update public.irrigation_logs set date = %L where farm_id = %L and date = %L and volume_l = 300$q$, d - 4, f_i, d - 5));
    res := pg_temp.item(res, '6e 고치기: 날짜를 작기 밖(미래 · 시작 전)으로 바꾸면 거절, 작기 안으로는 가능', ok1 and n = 1);
    res := pg_temp.item(res, '6f farm_id 를 바꿀 수 없다 (열 권한), 다른 회원은 이 기록을 보지도 고치지도 지우지도 못한다',
      pg_temp.as_member(u_i, format('update public.irrigation_logs set farm_id = %L where farm_id = %L', f_b, f_i)) = '42501'
      and pg_temp.member_count(u_a, format('select 1 from public.irrigation_logs where farm_id = %L', f_i)) = 0
      and pg_temp.member_rows(u_a, format('update public.irrigation_logs set memo = ''x'' where farm_id = %L', f_i)) = 0
      and pg_temp.member_rows(u_a, format('delete from public.irrigation_logs where farm_id = %L', f_i)) = 0);

    -- 작기 시작일을 늦춰 작기 밖이 된 기존 기록: 남고, 메모는 고칠 수 있고, 지울 수 있고, 날짜는 못 바꾼다
    update public.farm_seasons set start_date = d - 2 where farm_id = f_i;
    select count(*) into n from public.irrigation_logs where farm_id = f_i and date < d - 2;
    res := pg_temp.item(res, '6g 작기 시작일을 늦춰 작기 밖이 된 기존 기록은 지워지지도 막히지도 않는다',
      n >= 2 and (select count(*) from public.irrigation_logs where farm_id = f_i) >= 4);
    res := pg_temp.item(res, '6h 작기 밖이 된 기존 기록의 메모 · 양은 고칠 수 있다 (날짜가 안 바뀌면 검사 안 함)',
      pg_temp.member_rows(u_i, format($q$update public.irrigation_logs set memo = '고침', volume_l = 333 where farm_id = %L and date = %L and volume_l = 2$q$, f_i, d - 10)) = 1);
    v := pg_temp.as_member(u_i, format($q$update public.irrigation_logs set date = %L where farm_id = %L and date = %L and volume_l = 333$q$, d - 9, f_i, d - 10));
    n := pg_temp.member_rows(u_i, format('delete from public.irrigation_logs where farm_id = %L and date = %L', f_i, d - 10));
    res := pg_temp.item(res, '6i 작기 밖이 된 기존 기록의 날짜를 바꾸는 것은 거절, 지우는 것은 언제나 된다', v = '23514' and n = 1);

    -- 지금 줄 경계: 끝나는 날 당일은 작기 중, 다음 날은 지난 줄 / 시작 전 줄만 있으면 모두 거절 / 작물 공통은 거절
    update public.farm_seasons set start_date = d - 100, end_date = d where farm_id = f_i;
    ok1 := pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 11)$q$, f_i, d)) = 'ok';
    update public.farm_seasons set end_date = d - 1 where farm_id = f_i;
    ok2 := pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 12)$q$, f_i, d - 5)) = '23514';
    res := pg_temp.item(res, '6j 끝나는 날 당일 → 작기 중이라 기록이 들어가고, 다음 날 → 지난 줄이라 거절된다', ok1 and ok2);
    update public.farm_seasons set start_date = d + 30, end_date = d + 100 where farm_id = f_i;
    res := pg_temp.item(res, '6k 작기 시작 전 줄만 있으면(예: 다음 작기) 관수 기록은 모두 거절된다 (작기 안만)',
      pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 11)$q$, f_i, d)) = '23514'
      and pg_temp.as_member(u_i, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 11)$q$, f_i, d + 30)) = '23514');

    u_cm := pg_temp.new_user();
    f_cm := pg_temp.new_farm(u_cm, 'common', null, null, null);
    res := pg_temp.item(res, '6l 작기 줄이 없는 작물 공통 농장은 관수 기록을 거절한다',
      pg_temp.as_member(u_cm, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 11)$q$, f_cm, d)) = '23514');

    -- ===================================================================
    -- 7. 다시 계산 범위 (recalc_from) 규칙
    -- ===================================================================
    u_r := pg_temp.new_user();
    f_r := pg_temp.new_farm(u_r, 'apple', 'apple-main', 'apple-k3', '04-01');
    delete from public.farm_seasons where farm_id = f_r;
    insert into public.farm_seasons (farm_id, crop_id, season_type_id, kc_set_id, start_date, end_date)
      values (f_r, 'apple', 'apple-main', 'apple-k3', d - 30, d + 100);
    update public.farm_calc_status set requested_at = null, recalc_from = null, done_at = null where farm_id = f_r;

    perform pg_temp.as_member(u_r, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 100)$q$, f_r, d - 3));
    res := pg_temp.item(res, '7a 관수 기록을 넣으면 요청이 기록되고 recalc_from = 그 기록의 날 (깨우기 스위치는 기본 꺼짐이어도)',
      (select requested_at is not null and recalc_from = d - 3 from public.farm_calc_status where farm_id = f_r));
    perform pg_temp.as_member(u_r, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 100)$q$, f_r, d - 7));
    ok1 := (select recalc_from = d - 7 from public.farm_calc_status where farm_id = f_r);
    perform pg_temp.as_member(u_r, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 100)$q$, f_r, d - 1));
    res := pg_temp.item(res, '7b 기다리는 중에는 더 이른 날로만 당긴다 (d-3 → d-7, 이어서 d-1 을 넣어도 d-7 그대로)',
      ok1 and (select recalc_from = d - 7 from public.farm_calc_status where farm_id = f_r));

    perform pg_temp.mark_done(f_r);
    perform pg_temp.as_member(u_r, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 100)$q$, f_r, d - 2));
    res := pg_temp.item(res, '7c 끝난 뒤의 새 요청은 새 날로 시작한다 (recalc_from = d-2, requested_at > done_at)',
      (select recalc_from = d - 2 and requested_at > done_at from public.farm_calc_status where farm_id = f_r));

    perform pg_temp.as_member(u_r, format($q$update public.irrigation_logs set date = %L where farm_id = %L and date = %L$q$, d - 9, f_r, d - 2));
    res := pg_temp.item(res, '7d 기록 날짜를 고치면 옛 날과 새 날 중 이른 날 (d-2 → d-9 이면 d-9)',
      (select recalc_from = d - 9 from public.farm_calc_status where farm_id = f_r));

    perform pg_temp.mark_done(f_r);
    perform pg_temp.as_member(u_r, format('delete from public.irrigation_logs where farm_id = %L and date = %L', f_r, d - 9));
    res := pg_temp.item(res, '7e 끝난 뒤 기록을 지우면 그 기록의 날로 새 요청 (recalc_from = d-9)',
      (select recalc_from = d - 9 and requested_at > done_at from public.farm_calc_status where farm_id = f_r));

    perform pg_temp.mark_done(f_r);
    select requested_at into req_before from public.farm_calc_status where farm_id = f_r;
    perform pg_temp.as_member(u_r, format($q$update public.irrigation_logs set memo = '메모만' where farm_id = %L and date = %L$q$, f_r, d - 3));
    res := pg_temp.item(res, '7f 메모만 고치면 다시 계산을 요청하지 않는다',
      (select requested_at = req_before and requested_at <= done_at from public.farm_calc_status where farm_id = f_r));

    perform pg_temp.mark_done(f_r);
    update public.farm_seasons set start_date = d - 20 where farm_id = f_r;
    ok1 := (select recalc_from = d - 30 and requested_at > done_at from public.farm_calc_status where farm_id = f_r);
    perform pg_temp.mark_done(f_r);
    update public.farm_seasons set start_date = d - 40 where farm_id = f_r;
    res := pg_temp.item(res, '7g 작기 시작일 변경: 옛 시작일과 새 시작일 중 이른 날 (d-30→d-20 이면 d-30, d-20→d-40 이면 d-40)',
      ok1 and (select recalc_from = d - 40 from public.farm_calc_status where farm_id = f_r));

    ok1 := true;
    foreach t in array array['update public.farms set stn_id = ''105''', 'update public.farms set soil_code = ''sand''', 'update public.farms set irrigated_area_m2 = 777'] loop
      perform pg_temp.mark_done(f_r);
      execute t || format(' where farm_id = %L', f_r);
      if not (select recalc_from = d - 40 and requested_at > done_at from public.farm_calc_status where farm_id = f_r) then ok1 := false; end if;
    end loop;
    res := pg_temp.item(res, '7h 지점 · 토성 · 면적을 바꾸면 지금 작기 줄의 시작일(d-40)부터 다시 계산한다', ok1);

    update public.farm_calc_status set requested_at = null, recalc_from = null, done_at = null where farm_id = f_cm;
    update public.farms set irrigated_area_m2 = 321 where farm_id = f_cm;
    res := pg_temp.item(res, '7i 작기 줄이 없는 작물 공통 농장은 면적을 바꿔도 다시 계산을 요청하지 않는다',
      (select requested_at is null from public.farm_calc_status where farm_id = f_cm));

    update public.farm_calc_status set requested_at = null, recalc_from = null, done_at = null where farm_id = f_r;
    insert into public.farm_seasons (farm_id, crop_id, season_type_id, kc_set_id, start_date, end_date)
      values (f_r, 'apple', 'apple-main', 'apple-k3', d - 400, d - 300);
    update public.farm_seasons set end_date = d - 301 where farm_id = f_r and start_date = d - 400;
    delete from public.farm_seasons where farm_id = f_r and start_date = d - 400;
    res := pg_temp.item(res, '7j 지난 줄(끝이 오늘 전)이 바뀌거나 지워져도 다시 계산을 요청하지 않는다',
      (select requested_at is null from public.farm_calc_status where farm_id = f_r));

    -- ===================================================================
    -- 8. 깨우기 판단 · 스위치(기본 꺼짐) · 건너뛰기 (진짜로 깨우지는 않는다)
    -- ===================================================================
    res := pg_temp.item(res, '8a 깨우기 판단(스위치 켬) — 마지막 깨우기가 없으면 깨운다, 2분 안(1분 59초)은 안 깨우고 2분부터 깨운다',
      ops.farm_calc_wake_due('2026-11-20 10:00:00+09', null, false, false, true)
      and not ops.farm_calc_wake_due('2026-11-20 10:00:00+09', '2026-11-20 09:58:01+09', false, false, true)
      and ops.farm_calc_wake_due('2026-11-20 10:00:00+09', '2026-11-20 09:58:00+09', false, false, true)
      and ops.farm_calc_wake_due('2026-11-20 10:00:00+09', '2026-11-20 09:00:00+09', false, false, true));
    res := pg_temp.item(res, '8b 깨우기 판단(스위치 켬) — 보충 예약은 마지막 깨우기 뒤에 들어온 기다리는 요청이 있어야 깨운다',
      not ops.farm_calc_wake_due('2026-11-20 10:00:00+09', '2026-11-20 09:00:00+09', false, true, true)
      and ops.farm_calc_wake_due('2026-11-20 10:00:00+09', '2026-11-20 09:00:00+09', true, true, true)
      and not ops.farm_calc_wake_due('2026-11-20 10:00:00+09', '2026-11-20 09:59:00+09', true, true, true)
      and ops.farm_calc_wake_due('2026-11-20 10:00:00+09', null, true, true, true)
      and not ops.farm_calc_wake_due('2026-11-20 10:00:00+09', null, false, true, true));
    res := pg_temp.item(res, '8c 깨우기 판단(스위치 꺼짐) — 다른 조건이 다 맞아도(처음 · 2분 지남 · 기다리는 요청 있음) 안 부른다',
      not ops.farm_calc_wake_due('2026-11-20 10:00:00+09', null, true, false, false)
      and not ops.farm_calc_wake_due('2026-11-20 10:00:00+09', '2026-11-20 09:00:00+09', true, true, false)
      and not ops.farm_calc_wake_due('2026-11-20 10:00:00+09', null, true, true, null));
    res := pg_temp.item(res, '8d 깨우기 스위치 enabled 는 기본이 꺼짐이고 비어 있을 수 없다 (표 정의)',
      (select column_default = 'false' and is_nullable = 'NO' and data_type = 'boolean'
         from information_schema.columns
        where table_schema = 'ops' and table_name = 'farm_calc_wake' and column_name = 'enabled'));

    -- 스위치가 꺼져 있으면(기본) 건너뛰기 설정이 없어도 아무것도 안 부른다: 저장 트리거 쪽도 보충 예약 쪽도, 마지막 깨우기 시각도 그대로.
    -- (이 시험은 건너뛰기 설정을 잠시 끈다. 꺼짐이 막지 못해도 같은 트랜잭션이 되돌려지며 요청이 함께 취소된다.)
    perform set_config('cropmon.skip_wake', '', true);
    update ops.farm_calc_wake set enabled = false where id = 1;
    ok1 := not ops.farm_calc_try_wake(false) and not ops.farm_calc_try_wake(true);
    perform ops.farm_calc_sweep();
    res := pg_temp.item(res, '8e 스위치가 꺼져 있으면 저장 트리거 쪽 · 보충 예약 쪽 모두 아무것도 안 깨우고 마지막 깨우기 시각도 안 바꾼다 (건너뛰기 설정 없이도)',
      ok1
      and (select last_wake_at is not distinct from wake_before from ops.farm_calc_wake where id = 1)
      and (select count(*) from net.http_request_queue) = q_before);
    perform set_config('cropmon.skip_wake', 'on', true);
    -- 꺼짐이어도 요청 기록은 한다 (croplib-dp 정기 계산이 따라잡는다)
    update public.farm_calc_status set requested_at = null, recalc_from = null, done_at = null where farm_id = f_r;
    perform pg_temp.as_member(u_r, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 7)$q$, f_r, d - 2));
    res := pg_temp.item(res, '8f 스위치가 꺼져 있어도 요청 기록(requested_at · recalc_from)은 그대로 남긴다',
      (select requested_at is not null and recalc_from = d - 2 from public.farm_calc_status where farm_id = f_r));

    -- 이제 스위치를 켜고(이 트랜잭션 안에서만) 건너뛰기 설정이 막는지 본다
    update ops.farm_calc_wake set enabled = true where id = 1;
    res := pg_temp.item(res, '8g 스위치를 켜도 건너뛰기 설정이면 깨우는 함수도 보충 예약도 아무것도 하지 않는다 (깨우기 시각 그대로)',
      not ops.farm_calc_try_wake(false)
      and not ops.farm_calc_try_wake(true)
      and (select last_wake_at is not distinct from wake_before from ops.farm_calc_wake where id = 1));
    perform ops.farm_calc_sweep();
    res := pg_temp.item(res, '8h 보충 예약 함수를 불러도 오류가 없고 아무것도 깨우지 않는다 (건너뛰기 설정)',
      (select last_wake_at is not distinct from wake_before from ops.farm_calc_wake where id = 1));
    res := pg_temp.item(res, '8i 여기까지 모든 저장이 일어나는 동안 깨우기 요청이 하나도 쌓이지 않았다 (net.http_request_queue)',
      (select count(*) from net.http_request_queue) = q_before);

    -- ===================================================================
    -- 9. 탈퇴 연쇄 삭제 · 농장 지우기
    -- ===================================================================
    -- 탈퇴가 하는 일은 auth.users 한 줄을 지우는 것이다. 그 한 줄로 농장 표 일곱이 연쇄로 지워지고 트리거가 막지 않는지 본다.
    -- 회원 DB(D1-1)가 있으면 delete_my_account() 와 회원 표(members)도 함께 시험한다. 아직 없으면 그 항목은 건너뛴다(참으로 적고 이름에 밝힘).
    insert into public.forecast_runs (run_at, run_name, stn_id, started_at, result, on_time, collector)
      values (now(), '아침', '101', now(), '정시 성공', true, 'actions') returning run_id into run_id_x;
    u_d := pg_temp.new_user();
    f_d := pg_temp.seed_farm_data(u_d, run_id_x);
    ok1 := pg_temp.rows_left(f_d) >= 7;
    delete from auth.users where id = u_d;
    res := pg_temp.item(res, '9a 회원(auth.users 한 줄)을 지우면 농장 · 작기 · 관수 기록 · 계산 상태 · 계산 결과 세 표가 모두 연쇄로 지워진다 (트리거가 막지 않음)',
      ok1 and pg_temp.rows_left(f_d) = 0 and not exists (select 1 from public.farms where farm_id = f_d));
    ok1 := true;
    if to_regclass('public.members') is not null then
      execute 'select count(*) from public.members where user_id = $1' using u_d into n;
      ok1 := n = 0;
    end if;
    res := pg_temp.item(res, '9b 회원 표(members)가 있으면 그 줄도 함께 지워진다 (회원 DB 가 없으면 건너뜀)', ok1);
    if to_regprocedure('public.delete_my_account()') is not null then
      u_d2 := pg_temp.new_user();
      f_d2 := pg_temp.seed_farm_data(u_d2, run_id_x);
      v := pg_temp.as_member(u_d2, 'select public.delete_my_account()');
      res := pg_temp.item(res, '9c 탈퇴 함수 delete_my_account() 도 농장 · 작기 · 기록이 있어도 막히지 않고 같은 연쇄로 지운다',
        v = 'ok' and pg_temp.rows_left(f_d2) = 0 and not exists (select 1 from auth.users where id = u_d2));
    else
      res := pg_temp.item(res, '9c (건너뜀) 회원 DB(D1-1)가 아직 없어 delete_my_account() 는 시험하지 않았다 — D1-1 을 실행한 뒤 이 확인 SQL 을 다시 Run 하면 시험된다', true);
    end if;

    u_w := pg_temp.new_user();
    f_w := pg_temp.new_farm(u_w, 'apple', 'apple-main', 'apple-k3', '04-01');
    delete from public.farm_seasons where farm_id = f_w;
    insert into public.farm_seasons (farm_id, crop_id, season_type_id, kc_set_id, start_date, end_date)
      values (f_w, 'apple', 'apple-main', 'apple-k3', d - 10, d + 100);
    insert into public.irrigation_logs (farm_id, date, volume_l) values (f_w, d, 100);
    n := pg_temp.member_rows(u_w, format('delete from public.farms where farm_id = %L', f_w));
    res := pg_temp.item(res, '9d 회원이 자기 농장을 직접 지울 수 있고 딸린 줄이 함께 지워진다',
      n = 1
      and not exists (select 1 from public.farm_seasons where farm_id = f_w)
      and not exists (select 1 from public.irrigation_logs where farm_id = f_w)
      and not exists (select 1 from public.farm_calc_status where farm_id = f_w));
    res := pg_temp.item(res, '9e 줄이 없는 농장 번호로 다시 계산을 요청해도 오류 없이 아무것도 안 한다 (touch_farm_calc)',
      (select 1 from (select public.touch_farm_calc(gen_random_uuid(), d)) z) is not null);

    -- ===================================================================
    -- 10. etc_only (쓰는 물) — 세 공개 표와 새 결과 표가 값을 받는다
    -- ===================================================================
    select scenario_id into scen_x from public.scenarios order by scenario_id limit 1;
    v := null;
    begin
      insert into public.water_balance_daily (scenario_id, date, eto_src, status, calc_version)
        values (scen_x, '2000-01-01', '없음', 'etc_only', 't');
      v := 'ok';
    exception when others then v := sqlstate; end;
    ok1 := v = 'ok';
    begin
      insert into public.water_balance_daily (scenario_id, date, eto_src, status, calc_version)
        values (scen_x, '2000-01-02', '없음', 'zzz', 't');
      v := 'ok';
    exception when others then v := sqlstate; end;
    res := pg_temp.item(res, '10a water_balance_daily 가 etc_only 를 받고 모르는 값은 거절한다 (Dr · Ks 는 비어도 됨)', ok1 and v = '23514');
    begin
      insert into public.water_outlook (run_id, scenario_id, target_date, lead_day, status, calc_version)
        values (run_id_x, scen_x, '2000-01-01', 0, 'etc_only', 't');
      ok1 := true;
    exception when others then ok1 := false; end;
    begin
      insert into public.water_outlook (run_id, scenario_id, target_date, lead_day, status, calc_version)
        values (run_id_x, scen_x, '2000-01-02', 0, 'wet', 't');
      v := 'ok';
    exception when others then v := sqlstate; end;
    res := pg_temp.item(res, '10b water_outlook 이 etc_only 를 받고, 전망에는 여전히 wet 이 없다', ok1 and v = '23514');
    begin
      insert into public.water_outlook_summary (run_id, scenario_id, horizon_days, start_date, status_start, calc_version)
        values (run_id_x, scen_x, 3, '2000-01-01', 'etc_only', 't');
      ok1 := true;
    exception when others then ok1 := false; end;
    res := pg_temp.item(res, '10c water_outlook_summary 가 etc_only 를 받는다 (dr_start_mm · 예상일 · 권장 관수량은 비어도 됨)', ok1);

    u_bad := pg_temp.new_user();
    f_w := pg_temp.new_farm(u_bad, 'apple', 'apple-main', 'apple-k3', '04-01');
    begin
      insert into public.farm_water_daily (farm_id, date, eto_src, status, calc_version) values (f_w, d, '없음', 'etc_only', 't');
      insert into public.farm_water_outlook (farm_id, run_id, target_date, lead_day, status, calc_version) values (f_w, run_id_x, d, 4, 'etc_only', 't');
      insert into public.farm_water_outlook_summary (farm_id, run_id, horizon_days, start_date, status_start, calc_version) values (f_w, run_id_x, 3, d, 'etc_only', 't');
      ok1 := true;
    exception when others then ok1 := false; end;
    begin
      insert into public.farm_water_daily (farm_id, date, eto_src, status, calc_version) values (f_w, d + 1, '없음', 'zzz', 't');
      v := 'ok';
    exception when others then v := sqlstate; end;
    res := pg_temp.item(res, '10d 새 farm_water_* 세 표도 etc_only 를 받고 모르는 값은 거절한다', ok1 and v = '23514');
    res := pg_temp.item(res, '10e 새 결과 표는 농장마다 한 줄 키: farm_water_outlook 은 (farm_id, target_date) 하나, 요약은 농장당 하나',
      (select count(*) from public.farm_water_outlook where farm_id = f_w) = 1
      and (select count(*) from public.farm_water_outlook_summary where farm_id = f_w) = 1);

    -- ===================================================================
    -- 11. 사전 · 시드
    -- ===================================================================
    res := pg_temp.item(res, '11a 포도 작목: Kc 0.30/0.85/0.45 · Zr 1.0 · p 0.35 · 높이 2.0 · 기준온도 10, 적산 단계와 라벨은 비어 있다',
      (select kc_ini = 0.30 and kc_mid = 0.85 and kc_end = 0.45 and zr_m = 1.0 and p = 0.35 and h_m = 2.0 and t_base_c = 10
          and gdd_stages is null and gdd_stage_labels is null and name_ko = '포도'
        from public.crops where crop_id = 'grape'));
    res := pg_temp.item(res, '11b 포도 재배 방식 grape-k1: 번호 1 · 이름 "기본" · 기본 · Kc 0.30/0.85/0.45',
      (select set_no = 1 and name_ko = '기본' and is_default and kc_ini = 0.30 and kc_mid = 0.85 and kc_end = 0.45 and crop_id = 'grape'
        from public.crop_kc_sets where kc_set_id = 'grape-k1'));
    res := pg_temp.item(res, '11c 포도 비가림: 시작 04-20 · 단계 25/45/90/45 · 기본 작형 · 시설 재배 · 적산 시작 04-20',
      (select start_mmdd = '04-20' and l_ini_d = 25 and l_dev_d = 45 and l_mid_d = 90 and l_late_d = 45 and is_default
          and is_protected and cum_start_mmdd = '04-20' and name_ko = '포도 비가림' and crop_id = 'grape'
        from public.crop_seasons where season_type_id = 'grape-rainshelter'));
    res := pg_temp.item(res, '11d 포도 시설가온: 시작 비움 · 단계 35/40/85/30 · 기본 아님 · 시설 재배 · 적산 시작 비움',
      (select start_mmdd is null and l_ini_d = 35 and l_dev_d = 40 and l_mid_d = 85 and l_late_d = 30 and not is_default
          and is_protected and cum_start_mmdd is null and name_ko = '포도 시설가온' and crop_id = 'grape'
        from public.crop_seasons where season_type_id = 'grape-heated'));
    res := pg_temp.item(res, '11e 시작일이 빈 시설가온도 단계 일수는 모두 있다 (F2 는 "단계 일수 네 개가 모두 있음"으로 선택지를 거른다)',
      (select count(*) from public.crop_seasons where l_ini_d is not null and l_dev_d is not null and l_mid_d is not null and l_late_d is not null
         and start_mmdd is null) = 1);
    res := pg_temp.item(res, '11f 작물마다 기본 작형은 하나 (포도 포함), 기본 재배 방식도 하나',
      (select count(*) from public.crop_seasons where crop_id = 'grape' and is_default) = 1
      and (select count(*) from public.crop_kc_sets where crop_id = 'grape' and is_default) = 1);
    res := pg_temp.item(res, '11g 사과 · 배추 적산 시작 01-01, 시설 재배 아님, 사과 기준온도 4 그대로',
      (select cum_start_mmdd = '01-01' and not is_protected from public.crop_seasons where season_type_id = 'apple-main')
      and (select cum_start_mmdd = '01-01' and not is_protected from public.crop_seasons where season_type_id = 'kimchi_cabbage-summer')
      and (select t_base_c = 4 from public.crops where crop_id = 'apple'));
    res := pg_temp.item(res, '11h 배추 기준온도 5 · 여름 작형 이름 "고랭지배추" (키는 그대로 kimchi_cabbage-summer)',
      (select t_base_c = 5 from public.crops where crop_id = 'kimchi_cabbage')
      and (select name_ko = '고랭지배추' and l_ini_d = 25 and l_dev_d = 30 and l_mid_d = 25 and l_late_d = 10 and start_mmdd = '07-01'
             from public.crop_seasons where season_type_id = 'kimchi_cabbage-summer'));
    v := null;
    begin update public.crops set gdd_stages = '{1,2,3}', gdd_stage_labels = '{"a","b"}' where crop_id = 'grape'; v := 'ok'; exception when others then v := sqlstate; end;
    ok1 := v = '23514';
    begin update public.crops set gdd_stage_labels = '{"a"}' where crop_id = 'grape'; v := 'ok'; exception when others then v := sqlstate; end;
    ok2 := v = '23514';
    begin update public.crops set gdd_stages = '{1,2,3}', gdd_stage_labels = '{"만개","변색기","수확기"}' where crop_id = 'grape'; v := 'ok'; exception when others then v := sqlstate; end;
    res := pg_temp.item(res, '11i 적산 단계 라벨은 단계와 길이가 같아야 한다 (모자라거나 단계 없이 라벨만 있으면 거절)', ok1 and ok2 and v = 'ok');

    res := pg_temp.item(res, '11j 2027 포도 계산 조건 194줄: 운영 지점 97곳 × 작형 둘, 모두 grape-k1 · 양토 · 2027',
      (select count(*) from public.scenarios where crop_id = 'grape') = 194
      and (select count(*) from public.scenarios sc join public.stations st on st.stn_id = sc.stn_id
             where sc.crop_id = 'grape' and st.is_active) = 194
      and (select count(distinct stn_id) from public.scenarios where crop_id = 'grape') = (select count(*) from public.stations where is_active)
      and (select count(*) from public.scenarios where crop_id = 'grape' and kc_set_id = 'grape-k1' and soil_code = 'loam' and season_year = 2027) = 194);
    res := pg_temp.item(res, '11k 비가림 97줄은 2027-04-20~2027-11-10 (205일), 시설가온 97줄은 2027-01-01~2027-07-09 (190일)',
      (select count(*) from public.scenarios where season_type_id = 'grape-rainshelter' and season_start = '2027-04-20' and season_end = '2027-11-10') = 97
      and (select count(*) from public.scenarios where season_type_id = 'grape-heated' and season_start = '2027-01-01' and season_end = '2027-07-09') = 97
      and (select count(*) from public.scenarios where season_type_id = 'grape-rainshelter' and season_end - season_start + 1 = 205) = 97
      and (select count(*) from public.scenarios where season_type_id = 'grape-heated' and season_end - season_start + 1 = 190) = 97);
    res := pg_temp.item(res, '11l TAW = 1000·(FC−WP)·Zr = 130, RAW = p·TAW = 45.5, dr0 = 0 (사전 값에서 다시 계산한 것과 같음)',
      (select count(*) from public.scenarios sc
         join public.soil_types so on so.soil_code = sc.soil_code
         join public.crops c on c.crop_id = sc.crop_id
        where sc.crop_id = 'grape'
          and sc.taw_mm = 1000 * (so.fc - so.wp) * c.zr_m and sc.taw_mm = 130
          and sc.raw_mm = c.p * sc.taw_mm and sc.raw_mm = 45.5 and sc.dr0_mm = 0) = 194);
    res := pg_temp.item(res, '11m 이름은 지점-작형-k1-loam-2027 규칙이고, 모두 기본 조건이다',
      (select count(*) from public.scenarios where crop_id = 'grape'
         and scenario_id = stn_id || '-' || season_type_id || '-k1-loam-2027' and is_default) = 194);
    res := pg_temp.item(res, '11n 기본 조건은 지점 × 작형마다 하나 (포도 두 작형 모두 기본), 2027 전체 388줄 = 사과 97 + 배추 97 + 포도 194',
      (select count(*) from (select stn_id, season_type_id from public.scenarios where is_default and season_year = 2027
                              group by 1, 2 having count(*) > 1) z) = 0
      and (select count(*) from public.scenarios where is_default and season_year = 2027) = 388
      and (select count(*) from public.scenarios where is_default and season_year = 2027 and crop_id = 'apple') = 97
      and (select count(*) from public.scenarios where is_default and season_year = 2027 and crop_id = 'kimchi_cabbage') = 97);
    res := pg_temp.item(res, '11o 기본 조건 색인이 작형 기준(stn_id, season_type_id, season_year)이다',
      (select indexdef like '%(stn_id, season_type_id, season_year)%' and indexdef like '%WHERE is_default%'
         from pg_indexes where schemaname = 'public' and indexname = 'scenarios_one_default'));
    v := null;
    begin
      insert into public.scenarios (scenario_id, stn_id, crop_id, season_type_id, kc_set_id, soil_code, season_year,
                                    season_start, season_end, dr0_mm, taw_mm, raw_mm, is_default)
      values ('101-grape-rainshelter-k1-sand-2027', '101', 'grape', 'grape-rainshelter', 'grape-k1', 'sand', 2027,
              '2027-04-20', '2027-11-10', 0, 75, 26.25, true);
      v := 'ok';
    exception when others then v := sqlstate; end;
    res := pg_temp.item(res, '11p 같은 지점 · 작형 · 연도에 기본 조건이 둘이 되는 것은 거절한다', v = '23505');

    -- ===================================================================
    -- 12. 구조 · 권한 요약
    -- ===================================================================
    res := pg_temp.item(res, '12a 새 표 7개 모두 RLS 가 켜져 있고 읽기 정책이 있다',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relrowsecurity
           and c.relname in ('farms', 'farm_seasons', 'irrigation_logs', 'farm_calc_status', 'farm_water_daily',
                             'farm_water_outlook', 'farm_water_outlook_summary')) = 7
      and (select count(distinct tablename) from pg_policies where schemaname = 'public' and cmd in ('SELECT', 'ALL')
            and tablename in ('farms', 'farm_seasons', 'irrigation_logs', 'farm_calc_status', 'farm_water_daily',
                              'farm_water_outlook', 'farm_water_outlook_summary')) = 7);
    res := pg_temp.item(res, '12b 비회원(anon)에게는 새 표 7개에 아무 권한도 없다',
      not exists (select 1 from information_schema.role_table_grants
                   where grantee = 'anon' and table_schema = 'public'
                     and table_name in ('farms', 'farm_seasons', 'irrigation_logs', 'farm_calc_status', 'farm_water_daily',
                                        'farm_water_outlook', 'farm_water_outlook_summary')));
    res := pg_temp.item(res, '12c 회원(authenticated)의 쓰기 권한은 farms · irrigation_logs 에만 있다',
      not exists (select 1 from information_schema.role_table_grants
                   where grantee = 'authenticated' and table_schema = 'public'
                     and table_name in ('farm_seasons', 'farm_calc_status', 'farm_water_daily', 'farm_water_outlook', 'farm_water_outlook_summary')
                     and privilege_type <> 'SELECT'));
    res := pg_temp.item(res, '12d farms_one_per_user 는 user_id 유일 색인이고, 작기 겹침 배제 제약(farm_seasons_no_overlap)이 있다',
      (select indexdef like '%UNIQUE%(user_id)%' from pg_indexes where schemaname = 'public' and indexname = 'farms_one_per_user')
      and exists (select 1 from pg_constraint where conname = 'farm_seasons_no_overlap' and contype = 'x'));
    res := pg_temp.item(res, '12e sync_farm_seasons 는 서버 키만 실행할 수 있고 회원 · 비회원은 못 부른다',
      has_function_privilege('service_role', 'public.sync_farm_seasons(uuid)', 'execute')
      and not has_function_privilege('authenticated', 'public.sync_farm_seasons(uuid)', 'execute')
      and not has_function_privilege('anon', 'public.sync_farm_seasons(uuid)', 'execute')
      and pg_temp.as_member(u_a, format('select public.sync_farm_seasons(%L)', f_a)) = '42501');
    res := pg_temp.item(res, '12f 안쪽 · 내부 함수(sync_farm_seasons_at · touch_farm_calc · farm_current_season)는 회원도 서버 키도 못 부른다',
      not has_function_privilege('authenticated', 'public.sync_farm_seasons_at(uuid, date)', 'execute')
      and not has_function_privilege('service_role', 'public.sync_farm_seasons_at(uuid, date)', 'execute')
      and not has_function_privilege('authenticated', 'public.touch_farm_calc(uuid, date)', 'execute')
      and not has_function_privilege('service_role', 'public.touch_farm_calc(uuid, date)', 'execute')
      and not has_function_privilege('authenticated', 'public.farm_current_season(uuid, date)', 'execute')
      and pg_temp.as_member(u_a, format('select public.sync_farm_seasons_at(%L, current_date)', f_a)) = '42501');
    res := pg_temp.item(res, '12g 매분 보충 예약 croplib-farm-calc-sweep 이 있고, 마지막 깨우기 표는 한 줄이다',
      exists (select 1 from cron.job where jobname = 'croplib-farm-calc-sweep' and schedule = '* * * * *'
                and command like '%ops.farm_calc_sweep()%')
      and (select count(*) from ops.farm_calc_wake) = 1);
    res := pg_temp.item(res, '12h 이 확인 SQL 이 끝날 때까지 깨우기 요청이 쌓이지 않았고 마지막 깨우기 시각이 그대로다',
      (select count(*) from net.http_request_queue) = q_before
      and (select last_wake_at is not distinct from wake_before from ops.farm_calc_wake where id = 1));

    -- 여기서 일부러 오류를 내 위의 모든 변경(가짜 회원 · 농장 · 기록 · 시험용 사전 변경 포함)을 되돌린다.
    raise exception 'd1_2_check_rollback';
  exception
    when raise_exception then
      if sqlerrm <> 'd1_2_check_rollback' then
        raise;
      end if;
  end;

  insert into d1_2_results (seq, item, ok)
  select (r ->> 'seq')::int, r ->> 'item', (r ->> 'ok')::boolean
  from jsonb_array_elements(res) r;
end
$check$;

-- 마지막 줄 all_ok 가 true 면 통과. 위 DO 의 변경은 모두 되돌려졌다 (가짜 회원 · 농장 · 기록이 남지 않음).
select seq, item, ok from d1_2_results
union all
select 999, 'all_ok', coalesce(bool_and(coalesce(ok, false)), false) and count(*) = 118 from d1_2_results
order by seq;
