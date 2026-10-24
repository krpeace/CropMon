-- 목적: 데이터 계약 v1.1. 재배 방식별 Kc 표(crop_kc_sets)를 더하고, 계산 조건(scenarios)이 재배 방식을 가리키게 한다.
--       사과는 FAO-56 Table 12 에 재배 방식(청경·초생 재배 × 서리 유무)별 Kc 가 네 가지 있다.
--       11/06 비회원 화면부터 사용자가 고를 수 있게, 공개 조건을 재배 방식마다 미리 계산해 둔다.
--
-- 실행 방법:
--   1. 먼저 20261024000000_data_contract_v1.sql, 20261024010000_seed_dictionaries.sql 을 실행해 둔다.
--   2. Supabase 대시보드 → SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run 을 누른다.
--   3. 이어서 20261024030000_seed_kc_sets.sql 을 실행한다 (재배 방식 값과 계산 조건).
--   여러 번 실행해도 오류가 나지 않는다.
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v1.1), 결정 기록: docs/decisions/0005-kc-sets.md

-- ---------------------------------------------------------------------------
-- 1. crop_kc_sets: 재배 방식별 Kc (FAO-56 표준값 층)
--    "시나리오"라는 말은 scenarios(계산 조건)와 헷갈려서 "재배 방식"이라고 부른다.
-- ---------------------------------------------------------------------------
create table if not exists public.crop_kc_sets (
  kc_set_id text primary key,
  crop_id text not null references public.crops (crop_id),
  set_no int not null check (set_no >= 1),
  name_ko text not null,
  note text,
  kc_ini numeric not null,
  kc_mid numeric not null,
  kc_end numeric not null,
  is_default boolean not null default false,
  sort_order int not null default 0,
  source text not null,
  unique (crop_id, set_no)
);

-- 작물마다 기본 재배 방식은 하나뿐이다.
create unique index if not exists crop_kc_sets_one_default
  on public.crop_kc_sets (crop_id)
  where is_default;

-- ---------------------------------------------------------------------------
-- 2. scenarios: 재배 방식 칸 추가
--    v1 의 계산 조건(재배 방식 없음)은 아직 물수지 자료가 붙기 전이라 지우고,
--    20261024030000_seed_kc_sets.sql 이 재배 방식이 들어간 새 이름으로 다시 넣는다.
-- ---------------------------------------------------------------------------
alter table public.scenarios
  add column if not exists kc_set_id text references public.crop_kc_sets (kc_set_id);

delete from public.scenarios where kc_set_id is null;

alter table public.scenarios
  alter column kc_set_id set not null;

-- 같은 지점·작물·작형·토성·연도라도 재배 방식이 다르면 다른 조건이다.
-- v1 의 같은 칸 묶음 제약(재배 방식 없음)을 이름과 상관없이 찾아 지운다.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.scenarios'::regclass
      and con.contype = 'u'
      and not exists (
        select 1
        from unnest(con.conkey) as k(attnum)
        join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum
        where a.attname = 'kc_set_id'
      )
  loop
    execute format('alter table public.scenarios drop constraint %I', c.conname);
  end loop;
end
$$;

create unique index if not exists scenarios_one_per_condition
  on public.scenarios (stn_id, crop_id, season_type_id, kc_set_id, soil_code, season_year);

-- 지점·작물·연도마다 비회원 화면에 처음 보여 줄 기본 조건은 하나뿐이다.
create unique index if not exists scenarios_one_default
  on public.scenarios (stn_id, crop_id, season_year)
  where is_default;

-- ---------------------------------------------------------------------------
-- 3. 권한: 누구나 읽기만. 쓰기는 서버 키(service role)만.
-- ---------------------------------------------------------------------------
alter table public.crop_kc_sets enable row level security;
revoke all on public.crop_kc_sets from anon, authenticated;
grant select on public.crop_kc_sets to anon, authenticated;
drop policy if exists "crop_kc_sets 누구나 읽기" on public.crop_kc_sets;
create policy "crop_kc_sets 누구나 읽기"
  on public.crop_kc_sets
  for select
  to anon, authenticated
  using (true);

-- scenarios 에 더한 칸도 읽기만 된다 (표 단위 권한은 v1 에서 이미 select 만 줌).
