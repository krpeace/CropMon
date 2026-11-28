-- 목적: 내 농장 설정 칸 — 관수 방법 · 뿌리 깊이 · 단계 일수 · 올해만 시작일 · 물 계수 곡선, 그리고 사과 · 배추 기본 단계 일수
--       (데이터 계약 v2.6, 이슈 #215, 결정 0076). 화면 변경은 없다. 계산은 croplib-dp 가 한다.
--
-- 만드는 것:
--   public.irrigation_methods            관수 방법 사전 3줄 (누구나 읽기, 쓰기 없음)
--   public.farms_check_settings()        설정 값 검사 트리거 (작목 · 작형이 바뀌면 단계 일수 · 뿌리 깊이를 비움)
--   public.set_this_season_start(date)   올해만 시작일 바꾸기 (동의한 회원 본인)
--   public.confirm_this_season_start()   시작일 [맞아요] (동의한 회원 본인)
--
-- 바꾸는 것:
--   crop_seasons       stage_labels · start_event_label · stage_editable · farm_open, 사과 · 배추 기본 단계 일수
--   farms              irrigation_method · zr_m · l_ini_d · l_dev_d · l_mid_d · l_late_d (회원 쓰기)
--   farm_seasons       start_source · start_confirmed_at
--   farm_calc_status   물 계수 꼭짓점 · 단계 경계 (croplib-dp 가 쓴다)
--   sync_farm_seasons_at · farms_after_update_crop · farms_after_update_calc 트리거
--   scenarios          2027 사과 · 여름배추의 작기 끝 (2026 은 그대로)
--
-- 실행 방법:
--   ⚠ 검토 채팅이 이슈 #215 에 "SQL 실행해도 됨"이라고 알린 뒤에 실행한다 (croplib-dp 확인 뒤).
--   1. supabase/checks/v2_6_farm_settings_rollback.sql (되돌리기)을 열어 둔다.
--   2. SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run. 여러 번 실행해도 오류가 나지 않는다
--      (단, 나중에 값만 바꿔 연 작형의 farm_open 은 다시 실행하면 이 파일 값으로 돌아간다).
--   3. supabase/checks/v2_6_farm_settings_check.sql → all_ok = true (읽기만).
--   4. supabase/checks/d1_2_farms_check.sql → 맨 끝 줄 all_ok = true (동작 시험. 되돌려지는 블록이라 남는 것이 없다).
--
-- 데이터 계약: docs/DATA_CONTRACT.md (v2.6)

-- ---------------------------------------------------------------------------
-- 1. public.irrigation_methods — 관수 방법 사전. 효율 = 관수 기록 중 뿌리층에 들어가는 몫.
--    공개 계산의 관수효율(croplib-dp 코드 기본값 0.95)과는 따로 관리한다 — 값이 같을 뿐 연결이 없다.
-- ---------------------------------------------------------------------------
create table if not exists public.irrigation_methods (
  method_code text primary key,
  name_ko     text not null,
  note        text not null,
  efficiency  numeric not null check (efficiency > 0 and efficiency <= 1),
  is_default  boolean not null default false,
  sort_order  int not null,
  source      text not null
);

create unique index if not exists irrigation_methods_one_default
  on public.irrigation_methods (is_default) where is_default;

alter table public.irrigation_methods enable row level security;
revoke all on public.irrigation_methods from anon, authenticated;
grant select on public.irrigation_methods to anon, authenticated;
drop policy if exists "irrigation_methods 누구나 읽기" on public.irrigation_methods;
create policy "irrigation_methods 누구나 읽기"
  on public.irrigation_methods
  for select
  to anon, authenticated
  using (true);

insert into public.irrigation_methods (method_code, name_ko, note, efficiency, is_default, sort_order, source) values
  ('drip', '점적관수', '가는 관으로 뿌리 가까이에 물을 방울방울 줘요.', 0.95, true, 1, '관개 방식별 대표 효율, 사용자 결정 2026-11-27'),
  ('sprinkler', '스프링클러', '물을 공중으로 뿌려 비처럼 적셔요.', 0.75, false, 2, '관개 방식별 대표 효율, 사용자 결정 2026-11-27'),
  ('furrow', '도랑관수', '고랑을 따라 물을 흘려보내요.', 0.40, false, 3, '관개 방식별 대표 효율, 사용자 결정 2026-11-27')
on conflict (method_code) do update set
  name_ko = excluded.name_ko, note = excluded.note, efficiency = excluded.efficiency,
  is_default = excluded.is_default, sort_order = excluded.sort_order, source = excluded.source;

-- ---------------------------------------------------------------------------
-- 2. public.crop_seasons — 단계 이름 · 시작 사건 이름 · 일수 고치기 · 농장에서 고르기
-- ---------------------------------------------------------------------------
alter table public.crop_seasons add column if not exists stage_labels text[];
alter table public.crop_seasons drop constraint if exists crop_seasons_stage_labels_len;
alter table public.crop_seasons
  add constraint crop_seasons_stage_labels_len
  check (stage_labels is null or cardinality(stage_labels) = 4);
alter table public.crop_seasons add column if not exists start_event_label text;
alter table public.crop_seasons add column if not exists stage_editable boolean not null default false;
alter table public.crop_seasons add column if not exists farm_open boolean not null default true;

update public.crop_seasons
  set stage_labels = array['발아·개화기', '신초·유과기', '과실 비대기', '성숙·수확기'], start_event_label = '싹 튼 날', stage_editable = true, farm_open = true
  where season_type_id = 'apple-main';
update public.crop_seasons
  set stage_labels = array['발아·전엽기', '신초·개화기', '과실 비대·성숙기', '수확·낙엽기'], start_event_label = '싹 튼 날', stage_editable = true, farm_open = false
  where season_type_id = 'grape-rainshelter';
update public.crop_seasons
  set stage_labels = array['가온·발아기', '신초·개화기', '과실 비대·성숙기', '수확 뒤'], start_event_label = '가온 시작한 날', stage_editable = true, farm_open = false
  where season_type_id = 'grape-heated';
update public.crop_seasons
  set stage_labels = array['활착기', '생육기', '결구기', '수확기'], start_event_label = '아주 심은 날', stage_editable = false, farm_open = true
  where season_type_id = 'kimchi_cabbage-summer';

-- ---------------------------------------------------------------------------
-- 3. public.farms — 관수 방법 · 뿌리 깊이 · 단계 일수
-- ---------------------------------------------------------------------------
alter table public.farms add column if not exists irrigation_method text not null default 'drip';
alter table public.farms drop constraint if exists farms_irrigation_method_fk;
alter table public.farms
  add constraint farms_irrigation_method_fk
  foreign key (irrigation_method) references public.irrigation_methods (method_code);

alter table public.farms add column if not exists zr_m numeric;
alter table public.farms drop constraint if exists farms_zr_m_choice;
alter table public.farms
  add constraint farms_zr_m_choice check (zr_m in (0.3, 0.5, 0.8, 1.0, 1.2, 1.5));

alter table public.farms add column if not exists l_ini_d int;
alter table public.farms add column if not exists l_dev_d int;
alter table public.farms add column if not exists l_mid_d int;
alter table public.farms add column if not exists l_late_d int;
alter table public.farms drop constraint if exists farms_stage_days_rule;
alter table public.farms
  add constraint farms_stage_days_rule check (
    num_nulls(l_ini_d, l_dev_d, l_mid_d, l_late_d) = 4
    or (
      num_nulls(l_ini_d, l_dev_d, l_mid_d, l_late_d) = 0
      and l_ini_d between 5 and 200
      and l_dev_d between 5 and 200
      and l_mid_d between 5 and 200
      and l_late_d between 5 and 200
      and l_ini_d + l_dev_d + l_mid_d + l_late_d <= 366
    )
  );

-- 열 단위 권한에 더한다 (넣고 고치기는 지금처럼 동의한 회원만 — v2.3 정책 그대로)
grant insert (irrigation_method, zr_m, l_ini_d, l_dev_d, l_mid_d, l_late_d) on public.farms to authenticated;
grant update (irrigation_method, zr_m, l_ini_d, l_dev_d, l_mid_d, l_late_d) on public.farms to authenticated;

-- ---------------------------------------------------------------------------
-- 4. public.farm_seasons — 작기 시작일 두 겹. 회원은 여전히 직접 못 쓴다(함수 두 개로만).
-- ---------------------------------------------------------------------------
alter table public.farm_seasons add column if not exists start_source text not null default 'default';
alter table public.farm_seasons drop constraint if exists farm_seasons_start_source_check;
alter table public.farm_seasons
  add constraint farm_seasons_start_source_check
  check (start_source in ('default', 'yearly', 'this_year'));
alter table public.farm_seasons add column if not exists start_confirmed_at timestamptz;

update public.farm_seasons s
  set start_source = 'yearly'
  from public.farms f
  where f.farm_id = s.farm_id and f.season_start_source = 'user' and s.start_source = 'default';

-- ---------------------------------------------------------------------------
-- 5. public.farm_calc_status — 물 계수 곡선 (croplib-dp 가 서버 키로 매 회차 덮어쓴다. 회원은 자기 줄 읽기 — 권한 그대로)
-- ---------------------------------------------------------------------------
alter table public.farm_calc_status add column if not exists kc_ini numeric;
alter table public.farm_calc_status add column if not exists kc_mid_adj numeric;
alter table public.farm_calc_status add column if not exists kc_end_adj numeric;
alter table public.farm_calc_status add column if not exists kc_mid_final boolean;
alter table public.farm_calc_status add column if not exists kc_end_final boolean;
alter table public.farm_calc_status add column if not exists dev_start date;
alter table public.farm_calc_status add column if not exists mid_start date;
alter table public.farm_calc_status add column if not exists late_start date;
alter table public.farm_calc_status add column if not exists season_end date;
alter table public.farm_calc_status add column if not exists curve_farm_season_id uuid;
alter table public.farm_calc_status drop constraint if exists farm_calc_status_curve_season_fk;
alter table public.farm_calc_status
  add constraint farm_calc_status_curve_season_fk
  foreign key (curve_farm_season_id) references public.farm_seasons (farm_season_id) on delete set null;

-- ---------------------------------------------------------------------------
-- 6. 설정 값 검사 — 작목 · 작형이 바뀌면 먼저 단계 일수 · 뿌리 깊이를 비운다(같은 저장에 보낸 새 값도 비움)
-- ---------------------------------------------------------------------------
create or replace function public.farms_check_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s         public.crop_seasons;
  v_changed boolean := false;
begin
  if tg_op = 'UPDATE' then
    if (old.crop_id, old.season_type_id) is distinct from (new.crop_id, new.season_type_id) then
      v_changed := true;
      new.l_ini_d := null;
      new.l_dev_d := null;
      new.l_mid_d := null;
      new.l_late_d := null;
      new.zr_m := null;
    end if;
  end if;

  if new.crop_id = 'common' and num_nonnulls(new.l_ini_d, new.l_dev_d, new.l_mid_d, new.l_late_d, new.zr_m) > 0 then
    raise exception 'common crop has no stage or root settings' using errcode = '23514';
  end if;

  -- 작목과 안 맞는 작형은 여기서 보지 않는다 (합성 외래키 farms_season_type_fk 가 거절한다)
  select * into s from public.crop_seasons
   where season_type_id = new.season_type_id and crop_id = new.crop_id;
  if found then
    if (tg_op = 'INSERT' or v_changed) and not s.farm_open then
      raise exception 'season type is not open for farms' using errcode = '23514';
    end if;
    if num_nonnulls(new.l_ini_d, new.l_dev_d, new.l_mid_d, new.l_late_d) > 0 and not s.stage_editable then
      raise exception 'stage days are not editable for this season type' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.farms_check_settings() from public, anon, authenticated, service_role;

drop trigger if exists farms_check_settings on public.farms;
create trigger farms_check_settings
  before insert or update on public.farms
  for each row execute function public.farms_check_settings();

-- ---------------------------------------------------------------------------
-- 7. sync_farm_seasons_at — v2.1 에 더한 것
--    · 작기 길이: 농장의 단계 일수 넷이 있으면 그 합
--    · 규칙 다: 작목 · 작형 · 재배 방식이 같고, 지금 줄이 올해만이거나 (이미 시작했고 시작 월-일이 매년 날짜와 같으면)
--      시작일을 두고 끝만 바꾼다. 일수를 줄여 끝이 지나면 지난 줄이 되고 다음 sync 가 다음 줄을 만든다
--    · 규칙 가: 가장 최근 지난 줄이 같은 작형의 올해만이고 새 창이 그 줄과 겹치면 다음 해 창.
--      지금 줄이 없을 때뿐 아니라, 이미 만든 다음 해 줄이 있을 때(다음 날 sync)도 같아야 한다 — 아니면 그날의 창이
--      올해로 되돌아가 끝난 올해 줄을 지운다
--    · 규칙 라: 시작일 · 작목 · 작형 · 재배 방식이 바뀌면 start_confirmed_at 을 비운다
--    · 새 줄의 start_source 는 farms.season_start_source 에 따라 default / yearly
-- ---------------------------------------------------------------------------
create or replace function public.sync_farm_seasons_at(p_farm_id uuid, p_today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f        public.farms;
  s        public.crop_seasons;
  w        record;
  cur      public.farm_seasons;
  last     public.farm_seasons;
  v_len    int;
  v_start  date;
  v_end    date;
  v_unset  boolean;
  v_source text;
  v_keep   boolean := false;
begin
  select * into f from public.farms where farm_id = p_farm_id;
  if not found then
    return;
  end if;

  -- 작물 공통: 줄을 만들지 않는다. 지금 · 앞으로 올 줄(끝이 오늘 이후)은 지우고, 지난 줄은 남긴다.
  if f.season_type_id is null then
    delete from public.farm_seasons where farm_id = p_farm_id and end_date >= p_today;
    return;
  end if;

  select * into s from public.crop_seasons where season_type_id = f.season_type_id;
  if s.l_ini_d is null or s.l_dev_d is null or s.l_mid_d is null or s.l_late_d is null then
    raise exception 'season values are not ready' using errcode = '23514';
  end if;
  if f.l_ini_d is not null then
    v_len := f.l_ini_d + f.l_dev_d + f.l_mid_d + f.l_late_d;
  else
    v_len := s.l_ini_d + s.l_dev_d + s.l_mid_d + s.l_late_d;
  end if;
  -- season_end_mmdd 는 끝 계산에 쓰지 않는다 (1/1 에는 화면이 받지 않는다. 값이 있을 때의 규칙은 나중 판)
  v_source := case when f.season_start_source = 'user' then 'yearly' else 'default' end;

  cur := public.farm_current_season(p_farm_id, p_today);

  if cur.farm_season_id is not null
     and (cur.crop_id, cur.season_type_id, cur.kc_set_id) is not distinct from (f.crop_id, f.season_type_id, f.kc_set_id) then
    v_keep := cur.start_source = 'this_year'
      or (cur.start_date <= p_today and to_char(cur.start_date, 'MM-DD') = coalesce(f.season_start_mmdd, '01-01'));
  end if;

  if v_keep then
    v_start := cur.start_date;
    if cur.start_source = 'this_year' then
      v_source := 'this_year';
      v_unset := false;
    else
      v_unset := f.season_start_mmdd is null;
    end if;
  else
    select * into w from public.farm_season_window(f.season_start_mmdd, v_len, p_today);
    v_start := w.start_date;
    v_unset := w.start_unset;
    select * into last from public.farm_seasons
     where farm_id = p_farm_id and end_date < p_today
     order by end_date desc
     limit 1;
    while last.start_source = 'this_year' and last.season_type_id = f.season_type_id and last.end_date >= v_start loop
      v_start := (v_start + interval '1 year')::date;
    end loop;
  end if;
  v_end := v_start + v_len - 1;

  -- 지금 줄 말고 끝이 오늘 이후인 다른 줄은 있을 수 없다. 혹시 있으면 지운다.
  delete from public.farm_seasons
   where farm_id = p_farm_id and end_date >= p_today
     and (cur.farm_season_id is null or farm_season_id <> cur.farm_season_id);

  -- 지난 줄이 새 줄과 겹치면 지난 줄의 끝을 새 줄 시작 전날로 자른다. 통째로 새 줄 안에 들어가면 지운다.
  delete from public.farm_seasons
   where farm_id = p_farm_id and end_date < p_today and start_date >= v_start;
  update public.farm_seasons
     set end_date = v_start - 1
   where farm_id = p_farm_id and end_date < p_today
     and start_date < v_start and end_date >= v_start;

  if cur.farm_season_id is not null then
    update public.farm_seasons
       set crop_id = f.crop_id,
           season_type_id = f.season_type_id,
           kc_set_id = f.kc_set_id,
           start_date = v_start,
           end_date = v_end,
           start_unset = v_unset,
           start_source = v_source,
           start_confirmed_at = case
             when (crop_id, season_type_id, kc_set_id, start_date)
                  is distinct from (f.crop_id, f.season_type_id, f.kc_set_id, v_start) then null
             else start_confirmed_at
           end
     where farm_season_id = cur.farm_season_id
       and (crop_id, season_type_id, kc_set_id, start_date, end_date, start_unset, start_source)
           is distinct from
           (f.crop_id, f.season_type_id, f.kc_set_id, v_start, v_end, v_unset, v_source);
  else
    insert into public.farm_seasons (farm_id, crop_id, season_type_id, kc_set_id, start_date, end_date, start_unset, start_source)
    values (p_farm_id, f.crop_id, f.season_type_id, f.kc_set_id, v_start, v_end, v_unset, v_source);
  end if;
end;
$$;

revoke all on function public.sync_farm_seasons_at(uuid, date) from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. 다시 계산 — 기존 트리거에 새 칸을 붙인다
-- ---------------------------------------------------------------------------
-- 작물 설정 · 단계 일수. 단계 일수는 합이 같으면 작기 줄 날짜가 안 바뀌어 farm_seasons_touch 가 깨우지 않으므로 여기서 직접 요청한다.
create or replace function public.farms_after_update_crop()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cur public.farm_seasons;
begin
  -- "매년 이 날"을 고치면 지금 줄의 올해만은 풀린다 (날짜가 실제로 바뀔 때만)
  if old.season_start_mmdd is distinct from new.season_start_mmdd then
    cur := public.farm_current_season(new.farm_id, public.kst_today());
    update public.farm_seasons
       set start_source = case when new.season_start_source = 'user' then 'yearly' else 'default' end
     where farm_season_id = cur.farm_season_id and start_source = 'this_year';
  end if;

  perform public.sync_farm_seasons_at(new.farm_id, public.kst_today());

  if (old.l_ini_d, old.l_dev_d, old.l_mid_d, old.l_late_d)
     is distinct from (new.l_ini_d, new.l_dev_d, new.l_mid_d, new.l_late_d) then
    cur := public.farm_current_season(new.farm_id, public.kst_today());
    if cur.farm_season_id is not null then
      perform public.touch_farm_calc(new.farm_id, cur.start_date);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.farms_after_update_crop() from public, anon, authenticated, service_role;

drop trigger if exists farms_after_update_crop on public.farms;
create trigger farms_after_update_crop
  after update of crop_id, season_type_id, kc_set_id, season_start_mmdd, season_start_source, season_end_mmdd,
                  l_ini_d, l_dev_d, l_mid_d, l_late_d on public.farms
  for each row
  when (
    old.crop_id is distinct from new.crop_id
    or old.season_type_id is distinct from new.season_type_id
    or old.kc_set_id is distinct from new.kc_set_id
    or old.season_start_mmdd is distinct from new.season_start_mmdd
    or old.season_start_source is distinct from new.season_start_source
    or old.season_end_mmdd is distinct from new.season_end_mmdd
    or old.l_ini_d is distinct from new.l_ini_d
    or old.l_dev_d is distinct from new.l_dev_d
    or old.l_mid_d is distinct from new.l_mid_d
    or old.l_late_d is distinct from new.l_late_d
  )
  execute function public.farms_after_update_crop();

-- 관수 방법 · 뿌리 깊이는 지점 · 토성 · 면적과 같은 길: 지금 작기 줄 시작일부터 다시 계산
drop trigger if exists farms_after_update_calc on public.farms;
create trigger farms_after_update_calc
  after update of stn_id, soil_code, irrigated_area_m2, irrigation_method, zr_m on public.farms
  for each row
  when (
    old.stn_id is distinct from new.stn_id
    or old.soil_code is distinct from new.soil_code
    or old.irrigated_area_m2 is distinct from new.irrigated_area_m2
    or old.irrigation_method is distinct from new.irrigation_method
    or old.zr_m is distinct from new.zr_m
  )
  execute function public.farms_after_update_calc();

-- ---------------------------------------------------------------------------
-- 9. 올해만 시작일 · 확인. 1/1 에는 회원 1명 = 농장 1개라 농장 id 를 받지 않는다 (남의 농장을 넣을 길이 없다).
--    오류 코드와 문구는 화면이 읽는 값이다 (docs/DATA_CONTRACT.md).
-- ---------------------------------------------------------------------------
create or replace function public.set_this_season_start(p_start date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_today    date := public.kst_today();
  f          public.farms;
  s          public.crop_seasons;
  cur        public.farm_seasons;
  v_mmdd     text;
  v_anchor   date;
  v_prev_end date;
  v_end      date;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.member_has_consented() then
    raise exception 'consent required' using errcode = '42501';
  end if;
  select * into f from public.farms where user_id = v_uid for update;
  if not found then
    raise exception 'no farm' using errcode = 'P0002';
  end if;
  cur := public.farm_current_season(f.farm_id, v_today);
  if cur.farm_season_id is null then
    raise exception 'no current season' using errcode = 'P0002';
  end if;
  if p_start is null then
    raise exception 'start date required' using errcode = '22023';
  end if;

  -- 규칙 마: ±60일의 기준 = 작형 기본 시작일(비면 농장의 매년 날짜)을 지금 줄 시작일에서 가장 가까운 해의 날짜로
  select * into s from public.crop_seasons where season_type_id = cur.season_type_id;
  v_mmdd := coalesce(s.start_mmdd, f.season_start_mmdd);
  if v_mmdd is null then
    raise exception 'start date out of range' using errcode = '22023';
  end if;
  select t.d into v_anchor
  from (
    select make_date(extract(year from cur.start_date)::int + y.n, substr(v_mmdd, 1, 2)::int, substr(v_mmdd, 4, 2)::int) as d
    from (values (-1), (0), (1)) as y (n)
  ) t
  order by abs(t.d - cur.start_date)
  limit 1;
  if abs(p_start - v_anchor) > 60 then
    raise exception 'start date out of range' using errcode = '22023';
  end if;

  select max(x.end_date) into v_prev_end
  from public.farm_seasons x
  where x.farm_id = f.farm_id and x.farm_season_id <> cur.farm_season_id;
  if p_start <= v_prev_end then
    raise exception 'start date overlaps previous season' using errcode = '22023';
  end if;

  if f.l_ini_d is not null then
    v_end := p_start + (f.l_ini_d + f.l_dev_d + f.l_mid_d + f.l_late_d) - 1;
  else
    v_end := p_start + (s.l_ini_d + s.l_dev_d + s.l_mid_d + s.l_late_d) - 1;
  end if;
  -- 규칙 나: 저장하자마자 지난 작기가 되는 날짜는 거절
  if v_end < v_today then
    raise exception 'season would already be over' using errcode = '22023';
  end if;

  -- 다시 계산 요청(옛 · 새 시작일 중 이른 날부터)은 farm_seasons_touch 트리거가 한다
  update public.farm_seasons
     set start_date = p_start,
         end_date = v_end,
         start_unset = false,
         start_source = 'this_year',
         start_confirmed_at = now()
   where farm_season_id = cur.farm_season_id;
end;
$$;

revoke all on function public.set_this_season_start(date) from public, anon, authenticated, service_role;
grant execute on function public.set_this_season_start(date) to authenticated;

create or replace function public.confirm_this_season_start()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  f     public.farms;
  cur   public.farm_seasons;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if not public.member_has_consented() then
    raise exception 'consent required' using errcode = '42501';
  end if;
  select * into f from public.farms where user_id = v_uid for update;
  if not found then
    raise exception 'no farm' using errcode = 'P0002';
  end if;
  cur := public.farm_current_season(f.farm_id, public.kst_today());
  if cur.farm_season_id is null then
    raise exception 'no current season' using errcode = 'P0002';
  end if;
  update public.farm_seasons set start_confirmed_at = now() where farm_season_id = cur.farm_season_id;
end;
$$;

revoke all on function public.confirm_this_season_start() from public, anon, authenticated, service_role;
grant execute on function public.confirm_this_season_start() to authenticated;

-- ---------------------------------------------------------------------------
-- 10. 기본 단계 일수 (국내 생육 시기, 사용자 결정 2026-11-27) 와 2027 공개 계산 조건의 작기 끝.
--     2026 줄은 그대로. 회원 농장은 아직 0개다.
-- ---------------------------------------------------------------------------
update public.crop_seasons
  set l_ini_d = 30, l_dev_d = 60, l_mid_d = 90, l_late_d = 45,
      source = 'cropwater crops_library.csv. 단계 일수: 사공동훈 외 2013 · 권헌중·사공동훈 2022 · 국립원예특작과학원 만개 평균 2018–2024, 사용자 결정 2026-11-27'
  where season_type_id = 'apple-main';
update public.crop_seasons
  set l_ini_d = 15, l_dev_d = 20, l_mid_d = 15, l_late_d = 10,
      source = 'cropwater crops_library.csv. 태백 실측으로 보정 예정. 단계 일수: 이경도 외 2017 · 김진희·윤진일 2015, 사용자 결정 2026-11-27'
  where season_type_id = 'kimchi_cabbage-summer';

update public.scenarios set season_end = '2027-11-11'
  where season_type_id = 'apple-main' and season_year = 2027;
update public.scenarios set season_end = '2027-08-29'
  where season_type_id = 'kimchi_cabbage-summer' and season_year = 2027;
