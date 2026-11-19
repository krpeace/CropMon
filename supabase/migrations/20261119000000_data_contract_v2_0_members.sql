-- 목적: 1/1 회원제의 첫 DB — 회원 표 members, 가입하면 줄이 저절로 생기는 트리거, 탈퇴 기록, 탈퇴 함수 (데이터 계약 v2.0, 이슈 #178, 결정 0059).
--       농장·작기·관수 기록·계산 결과 표는 v2.1(D1-2)에서 더한다.
--
-- 만드는 것:
--   public.members              회원 한 사람 = 한 줄. 회원은 자기 줄만 읽고, 정해진 9개 열만 고친다.
--   public.member_seed()        가입 때 로그인 공급자가 준 이름·공급자 이름을 고르는 내부 함수 (실행 권한 없음)
--   public.handle_new_user()    auth.users 에 줄이 생기면 members 줄을 넣는 트리거 함수 (오류를 내지 않음)
--   public.ensure_my_member()   줄이 빠진 회원이 로그인 직후 자기 줄을 만드는 함수
--   ops.withdrawn_accounts      탈퇴 기록(회원 번호의 해시만, 7일 보관은 정리 작업 O2가 한다)
--   public.delete_my_account()  회원 본인이 탈퇴한다
--
-- 실행 방법:
--   1. 운영 DB 를 바꾸기 전에: 유료 플랜이면 Supabase 대시보드 → Database → Backups 에서 손으로 한 번 받는다.
--      무료 플랜이면 이 파일은 새 표·새 함수·새 트리거만 만들고 기존 표를 건드리지 않으므로,
--      supabase/checks/d1_1_members_rollback.sql (되돌리기)을 준비해 두는 것으로 갈음한다.
--   2. SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run. 여러 번 실행해도 오류가 나지 않는다.
--   3. supabase/checks/d1_1_members_check.sql 을 붙여 넣고 Run → 맨 끝 줄 all_ok = true 인지 본다 (아무것도 남기지 않는다).
--
-- 근거: 가입 시 줄 만들기(auth.users after insert + security definer + search_path 비움) https://supabase.com/docs/guides/auth/managing-user-data
--       사용자 메타데이터 열 https://supabase.com/docs/guides/auth/users
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v2.0)

