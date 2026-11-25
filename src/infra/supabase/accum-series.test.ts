import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import {
  COLUMNS,
  createSeriesFinder,
  pickSeries,
  type SeriesRow,
} from "./accum-series";

/** crop_accum_series 뷰 5줄 (결정 0063). 지어낸 값이 아니라 운영 뷰의 모양 그대로. */
const VIEW: SeriesRow[] = [
  row("apple", "apple-main", "4", "01-01", "01-01"),
  row("kimchi_cabbage", "kimchi_cabbage-summer", "5", "01-01", "01-01"),
  row("grape", "grape-rainshelter", "10", "04-20", "04-20"),
  row("grape", "grape-heated", null, null, "01-01"),
  row("common", null, "5", "01-01", "01-01"),
];

function row(
  crop_id: string,
  season_type_id: string | null,
  t: string | null,
  heatStart: string | null,
  sunStart: string,
): SeriesRow {
  return {
    crop_id,
    season_type_id,
    heat_t_base_c: t as unknown as number | null,
    heat_cum_start_mmdd: heatStart,
    sun_cum_start_mmdd: sunStart,
  };
}

const of = (crop: string) => VIEW.filter((r) => r.crop_id === crop);

describe("pickSeries — 작물(+작형)로 계열 찾기", () => {
  it("사과 · 배추 · 작물 공통은 계열이 하나씩이다 (작형을 안 줘도 됨)", () => {
    expect(pickSeries(of("apple"))).toEqual({
      kind: "ok",
      heat: { tBaseC: 4, cumStartMmdd: "01-01" },
      sun: { cumStartMmdd: "01-01" },
    });
    expect(pickSeries(of("kimchi_cabbage"))).toEqual({
      kind: "ok",
      heat: { tBaseC: 5, cumStartMmdd: "01-01" },
      sun: { cumStartMmdd: "01-01" },
    });
    expect(pickSeries(of("common"))).toEqual({
      kind: "ok",
      heat: { tBaseC: 5, cumStartMmdd: "01-01" },
      sun: { cumStartMmdd: "01-01" },
    });
  });

  it("포도 + 작형 없음은 추측하지 않고 '작형 필요'", () => {
    expect(pickSeries(of("grape"))).toEqual({ kind: "needSeasonType" });
  });

  it("포도 비가림은 (10, 04-20) · 일사 04-20", () => {
    expect(pickSeries(of("grape"), "grape-rainshelter")).toEqual({
      kind: "ok",
      heat: { tBaseC: 10, cumStartMmdd: "04-20" },
      sun: { cumStartMmdd: "04-20" },
    });
  });

  it("포도 시설가온은 적산온도를 안 냄(heat null) · 일사 01-01", () => {
    expect(pickSeries(of("grape"), "grape-heated")).toEqual({
      kind: "ok",
      heat: null,
      sun: { cumStartMmdd: "01-01" },
    });
  });

  it("뷰가 4.0 · '4.00' 으로 줘도 같은 숫자 4 다", () => {
    for (const t of ["4.0", "4.00", 4.0]) {
      const r = pickSeries([
        row("apple", "apple-main", t as string, "01-01", "01-01"),
      ]);
      expect(r).toMatchObject({ heat: { tBaseC: 4 } });
    }
  });

  it("뷰에 그 작물 줄이 없거나 모르는 작형이면 notFound", () => {
    expect(pickSeries([])).toEqual({ kind: "notFound" });
    expect(pickSeries(of("grape"), "grape-unknown")).toEqual({
      kind: "notFound",
    });
  });
});

describe("createSeriesFinder — 뷰 읽기", () => {
  function client(answer: {
    data: unknown;
    error: { message: string } | null;
  }) {
    const calls: string[] = [];
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "limit", "abortSignal", "retry"]) {
      chain[m] = (...a: unknown[]) => {
        if (m !== "abortSignal" && m !== "retry")
          calls.push(`${m}(${a.map((x) => JSON.stringify(x)).join(",")})`);
        return chain;
      };
    }
    chain.then = (ok: (v: unknown) => unknown) =>
      Promise.resolve(answer).then(ok);
    return {
      c: {
        from: (t: string) => (calls.push(`from(${t})`), chain),
      } as unknown as SupabaseClient,
      calls,
    };
  }

  it("crop_accum_series 에서 그 작물 줄만 필요한 열로 읽는다", async () => {
    const { c, calls } = client({ data: of("apple"), error: null });
    const r = await createSeriesFinder(c).find("apple");
    expect(r.kind).toBe("ok");
    expect(calls).toEqual([
      "from(crop_accum_series)",
      `select(${JSON.stringify(COLUMNS)})`,
      'eq("crop_id","apple")',
      "limit(20)",
    ]);
  });

  it("읽기 오류는 던진다 (서비스가 잡아 '자료 없음' 쪽으로 보낸다)", async () => {
    const { c } = client({ data: null, error: { message: "boom" } });
    await expect(createSeriesFinder(c).find("apple")).rejects.toThrow(
      "crop_accum_series 읽기 실패: boom",
    );
  });
});
