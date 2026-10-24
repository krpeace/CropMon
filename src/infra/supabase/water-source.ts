import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseClient } from "./client";

/**
 * 물 화면이 읽는 DB 자료 (데이터 계약 v1.3). 읽기만 한다. 공개 키(anon)로 읽고, 권한은 RLS 가 막는다.
 * 열은 필요한 것만 적는다. forecast_runs 의 raw_path·error 는 공개하지 않는 열이라 적으면 오류가 난다.
 */

export type KcSetRow = {
  kc_set_id: string;
  set_no: number;
  name_ko: string;
  note: string | null;
  is_default: boolean;
  sort_order: number;
};

export type ScenarioRow = {
  scenario_id: string;
  kc_set_id: string;
  taw_mm: number;
  raw_mm: number;
  season_start: string;
  season_end: string;
};

export type RunRow = {
  run_id: number;
  run_at: string;
  run_name: string;
  result: string;
  on_time: boolean;
  finished_at: string | null;
  src_run_at: string | null;
};

export type OutlookRow = {
  target_date: string;
  lead_day: number;
  etc_mm: number | null;
  etc_err_mm: number | null;
  rain_fcst_mm: number | null;
  pop_pct: number | null;
  rain_expected_mm: number | null;
  dr_center_mm: number | null;
  dr_early_mm: number | null;
  dr_late_mm: number | null;
  status: string;
};

export type SummaryRow = {
  horizon_days: number;
  start_date: string;
  dr_start_mm: number | null;
  status_start: string;
  need_center_in: number | null;
  need_early_in: number | null;
  need_late_in: number | null;
  advice_net_mm: number | null;
  advice_gross_mm: number | null;
  etc_sum_mm: number | null;
  etc_sum_err_mm: number | null;
  rain_sum_mm: number | null;
  rain_expected_sum_mm: number | null;
};

export type BalanceRow = {
  date: string;
  kc: number | null;
  eto_mm: number | null;
  etc_mm: number | null;
  rain_mm: number | null;
  dr_mm: number | null;
  status: string;
  filled: boolean;
};

/** 물 화면에 필요한 읽기. 서비스는 이 모양만 알고, 테스트에서는 가짜를 넣는다. */
export type WaterSource = {
  kcSets(cropId: string): Promise<KcSetRow[]>;
  scenarios(
    stnId: string,
    cropId: string,
    year: number,
  ): Promise<ScenarioRow[]>;
  /** 이 지점의 서버 수집(actions) 중 실패가 아닌 마지막 회차. */
  latestRun(stnId: string): Promise<RunRow | null>;
  outlook(runId: number, scenarioId: string): Promise<OutlookRow[]>;
  summary(runId: number, scenarioId: string): Promise<SummaryRow | null>;
  /** 작기 시작부터 그날까지의 관측 물수지, 날짜 순. */
  balance(scenarioId: string, until: string): Promise<BalanceRow[]>;
};

export const COLUMNS = {
  crop_kc_sets: "kc_set_id,set_no,name_ko,note,is_default,sort_order",
  scenarios: "scenario_id,kc_set_id,taw_mm,raw_mm,season_start,season_end",
  forecast_runs: "run_id,run_at,run_name,result,on_time,finished_at,src_run_at",
  water_outlook:
    "target_date,lead_day,etc_mm,etc_err_mm,rain_fcst_mm,pop_pct,rain_expected_mm,dr_center_mm,dr_early_mm,dr_late_mm,status",
  water_outlook_summary:
    "horizon_days,start_date,dr_start_mm,status_start,need_center_in,need_early_in,need_late_in,advice_net_mm,advice_gross_mm,etc_sum_mm,etc_sum_err_mm,rain_sum_mm,rain_expected_sum_mm",
  water_balance_daily: "date,kc,eto_mm,etc_mm,rain_mm,dr_mm,status,filled",
} as const;

