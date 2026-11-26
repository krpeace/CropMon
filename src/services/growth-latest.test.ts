import { describe, expect, it } from "vitest";

import type { SeriesLookup } from "@/infra/supabase/accum-series";
import type { HeatLatestRow, HeatSource } from "@/infra/supabase/heat-source";
import type { SunLatestRow, SunSource } from "@/infra/supabase/sun-source";

import { getHomeGrowth, readHeatLatest, readSunLatest } from "./growth-latest";

/** 가짜 DB. 값은 지어낸 것이다. 오늘 = 2026-10-25 (한국), 어제 = 10월 24일. */
const NOW = () => new Date("2026-10-25T03:00:00Z");
const TODAY = "2026-10-25";
const HEAT_SERIES = { tBaseC: 5, cumStartMmdd: "01-01" };
const SUN_SERIES = { cumStartMmdd: "01-01" };
const OK: SeriesLookup = { kind: "ok", heat: HEAT_SERIES, sun: SUN_SERIES };
const FIND = async () => OK;

const heatRow = (
  stn_id: string,
  date: string,
  lead_days: number | null,
  gdd_cum: number | null,
  gdd_normal_cum: number | null,
): HeatLatestRow => ({ stn_id, date, lead_days, gdd_cum, gdd_normal_cum });

function heatSource(over: Partial<HeatSource> = {}) {
  const asked: string[] = [];
  const src: HeatSource = {
    year: async () => [],
    stages: async () => null,
    lastUpdated: async () => null,
    onDate: async (_ids, _series, date) => {
      asked.push(`onDate ${date}`);
      return [
        heatRow("101", date, 20, 4165, 3973),
        heatRow("216", date, null, 2700, 2650),
      ];
    },
    recent: async (ids) => {
      asked.push(`recent ${ids.length}`);
      return ids.includes("119")
        ? [
            heatRow("119", "2026-10-22", 4, 2100, 2000),
            heatRow("119", "2026-10-23", 6, 2200, 2100),
          ]
        : [];
    },
    ...over,
  };
  return { src, asked };
}

const sunRow = (
  stn_id: string,
  rs_cum_mj: number,
  rs_normal_cum_mj: number,
): SunLatestRow => ({
  stn_id,
  date: "2026-10-24",
  rs_cum_mj,
  rs_normal_cum_mj,
});

function sunSource(over: Partial<SunSource> = {}): SunSource {
  return {
    year: async () => [],
    lastUpdated: async () => null,
    onDate: async () => [sunRow("101", 3218, 3352), sunRow("216", 3500, 3333)],
    recent: async () => [],
    measured: async () => [],
    ...over,
  };
}

