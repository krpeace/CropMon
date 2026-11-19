-- 확인 SQL: 적산 계열 새 표 · 뷰 (데이터 계약 v2.2, 이슈 #186, 결정 0063, D1-3 1단계)
--
-- 언제: 마이그레이션 20261120100000_data_contract_v2_2_series.sql 을 Run 한 뒤.
-- 방법: SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run.
-- 결과: 항목마다 true/false 한 줄, 맨 끝 줄 all_ok = true 면 통과. 검토 채팅에 all_ok 만 알린다 (개인 값 없음).
--
-- 아무것도 남기지 않는다. 가짜 줄을 넣어 시험하고, 사전(crops · crop_seasons)을 일부러 바꿔 뷰가 따라가는지도 본 뒤,
-- 끝에서 일부러 오류를 내 그 안의 변경을 모두 되돌린다 (결과는 되돌려지지 않는 변수로 꺼내 보여 준다).
-- 항목이 하나라도 false 이면 그 항목 이름을 알려 주세요.
--
-- ※ 옛 heat_daily · sun_daily 는 이 파일이 읽기만 한다. "옛 표 그대로"(6절)는 키 · 외래키 · 열 · 정책 · 트리거 · 권한이 v1.4 + v1.8 의
--   값과 같은지 본다 (croplib-dp 지금 쓰기 보호).

drop table if exists pg_temp.d1_3a_results;
create temp table d1_3a_results (seq int, item text, ok boolean);

-- ---------------------------------------------------------------------------
-- 도우미 (이 세션 안에서만 있다)
-- ---------------------------------------------------------------------------
create or replace function pg_temp.item(p_res jsonb, p_name text, p_ok boolean)
returns jsonb language sql as $f$
  select p_res || jsonb_build_array(jsonb_build_object(
    'seq', jsonb_array_length(p_res) + 1, 'item', p_name, 'ok', coalesce(p_ok, false)));
$f$;

-- 역할(anon · authenticated · service_role)로 SQL 을 실행해 'ok' 또는 오류 코드(sqlstate)를 돌려준다.
create or replace function pg_temp.as_role(p_role text, p_sql text)
returns text language plpgsql as $f$
declare v text;
begin
  perform set_config('request.jwt.claims',
    case when p_role = 'anon' then '' else json_build_object('role', p_role)::text end, true);
  perform set_config('role', p_role, true);
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

-- 역할로 읽어 줄 수를 센다 (권한이 막히면 오류, 사전 표 읽기가 막혀 뷰가 비면 0)
create or replace function pg_temp.count_as(p_role text, p_sql text)
returns bigint language plpgsql as $f$
declare n bigint;
begin
  perform set_config('request.jwt.claims',
    case when p_role = 'anon' then '' else json_build_object('role', p_role)::text end, true);
  perform set_config('role', p_role, true);
  execute 'select count(*) from (' || p_sql || ') q' into n;
  execute 'reset role';
  return n;
end;
$f$;

-- 한 표의 열을 "이름:형식:비어도 됨" 글자로 (순서대로)
create or replace function pg_temp.cols(p_table text)
returns text language sql as $f$
  select string_agg(column_name || ':' || data_type || ':' || is_nullable, ',' order by ordinal_position)
  from information_schema.columns
  where table_schema = 'public' and table_name = p_table;
$f$;

-- 한 표의 제약(키 · 외래키)을 글자로
create or replace function pg_temp.cons(p_table text)
returns text language sql as $f$
  select string_agg(pg_get_constraintdef(oid), ' | ' order by pg_get_constraintdef(oid))
  from pg_constraint
  where conrelid = ('public.' || p_table)::regclass and contype in ('p', 'f');
$f$;

do $check$
declare
  res        jsonb := '[]'::jsonb;
  v          text;
  n          bigint;
  ok1        boolean;
  ok2        boolean;
  t          text;
  r          text;
  old_heat0  bigint;
  old_sun0   bigint;
  expected   text;
begin
  select count(*) into old_heat0 from public.heat_daily;
  select count(*) into old_sun0 from public.sun_daily;

  begin
    -- ===================================================================
    -- 1. 읽기 · 쓰기 권한 (비회원 · 회원 · 서버 키)
    -- ===================================================================
    insert into public.heat_series_daily (stn_id, t_base_c, cum_start_mmdd, date, gdd_day, gdd_cum, normal_from, normal_to, calc_version)
      values ('101', 4, '01-01', '2026-01-01', 1.5, 1.5, 2016, 2025, 'check');
    insert into public.sun_series_daily (stn_id, cum_start_mmdd, date, rs_day_mj, rs_cum_mj, normal_from, normal_to, calc_version)
      values ('101', '01-01', '2026-01-01', 8.5, 8.5, 2016, 2025, 'check');

    res := pg_temp.item(res, '1a 비회원(anon)이 새 표 둘과 뷰를 읽을 수 있다 (권한 오류 없음)',
      pg_temp.as_role('anon', 'select 1 from public.heat_series_daily') = 'ok'
      and pg_temp.as_role('anon', 'select 1 from public.sun_series_daily') = 'ok'
      and pg_temp.as_role('anon', 'select 1 from public.crop_accum_series') = 'ok');
    res := pg_temp.item(res, '1b 비회원 · 회원 · 서버 키 모두 새 표에서 방금 넣은 줄을 본다 (줄 수까지 본다)',
      pg_temp.count_as('anon', $q$select 1 from public.heat_series_daily where calc_version = 'check'$q$) = 1
      and pg_temp.count_as('authenticated', $q$select 1 from public.heat_series_daily where calc_version = 'check'$q$) = 1
      and pg_temp.count_as('service_role', $q$select 1 from public.heat_series_daily where calc_version = 'check'$q$) = 1
      and pg_temp.count_as('anon', $q$select 1 from public.sun_series_daily where calc_version = 'check'$q$) = 1
      and pg_temp.count_as('authenticated', $q$select 1 from public.sun_series_daily where calc_version = 'check'$q$) = 1
      and pg_temp.count_as('service_role', $q$select 1 from public.sun_series_daily where calc_version = 'check'$q$) = 1);
    -- 사전 표의 읽기 권한이 빠져 있으면 security_invoker 뷰는 오류 없이 0줄이 된다 → 줄 수(5)까지 본다.
    res := pg_temp.item(res, '1c 비회원(anon)이 뷰에서 실제 5줄을 받는다 (사전 표 읽기 권한이 막히면 오류 없이 0줄이 되므로 줄 수까지 확인)',
      pg_temp.count_as('anon', 'select * from public.crop_accum_series') = 5);
    res := pg_temp.item(res, '1d 회원(authenticated)도 서버 키(service_role, croplib-dp 가 쓰는 권한)도 뷰에서 실제 5줄을 받는다',
      pg_temp.count_as('authenticated', 'select * from public.crop_accum_series') = 5
      and pg_temp.count_as('service_role', 'select * from public.crop_accum_series') = 5
      and (select count(*) from public.crop_accum_series) = 5);

    ok1 := true;
    foreach r in array array['anon', 'authenticated'] loop
      foreach t in array array['heat_series_daily', 'sun_series_daily'] loop
        if pg_temp.as_role(r, 'insert into public.' || t || ' default values') <> '42501' then ok1 := false; end if;
        if pg_temp.as_role(r, 'update public.' || t || ' set filled = filled') <> '42501' then ok1 := false; end if;
        if pg_temp.as_role(r, 'delete from public.' || t) <> '42501' then ok1 := false; end if;
      end loop;
      -- 뷰는 쓰기 권한 검사보다 먼저 "뷰에는 넣을 수 없다"(55000)가 날 수 있다 — 어느 쪽이든 쓸 수 없다
      if pg_temp.as_role(r, 'insert into public.crop_accum_series default values') not in ('42501', '55000') then ok1 := false; end if;
    end loop;
    res := pg_temp.item(res, '1e 비회원 · 회원은 새 표 · 뷰에 넣기 · 고치기 · 지우기를 못 한다 (쓰기는 서버 키만)', ok1);

    ok1 := true;
    foreach t in array array['heat_series_daily', 'sun_series_daily', 'crop_accum_series'] loop
      foreach r in array array['anon', 'authenticated'] loop
        if not has_table_privilege(r, 'public.' || t, 'select') then ok1 := false; end if;
        if has_table_privilege(r, 'public.' || t, 'insert') or has_table_privilege(r, 'public.' || t, 'update')
           or has_table_privilege(r, 'public.' || t, 'delete') or has_table_privilege(r, 'public.' || t, 'truncate') then
          ok1 := false;
        end if;
      end loop;
    end loop;
    res := pg_temp.item(res, '1f 비회원 · 회원의 권한은 읽기(select)뿐이다 (새 표 둘 · 뷰)', ok1);

    res := pg_temp.item(res, '1g 새 표 둘 모두 RLS 가 켜져 있고 읽기 정책이 하나씩(anon · authenticated · using true) 있다',
      (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ('heat_series_daily', 'sun_series_daily') and c.relrowsecurity) = 2
      and (select count(*) from pg_policies where schemaname = 'public'
            and tablename in ('heat_series_daily', 'sun_series_daily')
            and cmd = 'SELECT' and roles::text = '{anon,authenticated}' and qual = 'true'
            and policyname in ('heat_series_daily 누구나 읽기', 'sun_series_daily 누구나 읽기')) = 2
      and (select count(*) from pg_policies where schemaname = 'public'
            and tablename in ('heat_series_daily', 'sun_series_daily')) = 2);

    -- ===================================================================
    -- 2. 구조: 열 · 키 · 외래키 · 트리거 · 뷰 옵션
    -- ===================================================================
    res := pg_temp.item(res, '2a heat_series_daily 의 열은 heat_daily 와 같은 값 열이고 crop_id 가 없다',
      pg_temp.cols('heat_series_daily') =
        'stn_id:text:NO,t_base_c:numeric:NO,cum_start_mmdd:text:NO,date:date:NO,gdd_day:numeric:YES,gdd_cum:numeric:YES,'
        'gdd_normal_day:numeric:YES,gdd_normal_cum:numeric:YES,lead_days:integer:YES,normal_from:integer:NO,'
        'normal_to:integer:NO,filled:boolean:NO,calc_version:text:NO,updated_at:timestamp with time zone:NO'
      and pg_temp.cols('heat_series_daily') not like '%crop_id%');
    res := pg_temp.item(res, '2b sun_series_daily 의 열은 sun_daily 와 같은 값 열이다',
      pg_temp.cols('sun_series_daily') =
        'stn_id:text:NO,cum_start_mmdd:text:NO,date:date:NO,rs_day_mj:numeric:YES,rs_cum_mj:numeric:YES,'
        'rs_normal_day_mj:numeric:YES,rs_normal_cum_mj:numeric:YES,normal_from:integer:NO,normal_to:integer:NO,'
        'filled:boolean:NO,calc_version:text:NO,updated_at:timestamp with time zone:NO');
    res := pg_temp.item(res, '2c 키: heat_series_daily (stn_id, t_base_c, cum_start_mmdd, date) · sun_series_daily (stn_id, cum_start_mmdd, date), 지점 외래키',
      pg_temp.cons('heat_series_daily') like '%PRIMARY KEY (stn_id, t_base_c, cum_start_mmdd, date)%'
      and pg_temp.cons('heat_series_daily') like '%FOREIGN KEY (stn_id) REFERENCES stations(stn_id)%'
      and pg_temp.cons('sun_series_daily') like '%PRIMARY KEY (stn_id, cum_start_mmdd, date)%'
      and pg_temp.cons('sun_series_daily') like '%FOREIGN KEY (stn_id) REFERENCES stations(stn_id)%');
    res := pg_temp.item(res, '2d 고쳐 쓸 때 updated_at 을 갱신하는 트리거가 두 표에 있다',
      (select count(*) from pg_trigger where not tgisinternal
        and tgname in ('heat_series_daily_set_updated_at', 'sun_series_daily_set_updated_at')) = 2);
    res := pg_temp.item(res, '2e 뷰는 security_invoker 이고, 열은 crop_id · season_type_id · heat_t_base_c · heat_cum_start_mmdd · sun_cum_start_mmdd 이다',
      (select coalesce(reloptions::text, '') like '%security_invoker=true%' from pg_class where oid = 'public.crop_accum_series'::regclass)
      and (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
            where table_schema = 'public' and table_name = 'crop_accum_series')
          = 'crop_id,season_type_id,heat_t_base_c,heat_cum_start_mmdd,sun_cum_start_mmdd');

    -- ===================================================================
    -- 3. 키 중복 · 입력 검사
    -- ===================================================================
    v := null;
    begin
      insert into public.heat_series_daily (stn_id, t_base_c, cum_start_mmdd, date, normal_from, normal_to, calc_version)
        values ('101', 4, '01-01', '2026-01-01', 2016, 2025, 'dup');
      v := 'ok';
    exception when others then v := sqlstate; end;
    ok1 := v = '23505';
    begin
      insert into public.heat_series_daily (stn_id, t_base_c, cum_start_mmdd, date, normal_from, normal_to, calc_version)
        values ('101', 4.0, '01-01', '2026-01-01', 2016, 2025, 'dup');
      v := 'ok';
    exception when others then v := sqlstate; end;
    ok2 := v = '23505';
    begin
      insert into public.heat_series_daily (stn_id, t_base_c, cum_start_mmdd, date, normal_from, normal_to, calc_version)
        values ('101', 4.00, '01-01', '2026-01-01', 2016, 2025, 'dup');
      v := 'ok';
    exception when others then v := sqlstate; end;
    res := pg_temp.item(res, '3a 같은 키는 중복으로 거절하고, t_base_c 가 4 · 4.0 · 4.00 처럼 숫자 모양만 달라도 같은 키다', ok1 and ok2 and v = '23505');

    insert into public.heat_series_daily (stn_id, t_base_c, cum_start_mmdd, date, normal_from, normal_to, calc_version) values
      ('101', 4, '04-20', '2026-01-01', 2016, 2025, 'k2'),
      ('101', 10, '01-01', '2026-01-01', 2016, 2025, 'k3'),
      ('101', 4, '01-01', '2026-01-02', 2016, 2025, 'k4'),
      ('108', 4, '01-01', '2026-01-01', 2016, 2025, 'k5');
    res := pg_temp.item(res, '3b 키의 한 칸만 달라도(누적 시작 · 기준온도 · 날짜 · 지점) 서로 다른 줄이다',
      (select count(*) from public.heat_series_daily where calc_version in ('check', 'k2', 'k3', 'k4', 'k5')) = 5);

    ok1 := true;
    foreach t in array array['02-29', '04-31', '06-31', '4-1', '13-01', '00-10', '04-00', ''] loop
      v := null;
      begin
        insert into public.heat_series_daily (stn_id, t_base_c, cum_start_mmdd, date, normal_from, normal_to, calc_version)
          values ('101', 7, t, '2026-03-01', 2016, 2025, 'bad');
        v := 'ok';
      exception when others then v := sqlstate; end;
      if v <> '23514' then ok1 := false; end if;
      begin
        insert into public.sun_series_daily (stn_id, cum_start_mmdd, date, normal_from, normal_to, calc_version)
          values ('101', t, '2026-03-01', 2016, 2025, 'bad');
        v := 'ok';
      exception when others then v := sqlstate; end;
      if v <> '23514' then ok1 := false; end if;
    end loop;
    res := pg_temp.item(res, '3c 누적 시작 02-29 · 04-31 · 06-31 · 형식 틀림 · 빈 글자는 두 표 모두 거절 (is_valid_mmdd)', ok1);

    v := null;
    begin
      insert into public.heat_series_daily (stn_id, t_base_c, cum_start_mmdd, date, normal_from, normal_to, calc_version)
        values ('101', 7, null, '2026-03-01', 2016, 2025, 'bad');
      v := 'ok';
    exception when others then v := sqlstate; end;
    ok1 := v = '23502';
    begin
      insert into public.sun_series_daily (stn_id, cum_start_mmdd, date, normal_from, normal_to, calc_version)
        values ('101', null, '2026-03-01', 2016, 2025, 'bad');
      v := 'ok';
    exception when others then v := sqlstate; end;
    res := pg_temp.item(res, '3d 누적 시작이 비어 있으면 거절한다 (계열을 가르는 열이라 필수)', ok1 and v = '23502');

    ok1 := true;
    foreach t in array array['31', '-11', '30.01', '-10.01'] loop
      v := null;
      begin
        insert into public.heat_series_daily (stn_id, t_base_c, cum_start_mmdd, date, normal_from, normal_to, calc_version)
          values ('101', t::numeric, '01-01', '2026-03-02', 2016, 2025, 'bad');
        v := 'ok';
      exception when others then v := sqlstate; end;
      if v <> '23514' then ok1 := false; end if;
    end loop;
    begin
      insert into public.heat_series_daily (stn_id, t_base_c, cum_start_mmdd, date, normal_from, normal_to, calc_version) values
        ('101', 30, '01-01', '2026-03-02', 2016, 2025, 'edge'),
        ('101', -10, '01-01', '2026-03-02', 2016, 2025, 'edge');
      v := 'ok';
    exception when others then v := sqlstate; end;
    res := pg_temp.item(res, '3e 기준온도는 crops.t_base_c 와 같은 범위(-10 ~ 30)만 받는다 (경계 -10 · 30 은 통과)', ok1 and v = 'ok');

    ok1 := true;
    begin
      insert into public.heat_series_daily (stn_id, t_base_c, cum_start_mmdd, date, normal_from, normal_to, calc_version)
        values ('99999', 4, '01-01', '2026-03-03', 2016, 2025, 'bad');
      v := 'ok';
    exception when others then v := sqlstate; end;
    ok1 := v = '23503';
    begin
      insert into public.sun_series_daily (stn_id, cum_start_mmdd, date, normal_from, normal_to, calc_version)
        values ('99999', '01-01', '2026-03-03', 2016, 2025, 'bad');
      v := 'ok';
    exception when others then v := sqlstate; end;
    res := pg_temp.item(res, '3f 없는 지점은 두 표 모두 거절한다 (외래키)', ok1 and v = '23503');

    ok1 := true;
    begin
      insert into public.heat_series_daily (stn_id, t_base_c, cum_start_mmdd, date, normal_from, normal_to, calc_version)
        values ('101', 5, '01-01', '2026-03-04', 2016, 2025, null);
      v := 'ok';
    exception when others then v := sqlstate; end;
    if v <> '23502' then ok1 := false; end if;
    begin
      insert into public.heat_series_daily (stn_id, t_base_c, cum_start_mmdd, date, normal_from, normal_to, calc_version)
        values ('101', 5, '01-01', '2026-03-04', null, 2025, 'x');
      v := 'ok';
    exception when others then v := sqlstate; end;
    if v <> '23502' then ok1 := false; end if;
    begin
      insert into public.sun_series_daily (stn_id, cum_start_mmdd, date, normal_from, normal_to, calc_version)
        values ('101', '01-01', '2026-03-04', 2016, null, 'x');
      v := 'ok';
    exception when others then v := sqlstate; end;
    if v <> '23502' then ok1 := false; end if;
    res := pg_temp.item(res, '3g 계산 버전 · 평년 기간(normal_from · normal_to)이 비면 거절한다 (옛 표와 같음)', ok1);

    insert into public.sun_series_daily (stn_id, cum_start_mmdd, date, normal_from, normal_to, calc_version)
      values ('101', '01-01', '2026-01-02', 2016, 2025, 's2');
    v := null;
    begin
      insert into public.sun_series_daily (stn_id, cum_start_mmdd, date, normal_from, normal_to, calc_version)
        values ('101', '01-01', '2026-01-01', 2016, 2025, 'dup');
      v := 'ok';
    exception when others then v := sqlstate; end;
    insert into public.sun_series_daily (stn_id, cum_start_mmdd, date, normal_from, normal_to, calc_version)
      values ('101', '04-20', '2026-01-01', 2016, 2025, 's3');
    res := pg_temp.item(res, '3h 적산일사: 같은 키는 중복 거절, 누적 시작만 달라도(04-20) 다른 줄이다',
      v = '23505'
      and (select count(*) from public.sun_series_daily where stn_id = '101' and date = '2026-01-01') = 2);
    res := pg_temp.item(res, '3i 기본값: filled 는 거짓, updated_at 은 지금',
      (select not filled and updated_at is not null from public.heat_series_daily where calc_version = 'check')
      and (select not filled and updated_at is not null from public.sun_series_daily where calc_version = 'check'));

    insert into public.heat_series_daily (stn_id, t_base_c, cum_start_mmdd, date, normal_from, normal_to, calc_version, updated_at)
      values ('108', 9, '01-01', '2026-01-01', 2016, 2025, 'old', '2000-01-01');
    update public.heat_series_daily set filled = true where calc_version = 'old';
    insert into public.sun_series_daily (stn_id, cum_start_mmdd, date, normal_from, normal_to, calc_version, updated_at)
      values ('108', '01-01', '2026-01-01', 2016, 2025, 'old', '2000-01-01');
    update public.sun_series_daily set filled = true where calc_version = 'old';
    res := pg_temp.item(res, '3j 줄을 고치면 updated_at 이 지금으로 바뀐다 (트리거, 두 표)',
      (select updated_at > '2000-01-01' from public.heat_series_daily where calc_version = 'old')
      and (select updated_at > '2000-01-01' from public.sun_series_daily where calc_version = 'old'));

    -- ===================================================================
    -- 4. 서버 키(croplib-dp 가 쓰는 권한)로 upsert — PostgREST on_conflict 와 같은 충돌 열
    -- ===================================================================
    v := pg_temp.as_role('service_role', $q$insert into public.heat_series_daily
        (stn_id, t_base_c, cum_start_mmdd, date, gdd_day, gdd_cum, normal_from, normal_to, calc_version, updated_at)
      values ('108', 4.0, '01-01', '2026-02-01', 1.5, 1.5, 2016, 2025, 'u1', '2000-01-01')
      on conflict (stn_id, t_base_c, cum_start_mmdd, date) do update set
        gdd_day = excluded.gdd_day, gdd_cum = excluded.gdd_cum, normal_from = excluded.normal_from,
        normal_to = excluded.normal_to, calc_version = excluded.calc_version$q$);
    ok1 := v = 'ok';
    v := pg_temp.as_role('service_role', $q$insert into public.heat_series_daily
        (stn_id, t_base_c, cum_start_mmdd, date, gdd_day, gdd_cum, normal_from, normal_to, calc_version)
      values ('108', 4, '01-01', '2026-02-01', 9.5, 11, 2017, 2026, 'u2')
      on conflict (stn_id, t_base_c, cum_start_mmdd, date) do update set
        gdd_day = excluded.gdd_day, gdd_cum = excluded.gdd_cum, normal_from = excluded.normal_from,
        normal_to = excluded.normal_to, calc_version = excluded.calc_version$q$);
    res := pg_temp.item(res, '4a 서버 키로 적산온도 계열을 같은 키(기준온도 4.0 → 4)로 두 번 upsert 하면 한 줄이고, 값은 두 번째 값이며 updated_at 이 갱신된다',
      ok1 and v = 'ok'
      and (select count(*) from public.heat_series_daily where stn_id = '108' and date = '2026-02-01' and cum_start_mmdd = '01-01') = 1
      and (select gdd_day = 9.5 and gdd_cum = 11 and normal_from = 2017 and normal_to = 2026 and calc_version = 'u2' and updated_at > '2000-01-01'
             from public.heat_series_daily where stn_id = '108' and date = '2026-02-01'));

    v := pg_temp.as_role('service_role', $q$insert into public.sun_series_daily
        (stn_id, cum_start_mmdd, date, rs_day_mj, rs_cum_mj, normal_from, normal_to, calc_version, updated_at)
      values ('108', '04-20', '2026-02-01', 1, 1, 2016, 2025, 'u1', '2000-01-01')
      on conflict (stn_id, cum_start_mmdd, date) do update set
        rs_day_mj = excluded.rs_day_mj, rs_cum_mj = excluded.rs_cum_mj, normal_from = excluded.normal_from,
        normal_to = excluded.normal_to, calc_version = excluded.calc_version$q$);
    ok1 := v = 'ok';
    v := pg_temp.as_role('service_role', $q$insert into public.sun_series_daily
        (stn_id, cum_start_mmdd, date, rs_day_mj, rs_cum_mj, normal_from, normal_to, calc_version)
      values ('108', '04-20', '2026-02-01', 12.5, 20, 2017, 2026, 'u2')
      on conflict (stn_id, cum_start_mmdd, date) do update set
        rs_day_mj = excluded.rs_day_mj, rs_cum_mj = excluded.rs_cum_mj, normal_from = excluded.normal_from,
        normal_to = excluded.normal_to, calc_version = excluded.calc_version$q$);
    res := pg_temp.item(res, '4b 서버 키로 적산일사 계열을 같은 키로 두 번 upsert 하면 한 줄이고, 값은 두 번째 값이며 updated_at 이 갱신된다',
      ok1 and v = 'ok'
      and (select count(*) from public.sun_series_daily where stn_id = '108' and date = '2026-02-01' and cum_start_mmdd = '04-20') = 1
      and (select rs_day_mj = 12.5 and rs_cum_mj = 20 and calc_version = 'u2' and updated_at > '2000-01-01'
             from public.sun_series_daily where stn_id = '108' and date = '2026-02-01'));

    -- ===================================================================
    -- 5. 계열 목록 뷰 crop_accum_series
    -- ===================================================================
    expected := 'apple|apple-main|4|01-01|01-01;common|-|5|01-01|01-01;grape|grape-heated|-|-|01-01;'
             || 'grape|grape-rainshelter|10|04-20|04-20;kimchi_cabbage|kimchi_cabbage-summer|5|01-01|01-01';
    res := pg_temp.item(res, '5a 뷰가 1/1 계열을 정확히 준다: 사과 4·01-01, 배추 5·01-01, 포도 비가림 10·04-20, 포도 시설가온(적산온도 비움 · 일사 01-01), 작물 공통 5·01-01 — 5줄',
      (select string_agg(crop_id || '|' || coalesce(season_type_id, '-') || '|' || coalesce(heat_t_base_c::text, '-') || '|'
                         || coalesce(heat_cum_start_mmdd, '-') || '|' || sun_cum_start_mmdd, ';' order by crop_id, season_type_id)
         from public.crop_accum_series) = expected);
    res := pg_temp.item(res, '5b 적산온도 계열은 (4, 01-01) · (5, 01-01) · (10, 04-20) 세 벌, 적산일사 계열은 01-01 · 04-20 두 벌이다 (croplib-dp 가 distinct 로 읽는 값)',
      (select string_agg(h, ';' order by h) from (select distinct heat_t_base_c::text || '|' || heat_cum_start_mmdd as h
                                                  from public.crop_accum_series where heat_cum_start_mmdd is not null) z)
         = '10|04-20;4|01-01;5|01-01'
      and (select string_agg(s, ';' order by s) from (select distinct sun_cum_start_mmdd as s from public.crop_accum_series) z)
         = '01-01;04-20');
    res := pg_temp.item(res, '5c 포도 시설가온은 적산온도 칸이 둘 다 비어 있고(적산온도를 내지 않음) 일사는 01-01 이다',
      (select heat_t_base_c is null and heat_cum_start_mmdd is null and sun_cum_start_mmdd = '01-01'
         from public.crop_accum_series where season_type_id = 'grape-heated'));
    res := pg_temp.item(res, '5d 단계 일수가 빈 배추 작형(봄 · 가을 · 월동)은 뷰에 없다',
      not exists (select 1 from public.crop_accum_series
                   where season_type_id in ('kimchi_cabbage-spring', 'kimchi_cabbage-autumn', 'kimchi_cabbage-winter'))
      and (select count(*) from public.crop_accum_series where crop_id = 'kimchi_cabbage') = 1);
    res := pg_temp.item(res, '5e 작물 공통은 작형이 비고 기준온도 5(crops 의 common 줄) · 적산 01-01 · 일사 01-01 이다',
      (select season_type_id is null and heat_t_base_c = 5 and heat_cum_start_mmdd = '01-01' and sun_cum_start_mmdd = '01-01'
         from public.crop_accum_series where crop_id = 'common')
      and (select t_base_c = 5 from public.crops where crop_id = 'common'));

    -- 사전을 고치면 뷰가 따라간다 (규칙이 뷰 한 곳에 있다는 증거 — 모두 되돌려진다)
    update public.crops set t_base_c = 6 where crop_id = 'apple';
    ok1 := (select heat_t_base_c = 6 and heat_cum_start_mmdd = '01-01' from public.crop_accum_series where season_type_id = 'apple-main');
    update public.crop_seasons set cum_start_mmdd = '03-01' where season_type_id = 'apple-main';
    ok2 := (select heat_cum_start_mmdd = '03-01' and sun_cum_start_mmdd = '03-01' from public.crop_accum_series where season_type_id = 'apple-main');
    res := pg_temp.item(res, '5f 사전을 고치면 뷰가 따라간다: 사과 기준온도 6 · 누적 시작 03-01 로 바꾸면 적산온도 · 일사 계열이 함께 바뀐다', ok1 and ok2);
    update public.crop_seasons set cum_start_mmdd = null where season_type_id = 'apple-main';
    ok1 := (select heat_t_base_c is null and heat_cum_start_mmdd is null and sun_cum_start_mmdd = '01-01'
              from public.crop_accum_series where season_type_id = 'apple-main');
    update public.crops set t_base_c = null where crop_id = 'grape';
    ok2 := (select heat_t_base_c is null and heat_cum_start_mmdd is null and sun_cum_start_mmdd = '04-20'
              from public.crop_accum_series where season_type_id = 'grape-rainshelter');
    res := pg_temp.item(res, '5g 누적 시작이 비거나 기준온도가 비면 적산온도 칸은 둘 다 비고(적산온도를 내지 않음), 일사는 누적 시작(없으면 01-01)을 따른다', ok1 and ok2);
    update public.crop_seasons set l_late_d = null where season_type_id = 'kimchi_cabbage-summer';
    ok1 := not exists (select 1 from public.crop_accum_series where season_type_id = 'kimchi_cabbage-summer');
    update public.crop_seasons set l_late_d = 10 where season_type_id = 'kimchi_cabbage-summer';
    ok2 := exists (select 1 from public.crop_accum_series where season_type_id = 'kimchi_cabbage-summer');
    res := pg_temp.item(res, '5h 작형의 단계 일수가 비면 그 작형은 뷰에서 빠지고, 채우면 다시 나온다', ok1 and ok2);

    -- ===================================================================
    -- 6. 옛 표 그대로 (croplib-dp 지금 쓰기 · 지금 화면 보호) — v1.4 + v1.8 값으로 고정
    -- ===================================================================
    res := pg_temp.item(res, '6a heat_daily: 열 · 키 · 외래키가 그대로다 (PRIMARY KEY (stn_id, crop_id, date), 지점 · 작물 외래키)',
      pg_temp.cols('heat_daily') =
        'stn_id:text:NO,crop_id:text:NO,date:date:NO,t_base_c:numeric:NO,gdd_day:numeric:YES,gdd_cum:numeric:YES,'
        'gdd_normal_day:numeric:YES,gdd_normal_cum:numeric:YES,lead_days:integer:YES,normal_from:integer:NO,'
        'normal_to:integer:NO,filled:boolean:NO,calc_version:text:NO,updated_at:timestamp with time zone:NO'
      and pg_temp.cons('heat_daily') =
        'FOREIGN KEY (crop_id) REFERENCES crops(crop_id) | FOREIGN KEY (stn_id) REFERENCES stations(stn_id) | PRIMARY KEY (stn_id, crop_id, date)');
    res := pg_temp.item(res, '6b sun_daily: 열 · 키 · 외래키가 그대로다 (PRIMARY KEY (stn_id, date), 지점 외래키)',
      pg_temp.cols('sun_daily') =
        'stn_id:text:NO,date:date:NO,rs_day_mj:numeric:YES,rs_cum_mj:numeric:YES,rs_normal_day_mj:numeric:YES,'
        'rs_normal_cum_mj:numeric:YES,normal_from:integer:NO,normal_to:integer:NO,filled:boolean:NO,calc_version:text:NO,'
        'updated_at:timestamp with time zone:NO'
      and pg_temp.cons('sun_daily') = 'FOREIGN KEY (stn_id) REFERENCES stations(stn_id) | PRIMARY KEY (stn_id, date)');
    res := pg_temp.item(res, '6c 옛 표 둘의 정책은 "누구나 읽기" 하나씩이고(anon · authenticated, select), updated_at 트리거도 그대로다',
      (select string_agg(tablename || ':' || policyname || ':' || cmd || ':' || roles::text, ' | ' order by tablename)
         from pg_policies where schemaname = 'public' and tablename in ('heat_daily', 'sun_daily'))
        = 'heat_daily:heat_daily 누구나 읽기:SELECT:{anon,authenticated} | sun_daily:sun_daily 누구나 읽기:SELECT:{anon,authenticated}'
      and (select count(*) from pg_trigger where not tgisinternal
            and tgname in ('heat_daily_set_updated_at', 'sun_daily_set_updated_at')) = 2
      and (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname in ('heat_daily', 'sun_daily') and c.relrowsecurity) = 2);
    ok1 := true;
    foreach t in array array['heat_daily', 'sun_daily'] loop
      foreach r in array array['anon', 'authenticated'] loop
        if not has_table_privilege(r, 'public.' || t, 'select') then ok1 := false; end if;
        if has_table_privilege(r, 'public.' || t, 'insert') or has_table_privilege(r, 'public.' || t, 'update')
           or has_table_privilege(r, 'public.' || t, 'delete') then
          ok1 := false;
        end if;
      end loop;
    end loop;
    res := pg_temp.item(res, '6d 옛 표 둘의 비회원 · 회원 권한도 읽기뿐 그대로다', ok1);
    res := pg_temp.item(res, '6e 옛 표 둘의 줄 수는 이 확인을 시작할 때와 지금이 같다 (새 표 시험이 옛 표를 건드리지 않았다)',
      (select count(*) from public.heat_daily) = old_heat0 and (select count(*) from public.sun_daily) = old_sun0);

    -- 여기서 일부러 오류를 내 위의 모든 변경(가짜 줄 · 시험용 사전 변경 포함)을 되돌린다.
    raise exception 'd1_3a_check_rollback';
  exception
    when raise_exception then
      if sqlerrm <> 'd1_3a_check_rollback' then
        raise;
      end if;
  end;

  insert into d1_3a_results (seq, item, ok)
  select (e ->> 'seq')::int, e ->> 'item', (e ->> 'ok')::boolean
  from jsonb_array_elements(res) e;
end
$check$;

-- 마지막 줄 all_ok 가 true 면 통과. 위 DO 의 변경은 모두 되돌려졌다 (가짜 줄 · 시험용 사전 변경이 남지 않음).
select seq, item, ok from d1_3a_results
union all
select 999, 'all_ok', coalesce(bool_and(coalesce(ok, false)), false) and count(*) = 37 from d1_3a_results
order by seq;
