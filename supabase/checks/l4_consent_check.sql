-- 확인 SQL: 동의 기록 (데이터 계약 v2.3, 이슈 #191, 결정 0065)
--
-- 언제: 마이그레이션 20261120200000_data_contract_v2_3_consent.sql 을 Run 한 뒤.
-- 방법: SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run.
-- 결과: 항목마다 true/false 한 줄, 맨 끝 줄 all_ok = true 면 통과. 검토 채팅에 all_ok 만 알린다 (개인 값 없음).
--
-- 아무것도 남기지 않는다. 가짜 회원(@example.invalid, 번호는 gen_random_uuid())과 농장 · 관수 기록을 만들어 시험하고,
-- 끝에서 일부러 오류를 내 그 안의 변경을 모두 되돌린다 (결과는 되돌려지지 않는 변수로 꺼내 보여 준다).
-- 항목이 하나라도 false 이면 그 항목 이름을 알려 주세요.
--
-- ⚠ 진짜 작업을 깨우지 않는다: 맨 앞에서 set_config('cropmon.skip_wake', 'on', true) — 이 트랜잭션에서만, 농장을 만들 때 깨우는 함수가 건너뛴다
--   (d1_2_farms_check.sql 과 같은 방식).

drop table if exists pg_temp.l4_results;
create temp table l4_results (seq int, item text, ok boolean);

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

-- 가짜 회원 (가입 트리거가 members 줄을 만든다. 동의 전 상태 = terms_version 이 비어 있음)
create or replace function pg_temp.new_user()
returns uuid language plpgsql as $f$
declare u uuid := gen_random_uuid();
begin
  insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
  values (u, u::text || '@example.invalid', '{"provider":"kakao"}', '{"name":"가짜"}');
  return u;
end;
$f$;

-- 농장 하나(관리자 권한으로 직접 넣는다: RLS 를 건너뜀)
create or replace function pg_temp.new_farm(p_uid uuid)
returns uuid language plpgsql as $f$
declare f uuid;
begin
  insert into public.farms (user_id, name, address, stn_id, irrigated_area_m2, crop_id, season_type_id, kc_set_id,
                            season_start_mmdd, season_start_source)
  values (p_uid, '가짜농장', '가짜 주소', '101', 1000, 'apple', 'apple-main', 'apple-k3', '04-01', 'user')
  returning farm_id into f;
  return f;
end;
$f$;

-- 회원 본인의 동의 열 값을 관리자 권한으로 읽는다 (읽기 시험용)
create or replace function pg_temp.consent_cols(p_uid uuid)
returns table (tv text, ta timestamptz, pv text, pc timestamptz, a14 timestamptz)
language sql as $f$
  select terms_version, terms_agreed_at, privacy_version, privacy_confirmed_at, age14_confirmed_at
  from public.members where user_id = p_uid;
$f$;

do $check$
declare
  res   jsonb := '[]'::jsonb;
  d     date := public.kst_today();
  u_a   uuid; -- 동의 전 회원
  u_b   uuid; -- 다른 회원 (남의 줄)
  u_c   uuid; -- 동의 뒤 회원
  u_d   uuid; -- 줄이 빠진 회원
  u_e   uuid; -- 동의 전에 자기 자료를 이미 가진 회원
  f_a   uuid;
  f_c   uuid;
  f_e   uuid;
  v     text;
  ok1   boolean;
  ok2   boolean;
  t1    timestamptz;
  t2    timestamptz;
  t3    timestamptz;
begin
  perform set_config('cropmon.skip_wake', 'on', true);

  begin
    u_a := pg_temp.new_user();
    u_b := pg_temp.new_user();
    u_c := pg_temp.new_user();
    u_e := pg_temp.new_user();

    -- ===================================================================
    -- 1. 동의 열의 직접 고치기 권한
    -- ===================================================================
    ok1 := true;
    foreach v in array array[
      $q$terms_version = 'x'$q$, $q$terms_agreed_at = now()$q$, $q$privacy_version = 'x'$q$,
      $q$privacy_confirmed_at = now()$q$, $q$age14_confirmed_at = now()$q$] loop
      if pg_temp.as_member(u_a, format('update public.members set %s where user_id = %L', v, u_a)) <> '42501' then
        ok1 := false;
      end if;
    end loop;
    res := pg_temp.item(res, '1a 회원은 동의 다섯 열을 직접 못 고침 (다섯 열 모두 42501)', ok1);

    res := pg_temp.item(res, '1b 나머지 네 열은 고침 (display_name · layout · font_scale · theme)',
      pg_temp.member_rows(u_a, format($q$update public.members set display_name = '바꾼이름', layout = '{"v":1}'::jsonb,
         font_scale = '{"v":1}'::jsonb, theme = 'dark' where user_id = %L$q$, u_a)) = 1);

    -- ===================================================================
    -- 2. record_my_consent
    -- ===================================================================
    res := pg_temp.item(res, '2a 동의 전 회원의 동의 열은 비어 있음',
      (select tv is null and ta is null and pv is null and pc is null and a14 is null from pg_temp.consent_cols(u_c)));

    v := pg_temp.as_member(u_c, $q$select public.record_my_consent('terms-test-1', 'privacy-test-1')$q$);
    res := pg_temp.item(res, '2b 회원이 함수로 동의를 쓸 수 있음', v = 'ok');
    res := pg_temp.item(res, '2c 함수로 쓰면 다섯 열이 채워짐',
      (select tv = 'terms-test-1' and pv = 'privacy-test-1' and ta is not null and pc is not null and a14 is not null
         from pg_temp.consent_cols(u_c)));

    select ta, pc, a14 into t1, t2, t3 from pg_temp.consent_cols(u_c);
    res := pg_temp.item(res, '2d 세 시각이 같은 값 하나 (한 번에 씀)', t1 = t2 and t2 = t3);
    res := pg_temp.item(res, '2e 시각은 DB 시각 (방금 · 지금보다 미래가 아님)',
      t1 <= now() and t1 > now() - interval '1 hour');

    perform pg_temp.as_member(u_c, $q$select public.record_my_consent('  terms-test-2  ', 'privacy-test-2')$q$);
    res := pg_temp.item(res, '2f 판 값의 앞뒤 공백은 떼고 두 번째 기록은 덮어씀',
      (select tv = 'terms-test-2' and pv = 'privacy-test-2' from pg_temp.consent_cols(u_c)));

    res := pg_temp.item(res, '2g 남의 줄은 못 씀 (다른 회원 B 의 줄은 그대로 비어 있음)',
      (select tv is null and ta is null from pg_temp.consent_cols(u_b)));

    res := pg_temp.item(res, '2h 빈 판 값 거절 (22023)',
      pg_temp.as_member(u_a, $q$select public.record_my_consent('', 'privacy-test-1')$q$) = '22023'
      and pg_temp.as_member(u_a, $q$select public.record_my_consent('terms-test-1', '   ')$q$) = '22023'
      and pg_temp.as_member(u_a, $q$select public.record_my_consent(null, 'privacy-test-1')$q$) = '22023');
    res := pg_temp.item(res, '2i 긴 판 값 거절 (101자 22023, 100자는 통과)',
      pg_temp.as_member(u_a, format($q$select public.record_my_consent(%L, 'privacy-test-1')$q$, repeat('가', 101))) = '22023'
      and pg_temp.as_member(u_b, format($q$select public.record_my_consent(%L, 'privacy-test-1')$q$, repeat('a', 100))) = 'ok');
    res := pg_temp.item(res, '2j 거절된 호출은 아무것도 쓰지 않음 (A 의 동의 열은 그대로 비어 있음)',
      (select tv is null and ta is null and pv is null and pc is null and a14 is null from pg_temp.consent_cols(u_a)));

    res := pg_temp.item(res, '2k 비회원은 함수를 못 부름 (42501)',
      pg_temp.as_anon($q$select public.record_my_consent('terms-test-1', 'privacy-test-1')$q$) = '42501');
    res := pg_temp.item(res, '2l 로그인 정보(회원 번호)가 없는 호출은 오류 (28000)',
      pg_temp.as_member(null, $q$select public.record_my_consent('terms-test-1', 'privacy-test-1')$q$) = '28000');

    -- 줄이 빠진 회원: 함수가 줄을 만들고 쓴다
    u_d := gen_random_uuid();
    insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data)
      values (u_d, u_d::text || '@example.invalid', '{"provider":"google"}', '{"name":"가짜씨"}');
    delete from public.members where user_id = u_d;
    v := pg_temp.as_member(u_d, $q$select public.record_my_consent('terms-test-1', 'privacy-test-1')$q$);
    res := pg_temp.item(res, '2m 줄이 빠진 회원도 함수로 기록됨 (줄을 만들고 쓰며 이름 · 공급자도 채움)',
      v = 'ok'
      and exists (select 1 from public.members where user_id = u_d and terms_version = 'terms-test-1'
                    and provider = 'google' and display_name = '가짜씨'));

    -- ===================================================================
    -- 3. 농장 쓰기는 동의한 회원만 (넣기 · 고치기 정책)
    -- ===================================================================
    res := pg_temp.item(res, '3a 동의 전 농장 만들기 막힘 (42501)',
      pg_temp.as_member(u_a, $q$insert into public.farms (name, address, stn_id, irrigated_area_m2, crop_id, season_type_id, kc_set_id, season_start_mmdd, season_start_source)
         values ('가짜농장', '가짜 주소', '101', 1000, 'apple', 'apple-main', 'apple-k3', '04-01', 'user')$q$) = '42501');
    res := pg_temp.item(res, '3b 동의 뒤 농장 만들기 됨',
      pg_temp.as_member(u_c, $q$insert into public.farms (name, address, stn_id, irrigated_area_m2, crop_id, season_type_id, kc_set_id, season_start_mmdd, season_start_source)
         values ('가짜농장', '가짜 주소', '101', 1000, 'apple', 'apple-main', 'apple-k3', '04-01', 'user')$q$) = 'ok');
    select farm_id into f_c from public.farms where user_id = u_c;
    -- 관수 기록은 작기 안(시작일 ~ 오늘)에만 넣을 수 있다. 오늘이 작기 안이도록 작기 줄을 관리자 권한으로 맞춘다(d1_2_farms_check.sql 과 같은 방식).
    delete from public.farm_seasons where farm_id = f_c;
    insert into public.farm_seasons (farm_id, crop_id, season_type_id, kc_set_id, start_date, end_date)
      values (f_c, 'apple', 'apple-main', 'apple-k3', d - 10, d + 100);

    -- 동의 전에 이미 자기 자료를 가진 회원 E (관리자 권한으로 농장 · 관수 기록을 만들어 둔다)
    f_e := pg_temp.new_farm(u_e);
    delete from public.farm_seasons where farm_id = f_e;
    insert into public.farm_seasons (farm_id, crop_id, season_type_id, kc_set_id, start_date, end_date)
      values (f_e, 'apple', 'apple-main', 'apple-k3', d - 10, d + 100);
    insert into public.irrigation_logs (farm_id, date, volume_l) values (f_e, d - 1, 100), (f_e, d, 200);

    res := pg_temp.item(res, '3c 동의 전 농장 고치기 막힘 (42501, 값도 안 바뀜)',
      pg_temp.as_member(u_e, format($q$update public.farms set name = '바꾼이름' where farm_id = %L$q$, f_e)) = '42501'
      and (select name = '가짜농장' from public.farms where farm_id = f_e));
    res := pg_temp.item(res, '3d 동의 전 관수 기록 넣기 막힘 (42501)',
      pg_temp.as_member(u_e, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 300)$q$, f_e, d)) = '42501');
    res := pg_temp.item(res, '3e 동의 전 관수 기록 고치기 막힘 (42501, 값도 안 바뀜)',
      pg_temp.as_member(u_e, format($q$update public.irrigation_logs set volume_l = 999 where farm_id = %L and date = %L$q$, f_e, d)) = '42501'
      and (select volume_l = 200 from public.irrigation_logs where farm_id = f_e and date = d));

    res := pg_temp.item(res, '3f 동의 전에도 자기 농장 읽기',
      pg_temp.member_count(u_e, format('select 1 from public.farms where farm_id = %L', f_e)) = 1);
    res := pg_temp.item(res, '3g 동의 전에도 자기 관수 기록 읽기',
      pg_temp.member_count(u_e, format('select 1 from public.irrigation_logs where farm_id = %L', f_e)) = 2);
    res := pg_temp.item(res, '3h 동의 전에도 자기 관수 기록 지우기 됨',
      pg_temp.member_rows(u_e, format('delete from public.irrigation_logs where farm_id = %L and date = %L', f_e, d)) = 1
      and (select count(*) from public.irrigation_logs where farm_id = f_e) = 1);
    res := pg_temp.item(res, '3i 동의 전에도 자기 농장 지우기 됨 (딸린 줄도 함께)',
      pg_temp.member_rows(u_e, format('delete from public.farms where farm_id = %L', f_e)) = 1
      and not exists (select 1 from public.farms where farm_id = f_e)
      and not exists (select 1 from public.irrigation_logs where farm_id = f_e));

    -- 동의 뒤에는 넣기 · 고치기가 다시 된다 (농장 · 관수 기록)
    res := pg_temp.item(res, '3j 동의 뒤 농장 고치기 · 관수 기록 넣기 · 고치기 됨',
      pg_temp.member_rows(u_c, format($q$update public.farms set name = '바꾼이름' where farm_id = %L$q$, f_c)) = 1
      and pg_temp.as_member(u_c, format($q$insert into public.irrigation_logs (farm_id, date, volume_l) values (%L, %L, 300)$q$, f_c, d)) = 'ok'
      and pg_temp.member_rows(u_c, format($q$update public.irrigation_logs set volume_l = 400 where farm_id = %L and date = %L$q$, f_c, d)) = 1);

    -- 남의 농장은 동의 뒤에도 못 건드림 (기존 규칙이 그대로)
    res := pg_temp.item(res, '3k 동의한 회원도 남의 농장 · 관수 기록은 못 고침 (영향 0줄)',
      pg_temp.member_rows(u_c, format($q$update public.farms set name = '해킹' where farm_id = %L$q$, pg_temp.new_farm(u_b))) = 0);

    -- 비회원은 농장 표에 아무 권한이 없음 (기존 규칙이 그대로)
    res := pg_temp.item(res, '3l 비회원은 농장 · 관수 기록에 아무 권한 없음 (42501)',
      pg_temp.as_anon('select 1 from public.farms') = '42501'
      and pg_temp.as_anon('select 1 from public.irrigation_logs') = '42501');

    -- ===================================================================
    -- 4. member_has_consented()
    -- ===================================================================
    res := pg_temp.item(res, '4a 비회원은 member_has_consented() 를 못 부름 (42501)',
      pg_temp.as_anon('select public.member_has_consented()') = '42501');

    -- 판단 값은 회원으로 직접 읽어 변수에 담고, 역할을 돌려놓은 뒤에 항목으로 적는다
    perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
    perform set_config('role', 'authenticated', true);
    ok1 := public.member_has_consented();
    perform set_config('request.jwt.claims', json_build_object('sub', u_c, 'role', 'authenticated')::text, true);
    ok2 := public.member_has_consented();
    execute 'reset role';
    res := pg_temp.item(res, '4b member_has_consented() 값: 동의 전(A) false · 동의 뒤(C) true',
      ok1 = false and ok2 = true);

    -- ===================================================================
    -- 5. 기존 규칙이 그대로
    -- ===================================================================
    res := pg_temp.item(res, '5a 회원은 자기 줄만 보임 (members 읽기 규칙 그대로)',
      pg_temp.member_count(u_a, 'select 1 from public.members') = 1);
    res := pg_temp.item(res, '5b ensure_my_member · delete_my_account 함수가 그대로 있음',
      exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
               where s.nspname = 'public' and p.proname = 'ensure_my_member')
      and exists (select 1 from pg_proc p join pg_namespace s on s.oid = p.pronamespace
               where s.nspname = 'public' and p.proname = 'delete_my_account'));

    -- 여기서 일부러 오류를 내 위의 모든 변경(가짜 회원 · 농장 · 기록 포함)을 되돌린다.
    raise exception 'l4_check_rollback';
  exception
    when raise_exception then
      if sqlerrm <> 'l4_check_rollback' then
        raise;
      end if;
  end;

  insert into l4_results (seq, item, ok)
  select (r ->> 'seq')::int, r ->> 'item', (r ->> 'ok')::boolean
  from jsonb_array_elements(res) r;
end
$check$;

-- 마지막 줄 all_ok 가 true 면 통과. 위 DO 의 변경은 모두 되돌려졌다 (가짜 회원 · 농장 · 기록이 남지 않음).
select seq, item, ok from l4_results
union all
select 999, 'all_ok', coalesce(bool_and(coalesce(ok, false)), false) and count(*) = 31 from l4_results
order by seq;
