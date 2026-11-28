-- 되돌리기 SQL: 내 농장 설정 칸 (데이터 계약 v2.6, 이슈 #215, 결정 0076)
--
-- 실행하지 않는다. 마이그레이션 20261128000000_data_contract_v2_6_farm_settings.sql 을 되돌리고 싶을 때만 SQL Editor 에서 Run.
-- 여러 번 실행해도 오류가 나지 않는다.
-- farms 에 줄이 있으면 회원이 고른 설정이 사라지므로 오류로 멈추고 아무것도 바꾸지 않는다.
-- 순서: 새 함수 · 트리거 → 트리거 · sync 함수를 v2.1 모습으로 (새 칸을 읽지 않게 먼저) → 칸 · 표 지우기 → 일수 · 2027 끝을 옛 값으로.

do $pre$
declare
  n bigint;
begin
  select count(*) into n from public.farms;
  if n > 0 then
    raise exception '되돌리기를 멈춥니다: farms 에 줄이 % 개 있습니다. 회원이 고른 설정이 사라지므로 지우지 않습니다.', n;
  end if;
end
$pre$;

drop function if exists public.set_this_season_start(date);
drop function if exists public.confirm_this_season_start();
drop trigger if exists farms_check_settings on public.farms;
drop function if exists public.farms_check_settings();

-- v2.1 의 sync_farm_seasons_at
create or replace function public.sync_farm_seasons_at(p_farm_id uuid, p_today date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  f      public.farms;
  s      public.crop_seasons;
  w      record;
  cur    public.farm_seasons;
  v_len  int;
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
  v_len := s.l_ini_d + s.l_dev_d + s.l_mid_d + s.l_late_d;
  -- season_end_mmdd 는 끝 계산에 쓰지 않는다 (1/1 에는 화면이 받지 않는다. 값이 있을 때의 규칙은 나중 판)

  select * into w from public.farm_season_window(f.season_start_mmdd, v_len, p_today);
  cur := public.farm_current_season(p_farm_id, p_today);

  -- 지금 줄 말고 끝이 오늘 이후인 다른 줄은 있을 수 없다. 혹시 있으면 지운다.
  delete from public.farm_seasons
   where farm_id = p_farm_id and end_date >= p_today
     and (cur.farm_season_id is null or farm_season_id <> cur.farm_season_id);

  -- 지난 줄이 새 줄과 겹치면 지난 줄의 끝을 새 줄 시작 전날로 자른다. 통째로 새 줄 안에 들어가면 지운다.
  delete from public.farm_seasons
   where farm_id = p_farm_id and end_date < p_today and start_date >= w.start_date;
  update public.farm_seasons
     set end_date = w.start_date - 1
   where farm_id = p_farm_id and end_date < p_today
     and start_date < w.start_date and end_date >= w.start_date;

  if cur.farm_season_id is not null then
    update public.farm_seasons
       set crop_id = f.crop_id,
           season_type_id = f.season_type_id,
           kc_set_id = f.kc_set_id,
           start_date = w.start_date,
           end_date = w.end_date,
           start_unset = w.start_unset
     where farm_season_id = cur.farm_season_id
       and (crop_id, season_type_id, kc_set_id, start_date, end_date, start_unset)
           is distinct from
           (f.crop_id, f.season_type_id, f.kc_set_id, w.start_date, w.end_date, w.start_unset);
  else
    insert into public.farm_seasons (farm_id, crop_id, season_type_id, kc_set_id, start_date, end_date, start_unset)
    values (p_farm_id, f.crop_id, f.season_type_id, f.kc_set_id, w.start_date, w.end_date, w.start_unset);
  end if;
end;
$$;

revoke all on function public.sync_farm_seasons_at(uuid, date) from public, anon, authenticated, service_role;

-- v2.1 의 두 고치기 트리거
create or replace function public.farms_after_update_crop()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_farm_seasons_at(new.farm_id, public.kst_today());
  return new;
end;
$$;

revoke all on function public.farms_after_update_crop() from public, anon, authenticated, service_role;

drop trigger if exists farms_after_update_crop on public.farms;
create trigger farms_after_update_crop
  after update of crop_id, season_type_id, kc_set_id, season_start_mmdd, season_end_mmdd on public.farms
  for each row
  when (
    old.crop_id is distinct from new.crop_id
    or old.season_type_id is distinct from new.season_type_id
    or old.kc_set_id is distinct from new.kc_set_id
    or old.season_start_mmdd is distinct from new.season_start_mmdd
    or old.season_end_mmdd is distinct from new.season_end_mmdd
  )
  execute function public.farms_after_update_crop();

drop trigger if exists farms_after_update_calc on public.farms;
create trigger farms_after_update_calc
  after update of stn_id, soil_code, irrigated_area_m2 on public.farms
  for each row
  when (
    old.stn_id is distinct from new.stn_id
    or old.soil_code is distinct from new.soil_code
    or old.irrigated_area_m2 is distinct from new.irrigated_area_m2
  )
  execute function public.farms_after_update_calc();

alter table public.farms drop constraint if exists farms_irrigation_method_fk;
alter table public.farms drop constraint if exists farms_zr_m_choice;
alter table public.farms drop constraint if exists farms_stage_days_rule;
alter table public.farms drop column if exists irrigation_method;
alter table public.farms drop column if exists zr_m;
alter table public.farms drop column if exists l_ini_d;
alter table public.farms drop column if exists l_dev_d;
alter table public.farms drop column if exists l_mid_d;
alter table public.farms drop column if exists l_late_d;

alter table public.farm_calc_status drop constraint if exists farm_calc_status_curve_season_fk;
alter table public.farm_calc_status drop column if exists kc_ini;
alter table public.farm_calc_status drop column if exists kc_mid_adj;
alter table public.farm_calc_status drop column if exists kc_end_adj;
alter table public.farm_calc_status drop column if exists kc_mid_final;
alter table public.farm_calc_status drop column if exists kc_end_final;
alter table public.farm_calc_status drop column if exists dev_start;
alter table public.farm_calc_status drop column if exists mid_start;
alter table public.farm_calc_status drop column if exists late_start;
alter table public.farm_calc_status drop column if exists season_end;
alter table public.farm_calc_status drop column if exists curve_farm_season_id;

alter table public.farm_seasons drop constraint if exists farm_seasons_start_source_check;
alter table public.farm_seasons drop column if exists start_source;
alter table public.farm_seasons drop column if exists start_confirmed_at;

alter table public.crop_seasons drop constraint if exists crop_seasons_stage_labels_len;
alter table public.crop_seasons drop column if exists stage_labels;
alter table public.crop_seasons drop column if exists start_event_label;
alter table public.crop_seasons drop column if exists stage_editable;
alter table public.crop_seasons drop column if exists farm_open;

drop table if exists public.irrigation_methods;

update public.crop_seasons
  set l_ini_d = 20, l_dev_d = 70, l_mid_d = 90, l_late_d = 30, source = 'cropwater crops_library.csv'
  where season_type_id = 'apple-main';
update public.crop_seasons
  set l_ini_d = 25, l_dev_d = 30, l_mid_d = 25, l_late_d = 10, source = 'cropwater crops_library.csv. 태백 실측으로 보정 예정'
  where season_type_id = 'kimchi_cabbage-summer';

update public.scenarios set season_end = '2027-10-27'
  where season_type_id = 'apple-main' and season_year = 2027;
update public.scenarios set season_end = '2027-09-28'
  where season_type_id = 'kimchi_cabbage-summer' and season_year = 2027;
