-- 목적: 웹사이트가 Supabase 데이터베이스에 잘 연결되는지 확인하기 위한 작은 표(app_health)를 만든다.
--       누구나 읽을 수만 있고, 쓰기(추가·수정·삭제)는 할 수 없다.
--
-- 실행 방법:
--   1. Supabase 대시보드에서 이 프로젝트를 연다.
--   2. 왼쪽 메뉴의 SQL Editor 를 연다.
--   3. 이 파일 내용을 모두 복사해 붙여 넣고 Run 을 누른다.
--   여러 번 실행해도 오류가 나지 않는다.
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v0)

create table if not exists public.app_health (
  id int primary key,
  note text not null,
  updated_at timestamptz not null default now()
);

-- 행 단위 보안(RLS)을 켠다. 정책이 허용한 일만 할 수 있다.
alter table public.app_health enable row level security;

-- 비회원(anon)과 회원(authenticated)에게 읽기만 허용한다. 쓰기 정책은 만들지 않는다.
grant select on public.app_health to anon, authenticated;

drop policy if exists "app_health 누구나 읽기" on public.app_health;
create policy "app_health 누구나 읽기"
  on public.app_health
  for select
  to anon, authenticated
  using (true);

-- 연결 확인용 행 한 줄.
insert into public.app_health (id, note)
values (1, 'ok')
on conflict (id) do nothing;
