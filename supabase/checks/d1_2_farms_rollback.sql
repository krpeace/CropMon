-- 되돌리기 SQL: 농장 DB + 사전 (데이터 계약 v2.1, 이슈 #184, 결정 0062)
--
-- 실행하지 않는다. 마이그레이션 20261120000000 · 20261120010000 · 20261120020000 이 만든 것을 지우고 싶을 때만
-- (예: 무료 플랜에서 백업 대신 쓰는 되돌리기) SQL Editor 에서 Run. 여러 번 실행해도 오류가 나지 않는다.
--
-- 먼저 확인한다 (하나라도 걸리면 오류로 멈추고 아무것도 지우지 않는다):
--   · farms 줄이 0 인지 (회원제 스위치가 꺼져 있어 지금은 0 이어야 한다. 줄이 있으면 회원의 농장 · 기록이 사라지므로 멈춘다)
--   · 세 공개 표(water_balance_daily · water_outlook · water_outlook_summary)에 etc_only 줄이 0 인지
--     (check 를 etc_only 없는 옛 모양으로 되돌리려면 그 줄이 없어야 한다)
--   · 포도 계산 조건에 딸린 결과 줄 · 포도 적산온도 줄이 0 인지 (있으면 포도 줄을 지울 수 없다)
-- 지우는 순서: 보충 예약 → 표(트리거 포함, 줄 모양을 돌려주는 함수를 먼저) → 함수 → 포도 줄 → 색인 되돌리기 → 사전 값 · 열 → check 되돌리기.
--
-- 남기는 것: btree_gist 확장(다른 곳에서 쓸 수 있고 해롭지 않다), public.set_updated_at() (다른 표가 쓴다).
-- auth.users · members 는 건드리지 않는다.

-- ---------------------------------------------------------------------------
-- 0. 먼저 확인
-- ---------------------------------------------------------------------------
do $pre$
declare
  n bigint;
begin
  if to_regclass('public.farms') is not null then
    execute 'select count(*) from public.farms' into n;
    if n > 0 then
      raise exception '되돌리기를 멈춥니다: farms 에 줄이 % 개 있습니다. 회원의 농장 · 기록이 사라지므로 지우지 않습니다.', n;
    end if;
  end if;

  select
    (select count(*) from public.water_balance_daily where status = 'etc_only')
    + (select count(*) from public.water_outlook where status = 'etc_only')
    + (select count(*) from public.water_outlook_summary where status_start = 'etc_only')
  into n;
  if n > 0 then
    raise exception '되돌리기를 멈춥니다: 공개 표에 etc_only 줄이 % 개 있습니다. check 를 옛 모양으로 되돌릴 수 없습니다.', n;
  end if;

  select
    (select count(*) from public.water_balance_daily b join public.scenarios s on s.scenario_id = b.scenario_id where s.crop_id = 'grape')
    + (select count(*) from public.water_outlook o join public.scenarios s on s.scenario_id = o.scenario_id where s.crop_id = 'grape')
    + (select count(*) from public.water_outlook_summary m join public.scenarios s on s.scenario_id = m.scenario_id where s.crop_id = 'grape')
    + (select count(*) from public.heat_daily where crop_id = 'grape')
  into n;
  if n > 0 then
    raise exception '되돌리기를 멈춥니다: 포도에 딸린 결과 · 적산온도 줄이 % 개 있습니다. 포도 줄을 지울 수 없습니다.', n;
  end if;
end
$pre$;

-- ---------------------------------------------------------------------------
-- 1. 매분 보충 예약 멈추기 (마이그레이션의 cron.schedule 과 짝)
-- ---------------------------------------------------------------------------
select cron.unschedule(jobname) from cron.job where jobname = 'croplib-farm-calc-sweep';

-- ---------------------------------------------------------------------------
-- 2. 표 (딸린 트리거 · 색인 · 정책이 함께 지워진다). 자식 → 부모 순서.
--    farm_current_season() 은 farm_seasons 의 줄 모양을 돌려주므로 표보다 먼저 지운다.
-- ---------------------------------------------------------------------------
drop function if exists public.farm_current_season(uuid, date);

drop table if exists public.farm_water_outlook_summary;
drop table if exists public.farm_water_outlook;
drop table if exists public.farm_water_daily;
drop table if exists public.farm_calc_status;
drop table if exists public.irrigation_logs;
drop table if exists public.farm_seasons;
drop table if exists public.farms;
drop table if exists ops.farm_calc_wake;

-- ---------------------------------------------------------------------------
-- 3. 함수
-- ---------------------------------------------------------------------------
drop function if exists public.farms_after_insert();
drop function if exists public.farms_after_update_crop();
drop function if exists public.farms_after_update_calc();
drop function if exists public.farm_seasons_touch();
drop function if exists public.irrigation_logs_check_date();
drop function if exists public.irrigation_logs_touch();
drop function if exists public.touch_farm_calc(uuid, date);
drop function if exists public.sync_farm_seasons(uuid);
drop function if exists public.sync_farm_seasons_at(uuid, date);
drop function if exists public.farm_season_window(text, int, date);
drop function if exists ops.farm_calc_sweep();
drop function if exists ops.farm_calc_try_wake(boolean);
drop function if exists ops.farm_calc_wake_due(timestamptz, timestamptz, boolean, boolean);

-- ---------------------------------------------------------------------------
-- 4. 포도 줄 (계산 조건 → 재배 방식 → 작형 → 작목 순서)
-- ---------------------------------------------------------------------------
delete from public.scenarios where crop_id = 'grape';
delete from public.crop_kc_sets where crop_id = 'grape';
delete from public.crop_seasons where crop_id = 'grape';
delete from public.crops where crop_id = 'grape';

-- ---------------------------------------------------------------------------
-- 5. 기본 조건 색인을 작목 기준(옛 모양)으로
-- ---------------------------------------------------------------------------
drop index if exists public.scenarios_one_default;
create unique index if not exists scenarios_one_default
  on public.scenarios (stn_id, crop_id, season_year)
  where is_default;

-- ---------------------------------------------------------------------------
-- 6. 사전 값 되돌리기 · 더한 열 · 합성 외래키용 색인 지우기
-- ---------------------------------------------------------------------------
update public.crops set t_base_c = 4 where crop_id = 'kimchi_cabbage';
update public.crop_seasons set name_ko = '여름배추(고랭지)' where season_type_id = 'kimchi_cabbage-summer';

alter table public.crops drop constraint if exists crops_gdd_stage_labels_len;
alter table public.crops drop column if exists gdd_stage_labels;
alter table public.crop_seasons drop column if exists cum_start_mmdd;
alter table public.crop_seasons drop column if exists is_protected;

drop index if exists public.crop_seasons_type_crop_key;
drop index if exists public.crop_kc_sets_kc_crop_key;

drop function if exists public.is_valid_mmdd(text);
drop function if exists public.kst_today();

-- ---------------------------------------------------------------------------
-- 7. 상태 check 를 etc_only 없는 옛 모양으로 (위 0 에서 etc_only 줄이 없음을 확인했다)
-- ---------------------------------------------------------------------------
alter table public.water_balance_daily drop constraint if exists water_balance_daily_status_check;
alter table public.water_balance_daily
  add constraint water_balance_daily_status_check
  check (status in ('need', 'caution', 'normal', 'wet', 'dormant'));

alter table public.water_outlook drop constraint if exists water_outlook_status_check;
alter table public.water_outlook
  add constraint water_outlook_status_check
  check (status in ('need', 'caution', 'normal', 'dormant'));

alter table public.water_outlook_summary drop constraint if exists water_outlook_summary_status_start_check;
alter table public.water_outlook_summary
  add constraint water_outlook_summary_status_start_check
  check (status_start in ('need', 'caution', 'normal', 'wet', 'dormant'));