-- ---------------------------------------------------------------------------
-- 1. public.members
-- ---------------------------------------------------------------------------
create table if not exists public.members (
  user_id              uuid primary key references auth.users (id) on delete cascade,
  display_name         text,
  provider             text check (provider in ('kakao', 'naver', 'google')),
  role                 text check (role in ('farmer', 'advisor')),
  role_verified_at     timestamptz,
  terms_version        text,
  terms_agreed_at      timestamptz,
  privacy_version      text,
  privacy_confirmed_at timestamptz,
  age14_confirmed_at   timestamptz,
  layout               jsonb check (jsonb_typeof(layout) = 'object'),
  font_scale           jsonb check (jsonb_typeof(font_scale) = 'object'),
  theme                text check (theme in ('light', 'dark')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- 고칠 때 updated_at 을 지금으로 (public.set_updated_at() 은 v1.8 에서 만들었다)
drop trigger if exists members_set_updated_at on public.members;
create trigger members_set_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. 권한(RLS) — 자기 줄만
-- ---------------------------------------------------------------------------
alter table public.members enable row level security;

-- 기본으로 붙는 권한을 먼저 거둔다. anon(비회원)에게는 이 표의 권한을 하나도 주지 않는다.
revoke all on public.members from anon, authenticated;

drop policy if exists "회원은 자기 줄만 읽는다" on public.members;
create policy "회원은 자기 줄만 읽는다"
  on public.members
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "회원은 자기 줄만 고친다" on public.members;
create policy "회원은 자기 줄만 고친다"
  on public.members
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 넣기는 가입 트리거, 지우기는 탈퇴 함수만 한다 (회원에게 insert·delete 권한과 정책 없음).
grant select on public.members to authenticated;
-- 열 단위로 막는다: role · role_verified_at · provider · user_id · created_at · updated_at 은 회원이 못 바꾼다.
grant update (display_name, terms_version, terms_agreed_at, privacy_version, privacy_confirmed_at, age14_confirmed_at, layout, font_scale, theme) on public.members to authenticated;

-- ---------------------------------------------------------------------------
-- 3. 이름·공급자 고르기 (가입 트리거와 ensure_my_member 가 같이 부른다 — 식이 두 곳에 있으면 어긋난다)
--    오류가 날 일이 없게 쓴다: 형 변환 없음, 모르는 값은 비움, 이름은 100자까지.
-- ---------------------------------------------------------------------------
create or replace function public.member_seed(meta jsonb, app_meta jsonb)
returns table (display_name text, provider text)
language sql
immutable
set search_path = ''
as $$
  select
    left(
      coalesce(
        nullif(btrim(meta ->> 'name'), ''),
        nullif(btrim(meta ->> 'full_name'), ''),
        nullif(btrim(meta ->> 'nickname'), ''),
        nullif(btrim(meta ->> 'preferred_username'), '')
      ),
      100
    ),
    case
      when lower(app_meta ->> 'provider') in ('kakao', 'google') then lower(app_meta ->> 'provider')
      when lower(app_meta ->> 'provider') = 'naver' then 'naver'
      when lower(app_meta ->> 'provider') like 'custom:naver%' then 'naver'
      else null
    end;
$$;

revoke all on function public.member_seed(jsonb, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. 가입하면 members 줄이 저절로 생긴다 — auth.users 트리거
--    여기서 오류가 나면 그 사람은 로그인 자체가 막힌다. 그래서 오류를 낼 곳을 없앴고, 혹시 모를 오류도 삼킨다
--    (줄이 빠지면 로그인 직후 ensure_my_member() 가 만든다). 경고 문구에는 오류 원문(이름이 섞일 수 있음)을 쓰지 않는다.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.members (user_id, display_name, provider)
  select new.id, s.display_name, s.provider
  from public.member_seed(new.raw_user_meta_data, new.raw_app_meta_data) s
  on conflict (user_id) do nothing;
  return new;
exception
  when others then
    raise warning 'public.handle_new_user: members 줄을 만들지 못함 (sqlstate %)', sqlstate;
    return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 5. 줄이 빠진 회원이 자기 줄을 만든다 (로그인 직후 한 번 부른다). 인자가 없어 남의 줄은 만들 수 없다.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_my_member()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into public.members (user_id, display_name, provider)
  select u.id, s.display_name, s.provider
  from auth.users u
  cross join lateral public.member_seed(u.raw_user_meta_data, u.raw_app_meta_data) s
  where u.id = auth.uid()
  on conflict (user_id) do nothing;
end;
$$;

revoke all on function public.ensure_my_member() from public, anon;
grant execute on function public.ensure_my_member() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. 탈퇴
--    ops.withdrawn_accounts: 백업에서 되살릴 때 그 사이 탈퇴한 회원을 다시 지우기 위한 작은 기록.
--    회원 번호는 되돌릴 수 없는 해시로만 남기고, 7일 지난 줄 지우기는 정리 작업(O2)이 한다.
-- ---------------------------------------------------------------------------
create schema if not exists ops;
revoke all on schema ops from public, anon, authenticated;

create table if not exists ops.withdrawn_accounts (
  user_hash    text primary key,
  withdrawn_at timestamptz not null default now()
);

alter table ops.withdrawn_accounts enable row level security;
revoke all on ops.withdrawn_accounts from anon, authenticated;

-- 회원 본인이 탈퇴한다. 인자를 받지 않으므로 남의 번호를 넘길 길이 없다.
-- auth.users 줄을 지우면 members 가 연쇄로 지워진다 (D1-2 의 농장 표들도 같은 연쇄를 쓴다).
-- SNS 연결 끊기는 서버 키가 필요해 L6 에서 서버 쪽 함수로 한다.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  insert into ops.withdrawn_accounts (user_hash)
  values (encode(sha256(convert_to(v_uid::text, 'UTF8')), 'hex'))
  on conflict (user_hash) do update set withdrawn_at = now();
  delete from auth.users where id = v_uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ---------------------------------------------------------------------------
-- 7. 이미 있는 auth.users 줄 채우기 (시험 계정 등. 운영 DB 는 확인 당시 0줄)
-- ---------------------------------------------------------------------------
insert into public.members (user_id, display_name, provider)
select u.id, s.display_name, s.provider
from auth.users u
cross join lateral public.member_seed(u.raw_user_meta_data, u.raw_app_meta_data) s
on conflict (user_id) do nothing;