describe("readHeatLatest", () => {
  it("어제 값, 없는 지점은 최근 며칠에서 보충하고 읽은 date 를 함께 담는다", async () => {
    const { src, asked } = heatSource();
    const m = await readHeatLatest(src, HEAT_SERIES, TODAY);
    expect(m[101]).toEqual({ date: "2026-10-24", cum: 4165, normal: 3973 });
    expect(m[119]).toEqual({ date: "2026-10-23", cum: 2200, normal: 2100 });
    expect(m[136]).toBeUndefined();
    expect(asked).toEqual(["onDate 2026-10-24", "recent 8"]);
  });

  it("어제 줄이 평년값만 있고 gdd_cum 이 null 이면 최근 며칠에서 유효 값이 있는 마지막 date 를 고른다", async () => {
    const { src } = heatSource({
      onDate: async (_ids, _crop, date) => [
        heatRow("101", date, 20, 4165, 3973),
        heatRow("119", date, null, null, 2110),
      ],
    });
    const m = await readHeatLatest(src, HEAT_SERIES, TODAY);
    expect(m[119]).toEqual({ date: "2026-10-23", cum: 2200, normal: 2100 });
  });

  it("평년 한 해 합(12/31)은 읽지 않는다", async () => {
    const { src, asked } = heatSource();
    await readHeatLatest(src, HEAT_SERIES, TODAY);
    expect(asked).not.toContain("onDate 2026-12-31");
  });

  it("stationScope: 'active'를 넘기면 운영 97곳을 대상으로 읽고 누락 지점을 보충한다", async () => {
    const { src, asked } = heatSource();
    const m = await readHeatLatest(src, HEAT_SERIES, TODAY, "active");
    expect(m[101]).toEqual({ date: "2026-10-24", cum: 4165, normal: 3973 });
    expect(m[119]).toEqual({ date: "2026-10-23", cum: 2200, normal: 2100 });
    // 97개 지점 중 onDate 2곳(101, 216) 제외 95개 missing
    expect(asked).toEqual(["onDate 2026-10-24", "recent 95"]);
  });

  it("stationIds 를 생략하면 지금처럼 대표 10곳만 묻는다 (종합 화면 보호)", async () => {
    const queried: string[][] = [];
    const { src } = heatSource({
      onDate: async (ids, _crop, date) => {
        queried.push(ids);
        return [heatRow("101", date, 20, 4165, 3973)];
      },
      recent: async (ids) => {
        queried.push(ids);
        return [];
      },
    });
    await readHeatLatest(src, HEAT_SERIES, TODAY);
    expect(queried[0]).toHaveLength(10);
    expect(queried[1]).toHaveLength(9);
  });

  it("stationIds 를 넘기면 그 지점만 묻는다 (대표 밖 1곳 읽기)", async () => {
    const queried: string[][] = [];
    const { src } = heatSource({
      onDate: async (ids, _crop, date) => {
        queried.push(ids);
        return [heatRow("108", date, 10, 4050, 3900)];
      },
      recent: async (ids) => {
        queried.push(ids);
        return [];
      },
    });
    const m = await readHeatLatest(src, HEAT_SERIES, TODAY, "rep", [108]);
    expect(queried).toEqual([["108"]]);
    expect(m[108]).toEqual({ date: "2026-10-24", cum: 4050, normal: 3900 });
  });
});

describe("readSunLatest", () => {
  it("마지막 관측일 누적과 date, 줄이 없는 지점은 빠진다", async () => {
    const m = await readSunLatest(sunSource(), SUN_SERIES, TODAY);
    expect(m[101]).toEqual({ date: "2026-10-24", cum: 3218, normal: 3352 });
    expect(m[216]).toEqual({ date: "2026-10-24", cum: 3500, normal: 3333 });
    expect(m[192]).toBeUndefined();
  });

  it("어제 줄의 rs_cum_mj 가 null 이면 평년 열이 있어도 건너뛰고 이전 유효 날짜를 읽는다", async () => {
    const src = sunSource({
      onDate: async () => [
        sunRow("101", 3218, 3352),
        {
          stn_id: "119",
          date: "2026-10-24",
          rs_cum_mj: null,
          rs_normal_cum_mj: 3425,
        },
      ],
      recent: async () => [
        {
          stn_id: "119",
          date: "2026-10-22",
          rs_cum_mj: 3310,
          rs_normal_cum_mj: 3390,
        },
      ],
    });
    const m = await readSunLatest(src, SUN_SERIES, TODAY);
    expect(m[119]).toEqual({ date: "2026-10-22", cum: 3310, normal: 3390 });
  });

  it("stationScope: 'active'를 넘기면 운영 97곳을 대상으로 읽는다", async () => {
    const asked: string[] = [];
    const src: SunSource = {
      ...sunSource(),
      onDate: async (ids) => {
        asked.push(`onDate ${ids.length}`);
        return [sunRow("101", 3218, 3352), sunRow("216", 3500, 3333)];
      },
    };
    const m = await readSunLatest(src, SUN_SERIES, TODAY, "active");
    expect(m[101]).toEqual({ date: "2026-10-24", cum: 3218, normal: 3352 });
    expect(asked).toEqual(["onDate 97"]);
  });

  it("stationIds 를 생략하면 대표 10곳만 묻고, 넘기면 그 지점만 묻는다", async () => {
    const askedDefault: string[][] = [];
    await readSunLatest(
      sunSource({
        onDate: async (ids) => {
          askedDefault.push(ids);
          return [sunRow("101", 3218, 3352)];
        },
        recent: async () => [],
      }),
      SUN_SERIES,
      TODAY,
    );
    expect(askedDefault[0]).toHaveLength(10);

    const askedSingle: string[][] = [];
    const m = await readSunLatest(
      sunSource({
        onDate: async (ids) => {
          askedSingle.push(ids);
          return [sunRow("108", 3400, 3300)];
        },
        recent: async () => [],
      }),
      SUN_SERIES,
      TODAY,
      "rep",
      [108],
    );
    expect(askedSingle).toEqual([["108"]]);
    expect(m[108]).toEqual({ date: "2026-10-24", cum: 3400, normal: 3300 });
  });
});

