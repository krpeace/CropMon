import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseClient } from "./client";

/**
 * 지점 10곳의 오늘 물 판정을 한꺼번에 읽는다 (지역 칩 점 색, 종합 화면).
 * 읽기만 한다. 열은 필요한 것만 적는다 (forecast_runs 의 raw_path·error 는 공개하지 않는 열).
 */

export type DefaultScenarioRow = {
  scenario_id: string;
  stn_id: string;
  crop_id: string;
  raw_mm: number;
  taw_mm: number;
  season_start: string;
  season_end: string;
};
export type RunRefRow = {
  run_id: number;
  stn_id: string;
  run_at: string;
  run_name: string;
  finished_at: string | null;
};
export type SummaryStatusRow = {
  run_id: number;
  scenario_id: string;
  status_start: string;
  start_date: string;
  dr_start_mm: number | null;
  need_center_in: number | null;
};
export type BalanceStatusRow = {
  scenario_id: string;
  date: string;
  status: string;
  dr_mm: number | null;
  filled: boolean;
};
export type OutlookDayRow = {
  run_id: number;
  scenario_id: string;
  target_date: string;
  lead_day: number;
  status: string;
};
export type WeatherFetchRow = {
  stn_id: string;
  date: string;
  fetched_at: string;
};
export type SoilWaterStatusRow = {
  stn_id: string;
  soil_code: string;
  date: string;
  dr_mm: number | null;
  taw_mm: number;
  raw_mm: number;
  aw_pct: number | null;
  status: string | null;
  filled: boolean;
};

export type StatusSource = {
  defaultScenarios(year: number): Promise<DefaultScenarioRow[]>;
  /** since(KST 날짜) 이후 필요한 지점들의 수집 회차 (실패 제외, 새것부터). 1,000줄 넘으면 range 페이징. */
  recentRuns(since: string, stnIds: string[]): Promise<RunRefRow[]>;
  summaries(
    runIds: number[],
    scenarioIds: string[],
  ): Promise<SummaryStatusRow[]>;
  /** since 이후의 관측 물수지 판정 (회차가 없는 지점의 대신 값). 1,000줄 넘으면 range 페이징. */
  recentBalance(
    scenarioIds: string[],
    since: string,
  ): Promise<BalanceStatusRow[]>;
  /** 그 회차들의 날짜별 전망 판정 (전국 표 "앞으로 3일"). */
  outlookDays(
    runIds: number[],
    scenarioIds: string[],
  ): Promise<OutlookDayRow[]>;
  /** since 이후 지점별 ASOS 관측 받은 시각 (stnIds 지정 시 해당 지점들만). 1,000줄 넘으면 range 페이징. */
  recentWeather(since: string, stnIds?: string[]): Promise<WeatherFetchRow[]>;
  /** 지정한 지점들의 작물 공통 최신 토양 물 상태 (soil_water_latest 뷰, 지점·토성별 최신 1줄). 1,000줄 넘으면 range 페이징. */
  latestSoilWater(stnIds: string[]): Promise<SoilWaterStatusRow[]>;
};

const TIMEOUT_MS = 8000;
const PAGE_SIZE = 1000;
type Result<T> = { data: T | null; error: { message: string } | null };

const NUMERIC = ["raw_mm", "taw_mm", "dr_start_mm", "dr_mm", "aw_pct"];

/** numeric 열이 문자로 와도 수로 바꾼다. */
function nums<T>(data: T): T {
  if (!Array.isArray(data)) return data;
  return data.map((row: Record<string, unknown>) => {
    const out = { ...row };
    for (const k of NUMERIC) {
      if (typeof out[k] === "string") out[k] = Number(out[k]);
    }
    return out;
  }) as T;
}

async function read<T>(table: string, r: PromiseLike<Result<T>>): Promise<T> {
  const { data, error } = await r;
  if (error) throw new Error(`${table} 읽기 실패: ${error.message}`);
  return nums(data as T);
}

