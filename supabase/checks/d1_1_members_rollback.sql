-- 되돌리기 SQL: 회원 DB (데이터 계약 v2.0, 이슈 #178, 결정 0059)
--
-- 실행하지 않는다. 마이그레이션 20261119000000_data_contract_v2_0_members.sql 이 만든 것을 지우고 싶을 때만
-- (예: 무료 플랜에서 백업 대신 쓰는 되돌리기) SQL Editor 에서 Run. 여러 번 실행해도 오류가 나지 않는다.
--
-- 주의: members 와 ops.withdrawn_accounts 안의 줄이 함께 사라진다. 실제 회원이 생긴 뒤에는 쓰지 않는다.
-- auth.users 는 건드리지 않는다. public.set_updated_at() 은 다른 표(heat_daily, sun_daily)도 쓰므로 지우지 않는다.
-- 순서: 트리거 → 함수 → 표.

drop trigger if exists on_auth_user_created on auth.users;

drop function if exists public.handle_new_user();
drop function if exists public.ensure_my_member();
drop function if exists public.delete_my_account();
drop function if exists public.member_seed(jsonb, jsonb);

drop table if exists ops.withdrawn_accounts;
drop table if exists public.members;
