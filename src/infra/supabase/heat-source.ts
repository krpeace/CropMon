import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseClient } from "./client";
import { nums, TIMEOUT_MS, unwrap, type Result } from "./water-source";

/**
 * 온도 화면이 읽는 DB 자료 (데이터 계약 v1.4, 결정 0013). 읽기만 한다. 공개 키(anon)로 읽고, 권한은 RLS 가 막는다.
 * 열은 필요한 것만 적는다. 읽는 방식(8초 제한, 재시도 끔)은 물 화면(water-source)과 같다.
 */

export type HeatRow = {
  date: string;
  t_base_c: number;
  gdd_day: number | null;
  gdd_cum: number | null;
  gdd_normal_cum: number | null;
  lead_days: number | null;
  normal_from: number;
  normal_to: number;
  filled: boolean;
};

/** 지역 비교용: 지점의 한 날 값. */
export type HeatLatestRow = {
  stn_id: string;
  date: string;
  lead_days: number | null;
  gdd_cum: number | null;
  gdd_normal_cum: number | null;
};

/** 온도 화면에 필요한 읽기. 서비스는 이 모양만 알고, 테스트에서는 가짜를 넣는다. */
export type HeatSource = {
  /** 그해 1월 1일 ~ 12월 31일, 날짜 순 (아직 오지 않은 날은 평년 값만). */
  year(stnId: string, cropId: string, year: number): Promise<HeatRow[]>;
  /** 여러 지점의 한 날 값 (한 번에). */
  onDate(
    stnIds: string[],
    cropId: string,
    date: string,
  ): Promise<HeatLatestRow[]>;
  /** 여러 지점의 최근 며칠 중 올해 값이 있는 줄, 날짜 순 (onDate 에 없는 지점 보충). */
  recent(
    stnIds: string[],
    cropId: string,
    from: string,
    until: string,
  ): Promise<HeatLatestRow[]>;
  /** 작물 사전의 적산온도 단계. 없으면 null. */
  stages(cropId: string): Promise<number[] | null>;
};

export const COLUMNS = {
  heat_daily:
    "date,t_base_c,gdd_day,gdd_cum,gdd_normal_cum,lead_days,normal_from,normal_to,filled",
  heat_latest: "stn_id,date,lead_days,gdd_cum,gdd_normal_cum",
  crops: "gdd_stages",
} as const;

const TEXT = ["stn_id", "date"];

export function createHeatSource(
  client: SupabaseClient = getSupabaseClient(),
): HeatSource {
  const signal = () => AbortSignal.timeout(TIMEOUT_MS);
  const many = async <T extends object>(
    table: string,
    r: PromiseLike<Result<T[]>>,
  ) => unwrap(table, await r).map((x) => nums(x, TEXT));

  return {
    year: (stnId, cropId, year) =>
      many<HeatRow>(
        "heat_daily",
        client
          .from("heat_daily")
          .select(COLUMNS.heat_daily)
          .eq("stn_id", stnId)
          .eq("crop_id", cropId)
          .gte("date", `${year}-01-01`)
          .lte("date", `${year}-12-31`)
          .order("date")
          .limit(400)
          .retry(false)
          .abortSignal(signal()),
      ),
    onDate: (stnIds, cropId, date) =>
      many<HeatLatestRow>(
        "heat_daily",
        client
          .from("heat_daily")
          .select(COLUMNS.heat_latest)
          .in("stn_id", stnIds)
          .eq("crop_id", cropId)
          .eq("date", date)
          .retry(false)
          .abortSignal(signal()),
      ),
    recent: (stnIds, cropId, from, until) =>
      many<HeatLatestRow>(
        "heat_daily",
        client
          .from("heat_daily")
          .select(COLUMNS.heat_latest)
          .in("stn_id", stnIds)
          .eq("crop_id", cropId)
          .gte("date", from)
          .lte("date", until)
          .not("gdd_cum", "is", null)
          .order("date")
          .retry(false)
          .abortSignal(signal()),
      ),
    stages: async (cropId) => {
      const row = unwrap(
        "crops",
        await client
          .from("crops")
          .select(COLUMNS.crops)
          .eq("crop_id", cropId)
          .retry(false)
          .abortSignal(signal())
          .maybeSingle<{ gdd_stages: number[] | null }>(),
      );
      return row?.gdd_stages?.map(Number) ?? null;
    },
  };
}
