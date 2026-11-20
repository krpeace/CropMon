-- 확인 SQL: 회원 DB (데이터 계약 v2.0, 이슈 #178, 결정 0059)
--
-- 언제: 마이그레이션 20261119000000_data_contract_v2_0_members.sql 을 Run 한 뒤 (v2.3 20261120200000 을 Run 한 뒤에도 그대로 통과한다 — 3a 를 v2.3 에 맞게 고쳤다).
-- 방법: SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run.
-- 결과: 항목마다 true/false 한 줄, 맨 끝 줄 all_ok = true 면 통과. 결과를 PR 에 붙인다 (true/false 만, 개인 값 없음).
--
-- 아무것도 남기지 않는다. 가짜 회원(@example.invalid, 번호는 gen_random_uuid())을 만들어 시험하고,
-- 끝에서 일부러 오류를 내 그 안의 변경을 모두 되돌린다 (결과는 되돌려지지 않는 변수로 꺼내 보여 준다).
-- 항목이 하나라도 false 이면 그 항목 이름을 알려 주세요.

drop table if exists pg_temp.d1_1_results;
create temp table d1_1_results (seq int, item text, ok boolean);

do $check$
declare
  res   jsonb := '[]'::jsonb;
  u_a   uuid := gen_random_uuid(); -- kakao
  u_b   uuid := gen_random_uuid(); -- custom:naver
  u_e   uuid := gen_random_uuid(); -- 이름·공급자 없음 (email)
  u_g   uuid := gen_random_uuid(); -- google, full_name
  u_h   uuid := gen_random_uuid(); -- 메타데이터가 아예 null
  u_c   uuid := gen_random_uuid(); -- 줄이 빠진 회원 (ensure_my_member 시험)
  u_d   uuid := gen_random_uuid(); -- 줄이 빠진 다른 회원
  hash_a text;
  n     int;
  n2    int;
  v1    boolean;
  v2    boolean;
  v3    boolean;
  v4    boolean;
begin
  begin
    -- ---------------------------------------------------------------
    -- 1. 가입하면 members 줄이 저절로 생긴다
    -- ---------------------------------------------------------------
    insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
      (u_a, u_a::text || '@example.invalid', '{"provider":"kakao","providers":["kakao"]}', '{"nickname":"가짜가"}'),
      (u_b, u_b::text || '@example.invalid', '{"provider":"custom:naver"}', '{"name":"가짜나"}'),
      (u_e, u_e::text || '@example.invalid', '{"provider":"email"}', '{}'),
      (u_g, u_g::text || '@example.invalid', '{"provider":"google"}', '{"full_name":"가짜구"}'),
      (u_h, u_h::text || '@example.invalid', null, null);

    select count(*) into n from public.members where user_id in (u_a, u_b, u_e, u_g, u_h);
    res := res || jsonb_build_array(jsonb_build_object('seq', 1, 'item', '1a 가입 5명 → members 5줄', 'ok', n = 5));

    res := res || jsonb_build_array(jsonb_build_object('seq', 2, 'item', '1b 카카오: provider=kakao, 이름=nickname',
      'ok', exists (select 1 from public.members where user_id = u_a and provider = 'kakao' and display_name = '가짜가')));
    res := res || jsonb_build_array(jsonb_build_object('seq', 3, 'item', '1c 네이버 custom:naver → provider=naver, 이름=name',
      'ok', exists (select 1 from public.members where user_id = u_b and provider = 'naver' and display_name = '가짜나')));
    res := res || jsonb_build_array(jsonb_build_object('seq', 4, 'item', '1d 구글: provider=google, 이름=full_name',
      'ok', exists (select 1 from public.members where user_id = u_g and provider = 'google' and display_name = '가짜구')));
    res := res || jsonb_build_array(jsonb_build_object('seq', 5, 'item', '1e 이름·공급자 없는 메타데이터도 오류 없이 빈 칸으로 들어감',
      'ok', exists (select 1 from public.members where user_id = u_e and provider is null and display_name is null)
        and exists (select 1 from public.members where user_id = u_h and provider is null and display_name is null)));

    -- ---------------------------------------------------------------
    -- 2. A 로 바꾸면 자기 줄 하나만 보인다
    -- ---------------------------------------------------------------
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u_a::text, true);

    select count(*) into n from public.members;
    select count(*) into n2 from public.members where user_id = u_b;
    res := res || jsonb_build_array(jsonb_build_object('seq', 6, 'item', '2 회원 A 는 자기 줄 하나만 보이고 B 줄은 안 보임',
      'ok', n = 1 and n2 = 0));

    -- ---------------------------------------------------------------
    -- 3. A 가 고칠 수 있는 열 / 못 고치는 열 / 남의 줄
    -- ---------------------------------------------------------------
    begin
      -- v2.3(결정 0065)부터 동의 다섯 열은 회원이 직접 못 고친다(함수 record_my_consent 로만) — 그 시험은 l4_consent_check.sql 에 있다.
      update public.members
         set display_name = '바꾼이름', layout = '{"v":1}'::jsonb, font_scale = '{"v":1}'::jsonb, theme = 'dark'
       where user_id = u_a;
      get diagnostics n = row_count;
      v1 := (n = 1);
    exception when others then
      v1 := false;
    end;
    res := res || jsonb_build_array(jsonb_build_object('seq', 7, 'item', '3a A 가 자기 display_name·layout·font_scale·theme 를 고칠 수 있음 (동의 다섯 열은 v2.3 부터 직접 못 고침)', 'ok', v1));

    v1 := false; v2 := false; v3 := false; v4 := false;
    begin
      update public.members set role = 'advisor' where user_id = u_a;
    exception when insufficient_privilege then v1 := true; when others then v1 := false;
    end;
    begin
      update public.members set provider = 'google' where user_id = u_a;
    exception when insufficient_privilege then v2 := true; when others then v2 := false;
    end;
    begin
      update public.members set user_id = gen_random_uuid() where user_id = u_a;
    exception when insufficient_privilege then v3 := true; when others then v3 := false;
    end;
    begin
      update public.members set role_verified_at = now() where user_id = u_a;
    exception when insufficient_privilege then v4 := true; when others then v4 := false;
    end;
    res := res || jsonb_build_array(jsonb_build_object('seq', 8, 'item', '3b A 는 role·provider·user_id·role_verified_at 을 못 고침',
      'ok', v1 and v2 and v3 and v4));

    begin
      update public.members set theme = 'dark' where user_id = u_b;
      get diagnostics n = row_count;
      v1 := (n = 0);
    exception when others then
      v1 := false;
    end;
    res := res || jsonb_build_array(jsonb_build_object('seq', 9, 'item', '3c A 가 B 줄을 고치면 0줄', 'ok', v1));

    -- ---------------------------------------------------------------
    -- 4. A 는 넣기·지우기 못 하고 탈퇴 기록을 못 읽는다
    -- ---------------------------------------------------------------
    v1 := false; v2 := false; v3 := false;
    begin
      insert into public.members (user_id) values (gen_random_uuid());
    exception when insufficient_privilege then v1 := true; when others then v1 := false;
    end;
    begin
      delete from public.members where user_id = u_a;
      get diagnostics n = row_count;
      v2 := false; -- 지워졌다면 실패
    exception when insufficient_privilege then v2 := true; when others then v2 := false;
    end;
    begin
      perform 1 from ops.withdrawn_accounts limit 1;
    exception when insufficient_privilege then v3 := true; when others then v3 := false;
    end;
    res := res || jsonb_build_array(jsonb_build_object('seq', 10, 'item', '4 A 는 members 넣기·지우기와 ops.withdrawn_accounts 읽기를 못 함',
      'ok', v1 and v2 and v3));

    -- ---------------------------------------------------------------
    -- 5. anon(비회원)은 members 를 못 본다
    -- ---------------------------------------------------------------
    execute 'reset role';
    execute 'set local role anon';
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    begin
      select count(*) into n from public.members;
      v1 := (n = 0);
    exception when insufficient_privilege then v1 := true; when others then v1 := false;
    end;
    res := res || jsonb_build_array(jsonb_build_object('seq', 11, 'item', '5 anon 은 members 에서 0줄(또는 권한 오류)', 'ok', v1));

    -- ---------------------------------------------------------------
    -- 7. anon 이 delete_my_account() 를 부르면 실패 (6 보다 먼저 — 아직 B 가 있어야 하므로 순서 무관)
    -- ---------------------------------------------------------------
    begin
      perform public.delete_my_account();
      v1 := false;
    exception when insufficient_privilege then v1 := true; when others then v1 := false;
    end;
    res := res || jsonb_build_array(jsonb_build_object('seq', 12, 'item', '7 anon 이 delete_my_account() 를 부르면 실패', 'ok', v1));

    begin
      perform public.ensure_my_member();
      v1 := false;
    exception when insufficient_privilege then v1 := true; when others then v1 := false;
    end;
    res := res || jsonb_build_array(jsonb_build_object('seq', 13, 'item', '9 anon 이 ensure_my_member() 를 부르면 실패', 'ok', v1));

    -- ---------------------------------------------------------------
    -- 6. A 가 delete_my_account() → A 의 auth.users · members 가 없어지고 해시 한 줄, B 는 그대로
    -- ---------------------------------------------------------------
    execute 'reset role';
    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', u_a, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u_a::text, true);
    begin
      perform public.delete_my_account();
      v1 := true;
    exception when others then
      v1 := false;
    end;
    execute 'reset role';

    hash_a := encode(sha256(convert_to(u_a::text, 'UTF8')), 'hex');
    res := res || jsonb_build_array(jsonb_build_object('seq', 14, 'item', '6a A 가 delete_my_account() 를 부르면 오류 없이 끝남', 'ok', v1));
    res := res || jsonb_build_array(jsonb_build_object('seq', 15, 'item', '6b A 의 auth.users · members 줄이 없어짐',
      'ok', not exists (select 1 from auth.users where id = u_a)
        and not exists (select 1 from public.members where user_id = u_a)));
    res := res || jsonb_build_array(jsonb_build_object('seq', 16, 'item', '6c ops.withdrawn_accounts 에 A 해시 한 줄',
      'ok', (select count(*) from ops.withdrawn_accounts where user_hash = hash_a) = 1));
    res := res || jsonb_build_array(jsonb_build_object('seq', 17, 'item', '6d B 는 그대로',
      'ok', exists (select 1 from auth.users where id = u_b)
        and exists (select 1 from public.members where user_id = u_b)));

    -- ---------------------------------------------------------------
    -- 8. 줄이 빠진 회원은 ensure_my_member() 로 자기 줄을 만든다 (두 번 불러도 오류 없음, 남의 줄은 못 만듦)
    -- ---------------------------------------------------------------
    insert into auth.users (id, email, raw_app_meta_data, raw_user_meta_data) values
      (u_c, u_c::text || '@example.invalid', '{"provider":"kakao"}', '{"name":"가짜씨"}'),
      (u_d, u_d::text || '@example.invalid', '{"provider":"google"}', '{"name":"가짜디"}');
    delete from public.members where user_id in (u_c, u_d); -- 트리거가 실패했다고 가정

    execute 'set local role authenticated';
    perform set_config('request.jwt.claims', json_build_object('sub', u_c, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', u_c::text, true);
    begin
      perform public.ensure_my_member();
      perform public.ensure_my_member();
      v1 := true;
    exception when others then
      v1 := false;
    end;
    execute 'reset role';

    res := res || jsonb_build_array(jsonb_build_object('seq', 18, 'item', '8a C 가 ensure_my_member() 를 두 번 불러도 오류 없음', 'ok', v1));
    res := res || jsonb_build_array(jsonb_build_object('seq', 19, 'item', '8b C 의 줄이 생기고 이름·공급자가 들어감',
      'ok', exists (select 1 from public.members where user_id = u_c and provider = 'kakao' and display_name = '가짜씨')));
    res := res || jsonb_build_array(jsonb_build_object('seq', 20, 'item', '8c 다른 회원 D 의 줄은 만들어지지 않음',
      'ok', not exists (select 1 from public.members where user_id = u_d)));

    -- 여기서 일부러 오류를 내 위의 모든 변경(가짜 회원·탈퇴 기록 포함)을 되돌린다.
    raise exception 'd1_1_check_rollback';
  exception
    when raise_exception then
      if sqlerrm <> 'd1_1_check_rollback' then
        raise;
      end if;
  end;

  insert into d1_1_results (seq, item, ok)
  select (r ->> 'seq')::int, r ->> 'item', (r ->> 'ok')::boolean
  from jsonb_array_elements(res) r;
end
$check$;

-- 마지막 줄 all_ok 가 true 면 통과. 위 DO 의 변경은 모두 되돌려졌다 (가짜 회원 · 탈퇴 기록이 남지 않음).
select seq, item, ok from d1_1_results
union all
select 999, 'all_ok', coalesce(bool_and(coalesce(ok, false)), false) and count(*) = 20 from d1_1_results
order by seq;