export function createStatusSource(
  client: SupabaseClient = getSupabaseClient(),
): StatusSource {
  const signal = () => AbortSignal.timeout(TIMEOUT_MS);
  return {
    defaultScenarios: (year) =>
      read<DefaultScenarioRow[]>(
        "scenarios",
        client
          .from("scenarios")
          .select(
            "scenario_id,stn_id,crop_id,raw_mm,taw_mm,season_start,season_end",
          )
          .eq("is_default", true)
          .eq("season_year", year)
          .retry(false)
          .abortSignal(signal()),
      ),
    recentRuns: async (since, stnIds) => {
      if (stnIds.length === 0) return [];
      const sinceKst = `${since}T00:00:00+09:00`;
      const all: RunRefRow[] = [];
      let from = 0;
      while (true) {
        const batch = await read<RunRefRow[]>(
          "forecast_runs",
          client
            .from("forecast_runs")
            .select("run_id,stn_id,run_at,run_name,finished_at")
            .eq("collector", "actions")
            .neq("result", "실패")
            .in("stn_id", stnIds)
            .gte("run_at", sinceKst)
            .order("run_at", { ascending: false })
            .order("run_id", { ascending: false })
            .range(from, from + PAGE_SIZE - 1)
            .retry(false)
            .abortSignal(signal()),
        );
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all;
    },
    summaries: (runIds, scenarioIds) =>
      read<SummaryStatusRow[]>(
        "water_outlook_summary",
        client
          .from("water_outlook_summary")
          .select(
            "run_id,scenario_id,status_start,start_date,dr_start_mm,need_center_in",
          )
          .in("run_id", runIds)
          .in("scenario_id", scenarioIds)
          .retry(false)
          .abortSignal(signal()),
      ),
    recentBalance: async (scenarioIds, since) => {
      if (scenarioIds.length === 0) return [];
      const all: BalanceStatusRow[] = [];
      let from = 0;
      while (true) {
        const batch = await read<BalanceStatusRow[]>(
          "water_balance_daily",
          client
            .from("water_balance_daily")
            .select("scenario_id,date,status,dr_mm,filled")
            .in("scenario_id", scenarioIds)
            .gte("date", since)
            .order("scenario_id", { ascending: true })
            .order("date", { ascending: false })
            .range(from, from + PAGE_SIZE - 1)
            .retry(false)
            .abortSignal(signal()),
        );
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all;
    },
    outlookDays: (runIds, scenarioIds) =>
      read<OutlookDayRow[]>(
        "water_outlook",
        client
          .from("water_outlook")
          .select("run_id,scenario_id,target_date,lead_day,status")
          .in("run_id", runIds)
          .in("scenario_id", scenarioIds)
          .retry(false)
          .abortSignal(signal()),
      ),
    recentWeather: async (since, stnIds) => {
      if (stnIds && stnIds.length === 0) return [];
      const all: WeatherFetchRow[] = [];
      let from = 0;
      while (true) {
        let q = client
          .from("weather_daily")
          .select("stn_id,date,fetched_at")
          .gte("date", since);
        if (stnIds && stnIds.length > 0) {
          q = q.in("stn_id", stnIds);
        }
        const batch = await read<WeatherFetchRow[]>(
          "weather_daily",
          q
            .order("stn_id", { ascending: true })
            .order("date", { ascending: false })
            .range(from, from + PAGE_SIZE - 1)
            .retry(false)
            .abortSignal(signal()),
        );
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all;
    },
    latestSoilWater: async (stnIds) => {
      if (stnIds.length === 0) return [];
      const all: SoilWaterStatusRow[] = [];
      let from = 0;
      while (true) {
        const batch = await read<SoilWaterStatusRow[]>(
          "soil_water_latest",
          client
            .from("soil_water_latest")
            .select(
              "stn_id,soil_code,date,dr_mm,taw_mm,raw_mm,aw_pct,status,filled",
            )
            .in("stn_id", stnIds)
            .order("stn_id", { ascending: true })
            .order("soil_code", { ascending: true })
            .range(from, from + PAGE_SIZE - 1)
            .retry(false)
            .abortSignal(signal()),
        );
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }
      return all;
    },
  };
}
