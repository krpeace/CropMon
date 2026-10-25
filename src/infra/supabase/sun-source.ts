import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseClient } from "./client";
import { nums, TIMEOUT_MS, unwrap, type Result } from "./water-source";

/**
 * 햇빛 화면이 읽는 DB 자료 (데이터 계약 v1.4, 결정 0013). 읽기만 한다. 공개 키(anon)로 읽고, 권한은 RLS 가 막는다.
 * 열은 필요한 것만 적는다. 읽는 방식(8초 제한, 재시도 끔)은 물·온도 화면과 같다.
 */

export type SunRow = {
  date: string;
  rs_day_mj: number | null;
  rs_cum_mj: number | null;
  rs_normal_day_mj: number | null;
  rs_normal_cum_mj: number | null;
  normal_from: number;
  normal_to: number;
  filled: boolean;
};

/** 지역 비교용: 지점의 한 날 값. */
export type SunLatestRow = {
  stn_id: string;
  date: string;
  rs_cum_mj: number | null;
  rs_normal_cum_mj: number | null;
};

/** 햇빛 화면에 필요한 읽기. 서비스는 이 모양만 알고, 테스트에서는 가짜를 넣는다. */
export type SunSource = {
  /** 그해 1월 1일 ~ 12월 31일, 날짜 순. 일사를 재지 않는 지점은 빈 목록. */
  year(stnId: string, year: number): Promise<SunRow[]>;
  /** 여러 지점의 한 날 값 (한 번에). */
  onDate(stnIds: string[], date: string): Promise<SunLatestRow[]>;
  /** 여러 지점의 최근 며칠 중 올해 값이 있는 줄, 날짜 순 (onDate 에 없는 지점 보충). */
  recent(
    stnIds: string[],
    from: string,
    until: string,
  ): Promise<SunLatestRow[]>;
};

export const COLUMNS = {
  sun_daily:
    "date,rs_day_mj,rs_cum_mj,rs_normal_day_mj,rs_normal_cum_mj,normal_from,normal_to,filled",
  sun_latest: "stn_id,date,rs_cum_mj,rs_normal_cum_mj",
} as const;

const TEXT = ["stn_id", "date"];

export function createSunSource(
  client: SupabaseClient = getSupabaseClient(),
): SunSource {
  const signal = () => AbortSignal.timeout(TIMEOUT_MS);
  const many = async <T extends object>(
    table: string,
    r: PromiseLike<Result<T[]>>,
  ) => unwrap(table, await r).map((x) => nums(x, TEXT));

  return {
    year: (stnId, year) =>
      many<SunRow>(
        "sun_daily",
        client
          .from("sun_daily")
          .select(COLUMNS.sun_daily)
          .eq("stn_id", stnId)
          .gte("date", `${year}-01-01`)
          .lte("date", `${year}-12-31`)
          .order("date")
          .limit(400)
          .retry(false)
          .abortSignal(signal()),
      ),
    onDate: (stnIds, date) =>
      many<SunLatestRow>(
        "sun_daily",
        client
          .from("sun_daily")
          .select(COLUMNS.sun_latest)
          .in("stn_id", stnIds)
          .eq("date", date)
          .retry(false)
          .abortSignal(signal()),
      ),
    recent: (stnIds, from, until) =>
      many<SunLatestRow>(
        "sun_daily",
        client
          .from("sun_daily")
          .select(COLUMNS.sun_latest)
          .in("stn_id", stnIds)
          .gte("date", from)
          .lte("date", until)
          .not("rs_cum_mj", "is", null)
          .order("date")
          .retry(false)
          .abortSignal(signal()),
      ),
  };
}
