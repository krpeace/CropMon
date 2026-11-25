import type { SupabaseClient } from "@supabase/supabase-js";

import type { SunSeries } from "./accum-series";
import { getSupabaseClient } from "./client";
import { nums, TIMEOUT_MS, unwrap, type Result } from "./water-source";

/**
 * 햇빛 화면이 읽는 DB 자료 (데이터 계약 v2.2 sun_series_daily, 결정 0013 · 0063 · 0072). 읽기만 한다.
 * 지점 × 적산일사 계열(누적 시작 월-일)로 읽는다. 작물 → 계열은 accum-series 가 찾는다. 공개 키(anon)로 읽고, 권한은 RLS 가 막는다.
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
  year(stnId: string, series: SunSeries, year: number): Promise<SunRow[]>;
  /** 여러 지점의 한 날 값 (한 번에). */
  onDate(
    stnIds: string[],
    series: SunSeries,
    date: string,
  ): Promise<SunLatestRow[]>;
  /** 여러 지점의 최근 며칠 중 올해 값이 있는 줄, 날짜 순 (onDate 에 없는 지점 보충). */
  recent(
    stnIds: string[],
    series: SunSeries,
    from: string,
    until: string,
  ): Promise<SunLatestRow[]>;
  /** 이 지점 줄 중 가장 늦은 올린 시각 (매일 09:20 heat-sun, 계약 v1.8). 줄이 없으면 null. */
  lastUpdated(stnId: string, series: SunSeries): Promise<string | null>;
  /** 여러 지점 중 최근 기간 안에 그 일사 계열의 유효 일사(rs_cum_mj)가 있는 지점 번호 목록. */
  measured(
    stnIds: string[],
    series: SunSeries,
    from: string,
    until: string,
  ): Promise<string[]>;
};

export const COLUMNS = {
  sun_series:
    "date,rs_day_mj,rs_cum_mj,rs_normal_day_mj,rs_normal_cum_mj,normal_from,normal_to,filled",
  sun_latest: "stn_id,date,rs_cum_mj,rs_normal_cum_mj",
  measured: "stn_id",
  updated: "updated_at",
} as const;

const TABLE = "sun_series_daily";
const TEXT = ["stn_id", "date"];
const PAGE_SIZE = 1000;

export function createSunSource(
  client: SupabaseClient = getSupabaseClient(),
): SunSource {
  const signal = () => AbortSignal.timeout(TIMEOUT_MS);
  const many = async <T extends object>(
    table: string,
    r: PromiseLike<Result<T[]>>,
  ) => unwrap(table, await r).map((x) => nums(x, TEXT));

  return {
    year: (stnId, series, year) =>
      many<SunRow>(
        TABLE,
        client
          .from(TABLE)
          .select(COLUMNS.sun_series)
          .eq("stn_id", stnId)
          .eq("cum_start_mmdd", series.cumStartMmdd)
          .gte("date", `${year}-01-01`)
          .lte("date", `${year}-12-31`)
          .order("date")
          .limit(400)
          .retry(false)
          .abortSignal(signal()),
      ),
    onDate: (stnIds, series, date) =>
      stnIds.length === 0
        ? Promise.resolve([])
        : many<SunLatestRow>(
            TABLE,
            client
              .from(TABLE)
              .select(COLUMNS.sun_latest)
              .in("stn_id", stnIds)
              .eq("cum_start_mmdd", series.cumStartMmdd)
              .eq("date", date)
              .retry(false)
              .abortSignal(signal()),
          ),
    recent: async (stnIds, series, from, until) => {
      if (stnIds.length === 0) return [];
      const all: SunLatestRow[] = [];
      let pageFrom = 0;
      while (true) {
        const batch = await many<SunLatestRow>(
          TABLE,
          client
            .from(TABLE)
            .select(COLUMNS.sun_latest)
            .in("stn_id", stnIds)
            .eq("cum_start_mmdd", series.cumStartMmdd)
            .gte("date", from)
            .lte("date", until)
            .not("rs_cum_mj", "is", null)
            .order("date", { ascending: true })
            .order("stn_id", { ascending: true })
            .range(pageFrom, pageFrom + PAGE_SIZE - 1)
            .retry(false)
            .abortSignal(signal()),
        );
        all.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        pageFrom += PAGE_SIZE;
      }
      return all;
    },
    lastUpdated: async (stnId, series) => {
      const rows = await many<{ updated_at: string }>(
        TABLE,
        client
          .from(TABLE)
          .select(COLUMNS.updated)
          .eq("stn_id", stnId)
          .eq("cum_start_mmdd", series.cumStartMmdd)
          .order("updated_at", { ascending: false })
          .limit(1)
          .retry(false)
          .abortSignal(signal()),
      );
      return rows[0]?.updated_at ?? null;
    },
    measured: async (stnIds, series, from, until) => {
      if (stnIds.length === 0) return [];
      const rows = await many<{ stn_id: string }>(
        TABLE,
        client
          .from(TABLE)
          .select(COLUMNS.measured)
          .in("stn_id", stnIds)
          .eq("cum_start_mmdd", series.cumStartMmdd)
          .gte("date", from)
          .lte("date", until)
          .not("rs_cum_mj", "is", null)
          .limit(1000)
          .retry(false)
          .abortSignal(signal()),
      );
      return [...new Set(rows.map((r) => r.stn_id))];
    },
  };
}
