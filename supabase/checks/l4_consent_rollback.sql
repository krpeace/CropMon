-- 되돌리기 SQL: 동의 기록 (데이터 계약 v2.3, 이슈 #191, 결정 0065)
--
-- 실행하지 않는다. 마이그레이션 20261120200000_data_contract_v2_3_consent.sql 을 되돌리고 싶을 때만 SQL Editor 에서 Run.
-- 여러 번 실행해도 오류가 나지 않는다.
--
-- 되돌리는 것: 농장 · 관수 기록의 넣기 · 고치기 정책에서 "동의한 회원만" 조건 빼기 → 동의 다섯 열의 직접 고치기 권한 되돌리기 →
--   새 함수 둘 지우기. members 의 줄과 동의 기록(값)은 건드리지 않는다. 농장 표의 줄도 건드리지 않는다.
-- 순서: 정책이 도우미 함수를 쓰므로 정책을 먼저 v2.1 상태로 되돌린 뒤 함수를 지운다.

drop policy if exists "회원은 자기 농장을 만든다" on public.farms;
create policy "회원은 자기 농장을 만든다"
  on public.farms for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "회원은 자기 농장을 고친다" on public.farms;
create policy "회원은 자기 농장을 고친다"
  on public.farms for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "회원은 자기 관수 기록을 넣는다" on public.irrigation_logs;
create policy "회원은 자기 관수 기록을 넣는다"
  on public.irrigation_logs for insert to authenticated
  with check (exists (select 1 from public.farms f where f.farm_id = irrigation_logs.farm_id and f.user_id = auth.uid()));

drop policy if exists "회원은 자기 관수 기록을 고친다" on public.irrigation_logs;
create policy "회원은 자기 관수 기록을 고친다"
  on public.irrigation_logs for update to authenticated
  using (exists (select 1 from public.farms f where f.farm_id = irrigation_logs.farm_id and f.user_id = auth.uid()))
  with check (exists (select 1 from public.farms f where f.farm_id = irrigation_logs.farm_id and f.user_id = auth.uid()));

-- 동의 다섯 열의 직접 고치기 권한을 v2.0 상태로
grant update (terms_version, terms_agreed_at, privacy_version, privacy_confirmed_at, age14_confirmed_at)
  on public.members to authenticated;

drop function if exists public.member_has_consented();
drop function if exists public.record_my_consent(text, text);