/**
 * 한 번 읽기를 오래 기다리지 않는다 (DB가 멈춰도 화면은 "자료 없음"으로 뜬다).
 * 자동 재시도도 끈다: 켜 두면 DB에 닿지 못할 때 쪽 하나가 7초쯤 걸린다. 다시 읽기는 새로고침으로 한다.
 */
const TIMEOUT_MS = 8000;

type Result<T> = { data: T | null; error: { message: string } | null };

function unwrap<T>(table: string, r: Result<T>): T {
  if (r.error) throw new Error(`${table} 읽기 실패: ${r.error.message}`);
  return r.data as T;
}

/** numeric 열이 문자로 와도 수로 바꾼다. */
function nums<T extends object>(row: T, skip: readonly string[] = []): T {
  const out = { ...row } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    if (
      typeof v === "string" &&
      !skip.includes(k) &&
      /^-?\d+(\.\d+)?$/.test(v)
    ) {
      out[k] = Number(v);
    }
  }
  return out as T;
}

const TEXT = [
  "kc_set_id",
  "scenario_id",
  "name_ko",
  "note",
  "date",
  "target_date",
  "start_date",
  "season_start",
  "season_end",
];

export function createWaterSource(
  client: SupabaseClient = getSupabaseClient(),
): WaterSource {
  const signal = () => AbortSignal.timeout(TIMEOUT_MS);
  const many = async <T extends object>(
    table: string,
    r: PromiseLike<Result<T[]>>,
  ) => unwrap(table, await r).map((x) => nums(x, TEXT));
  const one = async <T extends object>(
    table: string,
    r: PromiseLike<Result<T>>,
  ) => {
    const row = unwrap(table, await r);
    return row ? nums(row, TEXT) : null;
  };

  return {
    kcSets: (cropId) =>
      many<KcSetRow>(
        "crop_kc_sets",
        client
          .from("crop_kc_sets")
          .select(COLUMNS.crop_kc_sets)
          .eq("crop_id", cropId)
          .order("sort_order")
          .retry(false)
          .abortSignal(signal()),
      ),
    scenarios: (stnId, cropId, year) =>
      many<ScenarioRow>(
        "scenarios",
        client
          .from("scenarios")
          .select(COLUMNS.scenarios)
          .eq("stn_id", stnId)
          .eq("crop_id", cropId)
          .eq("season_year", year)
          .retry(false)
          .abortSignal(signal()),
      ),
    latestRun: (stnId) =>
      one<RunRow>(
        "forecast_runs",
        client
          .from("forecast_runs")
          .select(COLUMNS.forecast_runs)
          .eq("stn_id", stnId)
          .eq("collector", "actions")
          .neq("result", "실패")
          .order("run_at", { ascending: false })
          .limit(1)
          .retry(false)
          .abortSignal(signal())
          .maybeSingle(),
      ),
    outlook: (runId, scenarioId) =>
      many<OutlookRow>(
        "water_outlook",
        client
          .from("water_outlook")
          .select(COLUMNS.water_outlook)
          .eq("run_id", runId)
          .eq("scenario_id", scenarioId)
          .order("lead_day")
          .retry(false)
          .abortSignal(signal()),
      ),
    summary: (runId, scenarioId) =>
      one<SummaryRow>(
        "water_outlook_summary",
        client
          .from("water_outlook_summary")
          .select(COLUMNS.water_outlook_summary)
          .eq("run_id", runId)
          .eq("scenario_id", scenarioId)
          .retry(false)
          .abortSignal(signal())
          .maybeSingle(),
      ),
    balance: (scenarioId, until) =>
      many<BalanceRow>(
        "water_balance_daily",
        client
          .from("water_balance_daily")
          .select(COLUMNS.water_balance_daily)
          .eq("scenario_id", scenarioId)
          .lte("date", until)
          .order("date")
          .limit(400)
          .retry(false)
          .abortSignal(signal()),
      ),
  };
}
