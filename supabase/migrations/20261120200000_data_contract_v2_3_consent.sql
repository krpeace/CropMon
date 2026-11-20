-- 목적: 1/1 회원제의 동의 기록 — 동의 기록 함수, 동의 열 직접 고치기 권한 회수, 농장 쓰기는 동의한 회원만 (데이터 계약 v2.3, 이슈 #191, 결정 0065).
--
-- 바꾸는 것:
--   public.record_my_consent(p_terms_version, p_privacy_version)  동의 다섯 열을 DB 시각 now() 로 한 번에 쓰는 함수 (authenticated 만 실행)
--   public.members                                                동의 다섯 열의 직접 고치기 권한 회수 (display_name · layout · font_scale · theme 은 그대로)
--   public.member_has_consented()                                 "자기 members 줄의 terms_version 이 비어 있지 않음" 도우미 (정책이 쓴다)
--   public.farms · public.irrigation_logs                         넣기 · 고치기 정책에 "동의한 회원만"을 더함 (읽기 · 지우기는 그대로)
--
-- 왜: v2.0 에서 회원이 동의 다섯 열을 열 단위 권한으로 직접 고칠 수 있게 했는데, 그러면 동의 시각을 아무 값으로나 쓸 수 있어
--     기록으로서 약하다. 함수가 DB 시각으로만 쓰게 하고 직접 고치기는 막는다. 또 동의 전에는 회원 기능(농장 · 관수 기록)을
--     막는다 — 화면 막기는 편의이고 진짜 막이는 이 RLS 다 (결정 0061 · 0065).
--
-- 실행 방법 (순서):
--   1. supabase/checks/l4_consent_rollback.sql (되돌리기)을 열어 둔다 — 문제가 생기면 그것을 Run.
--   2. SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run. 여러 번 실행해도 오류가 나지 않는다.
--   3. supabase/checks/l4_consent_check.sql 을 붙여 넣고 Run → 맨 끝 줄 all_ok = true 인지 본다 (아무것도 남기지 않는다).
--   4. supabase/checks/d1_1_members_check.sql · d1_2_farms_check.sql 도 다시 Run → 각각 all_ok = true (v2.3 에 맞게 고쳤다).
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v2.3)

-- ---------------------------------------------------------------------------
-- 1. 동의 기록 함수
--    판 값은 앞뒤 공백을 떼고, 비었거나 100자를 넘으면 거절한다(옳은 판인지는 화면 쪽이 지킨다 — 계약 그대로).
--    줄이 빠진 회원은 ensure_my_member() 와 같은 식(member_seed)으로 만든 뒤 쓴다(오류로 막는 것보다 로그인 흐름에 안전).
--    다섯 열의 시각은 모두 같은 now() 값 하나다.
-- ---------------------------------------------------------------------------
create or replace function public.record_my_consent(p_terms_version text, p_privacy_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_terms   text := btrim(p_terms_version);
  v_privacy text := btrim(p_privacy_version);
  v_now     timestamptz := now();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if v_terms is null or v_terms = '' or length(v_terms) > 100
     or v_privacy is null or v_privacy = '' or length(v_privacy) > 100 then
    raise exception 'invalid consent version' using errcode = '22023';
  end if;

  insert into public.members (user_id, display_name, provider)
  select u.id, s.display_name, s.provider
  from auth.users u
  cross join lateral public.member_seed(u.raw_user_meta_data, u.raw_app_meta_data) s
  where u.id = v_uid
  on conflict (user_id) do nothing;

  update public.members
  set terms_version        = v_terms,
      terms_agreed_at      = v_now,
      privacy_version      = v_privacy,
      privacy_confirmed_at = v_now,
      age14_confirmed_at   = v_now
  where user_id = v_uid;
end;
$$;

revoke all on function public.record_my_consent(text, text) from public, anon;
grant execute on function public.record_my_consent(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. 동의 다섯 열은 회원이 직접 못 고친다 (함수로만). 나머지 네 열(display_name · layout · font_scale · theme)의 권한은 그대로.
-- ---------------------------------------------------------------------------
revoke update (terms_version, terms_agreed_at, privacy_version, privacy_confirmed_at, age14_confirmed_at)
  on public.members from authenticated;

-- ---------------------------------------------------------------------------
-- 3. 도우미: 자기 members 줄의 terms_version 이 비어 있지 않은가
--    security definer 인 이유: farms · irrigation_logs 의 정책 안에서 members 를 다시 읽는데, 그때 members 의 정책이 겹쳐
--    평가되지 않게 한다(정책 안의 정책). 인자가 없고 auth.uid() 의 줄만 보므로 남의 줄을 알아낼 길이 없다.
-- ---------------------------------------------------------------------------
create or replace function public.member_has_consented()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.members m
    where m.user_id = auth.uid()
      and m.terms_version is not null
      and btrim(m.terms_version) <> ''
  );
$$;

revoke all on function public.member_has_consented() from public, anon;
grant execute on function public.member_has_consented() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. 농장 쓰기는 동의한 회원만 — 넣기 · 고치기 정책만. 읽기 · 지우기는 막지 않는다
--    (판이 바뀌어 다시 동의를 기다리는 회원도 자기 자료는 보고 지울 수 있다).
-- ---------------------------------------------------------------------------
drop policy if exists "회원은 자기 농장을 만든다" on public.farms;
create policy "회원은 자기 농장을 만든다"
  on public.farms for insert to authenticated
  with check (auth.uid() = user_id and public.member_has_consented());

drop policy if exists "회원은 자기 농장을 고친다" on public.farms;
create policy "회원은 자기 농장을 고친다"
  on public.farms for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and public.member_has_consented());

drop policy if exists "회원은 자기 관수 기록을 넣는다" on public.irrigation_logs;
create policy "회원은 자기 관수 기록을 넣는다"
  on public.irrigation_logs for insert to authenticated
  with check (exists (select 1 from public.farms f where f.farm_id = irrigation_logs.farm_id and f.user_id = auth.uid())
              and public.member_has_consented());

drop policy if exists "회원은 자기 관수 기록을 고친다" on public.irrigation_logs;
create policy "회원은 자기 관수 기록을 고친다"
  on public.irrigation_logs for update to authenticated
  using (exists (select 1 from public.farms f where f.farm_id = irrigation_logs.farm_id and f.user_id = auth.uid()))
  with check (exists (select 1 from public.farms f where f.farm_id = irrigation_logs.farm_id and f.user_id = auth.uid())
              and public.member_has_consented());
