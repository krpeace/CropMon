import type { SupabaseClient } from "@supabase/supabase-js";

import { getSupabaseClient } from "./client";
import { TIMEOUT_MS, unwrap } from "./water-source";

/**
 * 적산 계열 찾기 — 한 곳 (결정 0063 3절, 0072). 작물(+작형)로 "어느 표의 어느 줄을 읽을지"를 뷰 `crop_accum_series`에서 찾는다.
 * 적산온도 계열 = (기준온도, 누적 시작 월-일), 적산일사 계열 = 누적 시작 월-일.
 * 규칙(01-01, 기준온도 4 · 5 · 10 등)은 코드에 적지 않는다. 뷰(= 사전)가 정하고 여기서는 읽기만 한다.
 */

export type HeatSeries = { tBaseC: number; cumStartMmdd: string };
export type SunSeries = { cumStartMmdd: string };

export type SeriesLookup =
  | {
      kind: "ok";
      /** 적산온도 계열. null = 적산온도를 내지 않음 (시설가온 등). */
      heat: HeatSeries | null;
      sun: SunSeries;
    }
  /** 한 작물에 계열이 여럿(지금은 포도)인데 작형을 받지 않았다. 추측하지 않는다. */
  | { kind: "needSeasonType" }
  /** 뷰에 그 작물(작형) 줄이 없다. */
  | { kind: "notFound" };

export type SeriesRow = {
  crop_id: string;
  season_type_id: string | null;
  heat_t_base_c: number | string | null;
  heat_cum_start_mmdd: string | null;
  sun_cum_start_mmdd: string | null;
};

export const COLUMNS =
  "crop_id,season_type_id,heat_t_base_c,heat_cum_start_mmdd,sun_cum_start_mmdd";

function toSeries(r: SeriesRow): SeriesLookup {
  // 기준온도는 숫자로 (4 와 4.0 은 같다, 0063 넘길 것 9)
  const t = r.heat_t_base_c == null ? null : Number(r.heat_t_base_c);
  const heat =
    t != null && Number.isFinite(t) && r.heat_cum_start_mmdd
      ? { tBaseC: t, cumStartMmdd: r.heat_cum_start_mmdd }
      : null;
  if (!r.sun_cum_start_mmdd) return { kind: "notFound" };
  return { kind: "ok", heat, sun: { cumStartMmdd: r.sun_cum_start_mmdd } };
}

/** 뷰 줄들(한 작물)에서 계열을 고른다. 순수 함수. */
export function pickSeries(
  rows: readonly SeriesRow[],
  seasonTypeId?: string,
): SeriesLookup {
  const mine = seasonTypeId
    ? rows.filter((r) => r.season_type_id === seasonTypeId)
    : rows;
  const found = mine.map(toSeries);
  if (found.length === 0 || found.some((f) => f.kind !== "ok"))
    return { kind: "notFound" };
  const distinct = new Map(found.map((f) => [JSON.stringify(f), f]));
  if (distinct.size > 1) return { kind: "needSeasonType" };
  return found[0];
}

export type SeriesFinder = {
  find(cropId: string, seasonTypeId?: string): Promise<SeriesLookup>;
};

export function createSeriesFinder(
  client: SupabaseClient = getSupabaseClient(),
): SeriesFinder {
  return {
    find: async (cropId, seasonTypeId) => {
      const rows = unwrap(
        "crop_accum_series",
        await client
          .from("crop_accum_series")
          .select(COLUMNS)
          .eq("crop_id", cropId)
          .limit(20)
          .retry(false)
          .abortSignal(AbortSignal.timeout(TIMEOUT_MS)),
      ) as SeriesRow[] | null;
      return pickSeries(rows ?? [], seasonTypeId);
    },
  };
}

/** ok 가 아니면 던진다 (읽는 쪽이 읽기 실패와 같은 "자료 없음" 쪽으로 보내도록). */
export function seriesOrThrow(
  lookup: SeriesLookup,
): Extract<SeriesLookup, { kind: "ok" }> {
  if (lookup.kind === "ok") return lookup;
  throw new Error(
    lookup.kind === "needSeasonType"
      ? "적산 계열을 정하려면 작형이 필요해요"
      : "적산 계열을 찾지 못했어요",
  );
}
