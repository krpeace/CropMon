-- 확인 SQL: 내 농장 설정 칸 (데이터 계약 v2.6, 이슈 #215, 결정 0076)
--
-- 언제: 마이그레이션 20261128000000_data_contract_v2_6_farm_settings.sql 을 Run 한 뒤.
-- 방법: SQL Editor 에 이 파일 내용을 모두 붙여 넣고 Run. 읽기만 한다 (아무것도 바꾸지 않는다).
-- 결과: 한 줄. all_ok = true 면 통과. false 이면 false 인 칸 이름을 알려 주세요.
-- 동작(거절 · 비우기 · 작기 줄 규칙) 시험은 이어서 d1_2_farms_check.sql 을 Run 한다.

with fns as (
  select n.name, p.oid, p.prosecdef, p.proconfig
  from (values ('public.set_this_season_start(date)'), ('public.confirm_this_season_start()')) as n (name)
  join pg_catalog.pg_proc p on p.oid = to_regprocedure(n.name)
),
c as (
  select
    (select count(*) = 3
        and count(*) filter (where is_default) = 1
        and bool_and((method_code, name_ko, efficiency, is_default) in
              (('drip', '점적관수', 0.95, true), ('sprinkler', '스프링클러', 0.75, false), ('furrow', '도랑관수', 0.40, false)))
       from public.irrigation_methods) as methods_rows,
    (select relrowsecurity from pg_catalog.pg_class where oid = to_regclass('public.irrigation_methods'))
      and exists (select 1 from pg_catalog.pg_policies where schemaname = 'public' and tablename = 'irrigation_methods' and cmd = 'SELECT')
      and has_table_privilege('anon', 'public.irrigation_methods', 'select')
      and not has_table_privilege('anon', 'public.irrigation_methods', 'insert, update, delete')
      and not has_table_privilege('authenticated', 'public.irrigation_methods', 'insert, update, delete') as methods_read_only,
    (select count(*) = 22 from information_schema.columns
      where table_schema = 'public' and (
        (table_name = 'farms' and column_name in ('irrigation_method', 'zr_m', 'l_ini_d', 'l_dev_d', 'l_mid_d', 'l_late_d'))
        or (table_name = 'crop_seasons' and column_name in ('stage_labels', 'start_event_label', 'stage_editable', 'farm_open'))
        or (table_name = 'farm_seasons' and column_name in ('start_source', 'start_confirmed_at'))
        or (table_name = 'farm_calc_status' and column_name in ('kc_ini', 'kc_mid_adj', 'kc_end_adj', 'kc_mid_final', 'kc_end_final',
              'dev_start', 'mid_start', 'late_start', 'season_end', 'curve_farm_season_id'))
      )) as new_columns,
    (select count(*) = 6 from pg_catalog.pg_constraint
      where conname in ('farms_zr_m_choice', 'farms_stage_days_rule', 'farms_irrigation_method_fk',
                        'farm_calc_status_curve_season_fk', 'farm_seasons_start_source_check', 'crop_seasons_stage_labels_len')) as constraints_exist,
    (select bool_and(has_column_privilege('authenticated', 'public.farms', col, 'insert')
                 and has_column_privilege('authenticated', 'public.farms', col, 'update')
                 and not has_column_privilege('anon', 'public.farms', col, 'select'))
       from unnest(array['irrigation_method', 'zr_m', 'l_ini_d', 'l_dev_d', 'l_mid_d', 'l_late_d']) as col) as farm_column_grants,
    not has_table_privilege('authenticated', 'public.farm_calc_status', 'insert, update, delete')
      and not has_table_privilege('authenticated', 'public.farm_seasons', 'insert, update, delete') as members_cannot_write_results,
    (select count(*) = 4
        and bool_and(cardinality(stage_labels) = 4 and start_event_label is not null
              and farm_open = (crop_id <> 'grape')
              and stage_editable = (crop_id <> 'kimchi_cabbage'))
       from public.crop_seasons
      where season_type_id in ('apple-main', 'grape-rainshelter', 'grape-heated', 'kimchi_cabbage-summer')) as season_dictionary,
    (select count(*) = 2 from public.crop_seasons
      where (season_type_id = 'apple-main' and (l_ini_d, l_dev_d, l_mid_d, l_late_d) = (30, 60, 90, 45) and start_mmdd = '04-01')
         or (season_type_id = 'kimchi_cabbage-summer' and (l_ini_d, l_dev_d, l_mid_d, l_late_d) = (15, 20, 15, 10) and start_mmdd = '07-01')) as stage_days,
    (select count(*) > 0 and bool_and(season_end = date '2027-11-11') from public.scenarios
      where season_type_id = 'apple-main' and season_year = 2027)
      and (select count(*) > 0 and bool_and(season_end = date '2027-08-29') from public.scenarios
      where season_type_id = 'kimchi_cabbage-summer' and season_year = 2027) as scenarios_2027,
    (select count(*) > 0 and bool_and(season_end = case season_type_id when 'apple-main' then date '2026-10-27' else date '2026-09-28' end)
       from public.scenarios
      where season_type_id in ('apple-main', 'kimchi_cabbage-summer') and season_year = 2026) as scenarios_2026_unchanged,
    exists (select 1 from pg_catalog.pg_trigger
             where tgname = 'farms_check_settings' and tgrelid = to_regclass('public.farms') and tgenabled <> 'D')
      and exists (select 1 from pg_catalog.pg_trigger t
             where t.tgname = 'farms_after_update_crop' and t.tgenabled <> 'D' and pg_get_triggerdef(t.oid) like '%l_late_d%')
      and exists (select 1 from pg_catalog.pg_trigger t
             where t.tgname = 'farms_after_update_calc' and t.tgenabled <> 'D' and pg_get_triggerdef(t.oid) like '%zr_m%') as triggers_exist,
    (select count(*) = 2
        and bool_and(prosecdef and 'search_path=""' = any (proconfig)
              and not has_function_privilege('anon', oid, 'execute')
              and has_function_privilege('authenticated', oid, 'execute')
              and not has_function_privilege('service_role', oid, 'execute'))
       from fns) as season_functions,
    not has_function_privilege('authenticated', 'public.sync_farm_seasons_at(uuid, date)', 'execute')
      and not has_function_privilege('service_role', 'public.sync_farm_seasons_at(uuid, date)', 'execute')
      and not has_function_privilege('authenticated', 'public.farms_check_settings()', 'execute') as inner_functions_blocked
)
select
  c.*,
  coalesce(
    methods_rows and methods_read_only and new_columns and constraints_exist and farm_column_grants
    and members_cannot_write_results and season_dictionary and stage_days and scenarios_2027
    and scenarios_2026_unchanged and triggers_exist and season_functions and inner_functions_blocked,
    false
  ) as all_ok
from c;