describe("getHomeGrowth", () => {
  it("적산온도와 적산일사를 함께, 배추는 kimchi_cabbage 로", async () => {
    const crops: string[] = [];
    const { src } = heatSource({
      onDate: async (_ids, _series, date) => [
        heatRow("101", date, 3, 1000, 990),
      ],
    });
    const g = await getHomeGrowth("cabbage", {
      createHeat: () => src,
      createSun: () => sunSource(),
      findSeries: async (cropId) => (crops.push(cropId), OK),
      now: NOW,
    });
    expect(g.heatOk).toBe(true);
    expect(g.sunOk).toBe(true);
    expect(g.heat[101]).toEqual({ date: "2026-10-24", cum: 1000, normal: 990 });
    expect(g.sun[101]).toEqual({
      date: "2026-10-24",
      cum: 3218,
      normal: 3352,
    });
    expect(new Set(crops)).toEqual(new Set(["kimchi_cabbage"]));
    expect(g.heat[101]).toBeDefined();
  });

  it("한쪽이 실패해도 다른 쪽은 남기고, 실패한 쪽만 표시한다", async () => {
    const g = await getHomeGrowth("apple", {
      createHeat: () =>
        heatSource({
          onDate: async () => {
            throw new Error("heat_series_daily 읽기 실패: 가짜 오류");
          },
        }).src,
      createSun: () => sunSource(),
      findSeries: FIND,
      now: NOW,
    });
    expect(g.heatOk).toBe(false);
    expect(g.heat).toEqual({});
    expect(g.sunOk).toBe(true);
    expect(g.sun[101]).toBeDefined();
  });

  it("연결 정보가 없어도 멈추지 않는다", async () => {
    const g = await getHomeGrowth("apple", {
      createHeat: () => {
        throw new Error("env");
      },
      createSun: () => {
        throw new Error("env");
      },
      findSeries: FIND,
      now: NOW,
    });
    expect(g).toEqual({ heatOk: false, sunOk: false, heat: {}, sun: {} });
  });

  it("getHomeGrowth에 stationScope: 'active'를 넘기면 운영 97곳을 조회한다", async () => {
    const { src, asked } = heatSource();
    const g = await getHomeGrowth("common", {
      createHeat: () => src,
      createSun: () => sunSource(),
      findSeries: FIND,
      now: NOW,
      stationScope: "active",
    });
    expect(g.heatOk).toBe(true);
    expect(asked).toEqual(["onDate 2026-10-24", "recent 95"]);
  });

  it("계열 뷰를 읽지 못하면 두 쪽 모두 실패 표시(자료 없음)이고 멈추지 않는다", async () => {
    const g = await getHomeGrowth("apple", {
      createHeat: () => heatSource().src,
      createSun: () => sunSource(),
      findSeries: async () => Promise.reject(new Error("view down")),
      now: NOW,
    });
    expect(g).toEqual({ heatOk: false, sunOk: false, heat: {}, sun: {} });
  });

  it("적산온도 안 냄(heat null)은 실패가 아니라 빈 표이고 햇빛은 그대로 읽는다", async () => {
    const { src, asked } = heatSource();
    const g = await getHomeGrowth("apple", {
      createHeat: () => src,
      createSun: () => sunSource(),
      findSeries: async () => ({ ...OK, heat: null }),
      now: NOW,
    });
    expect(g.heatOk).toBe(true);
    expect(g.heat).toEqual({});
    expect(asked).toEqual([]);
    expect(g.sun[101]).toBeDefined();
  });

  it("작형이 필요하면 추측하지 않고 두 쪽 모두 실패 표시", async () => {
    const g = await getHomeGrowth("apple", {
      createHeat: () => heatSource().src,
      createSun: () => sunSource(),
      findSeries: async () => ({ kind: "needSeasonType" }),
      now: NOW,
    });
    expect(g.heatOk).toBe(false);
    expect(g.sunOk).toBe(false);
  });
});
