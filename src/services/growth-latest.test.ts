import { describe, expect, it } from "vitest";

import type { HeatLatestRow, HeatSource } from "@/infra/supabase/heat-source";
import type { SunLatestRow, SunSource } from "@/infra/supabase/sun-source";

import { getHomeGrowth, readHeatLatest, readSunLatest } from "./growth-latest";

/** 가짜 DB. 값은 지어낸 것이다. 오늘 = 2026-10-25 (한국), 어제 = 10월 24일. */
const NOW = () => new Date("2026-10-25T03:00:00Z");
const TODAY = "2026-10-25";

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
    onDate: async (_ids, _crop, date) => {
      asked.push(`onDate ${date}`);
      return date === "2026-12-31"
        ? [
            heatRow("101", date, null, null, 4100),
            heatRow("216", date, null, null, 2600),
          ]
        : [
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
    onDate: async () => [sunRow("101", 3218, 3352), sunRow("216", 3500, 3333)],
    recent: async () => [],
    ...over,
  };
}

describe("readHeatLatest", () => {
  it("어제 값, 없는 지점은 최근 며칠에서 보충", async () => {
    const { src, asked } = heatSource();
    const m = await readHeatLatest(src, "apple", TODAY);
    expect(m[101]).toEqual({
      lead: 20,
      cum: 4165,
      normal: 3973,
      annualNormal: null,
    });
    expect(m[119]).toMatchObject({ lead: 6, cum: 2200 });
    expect(m[136]).toBeUndefined();
    expect(asked).toEqual(["onDate 2026-10-24", "recent 8"]);
  });

  it("평년 한 해 합(12/31)은 바랄 때만 한 번 더 읽는다", async () => {
    const { src, asked } = heatSource();
    const m = await readHeatLatest(src, "apple", TODAY, { annual: true });
    expect(m[216]).toEqual({
      lead: null,
      cum: 2700,
      normal: 2650,
      annualNormal: 2600,
    });
    expect(asked).toContain("onDate 2026-12-31");
  });
});

describe("readSunLatest", () => {
  it("마지막 관측일 누적, 줄이 없는 지점은 빠진다", async () => {
    const m = await readSunLatest(sunSource(), TODAY);
    expect(m[101]).toEqual({ cum: 3218, normal: 3352 });
    expect(m[216]).toEqual({ cum: 3500, normal: 3333 });
    expect(m[192]).toBeUndefined();
  });
});

describe("getHomeGrowth", () => {
  it("적산온도(평년 한 해 합 포함)와 적산일사를 함께, 배추는 kimchi_cabbage 로", async () => {
    const crops: string[] = [];
    const { src } = heatSource({
      onDate: async (_ids, crop, date) => (
        crops.push(crop),
        date === "2026-12-31" ? [] : [heatRow("101", date, 3, 1000, 990)]
      ),
    });
    const g = await getHomeGrowth("cabbage", {
      createHeat: () => src,
      createSun: () => sunSource(),
      now: NOW,
    });
    expect(g.heatOk).toBe(true);
    expect(g.sunOk).toBe(true);
    expect(g.heat[101]).toMatchObject({ lead: 3, cum: 1000 });
    expect(g.sun[101]).toEqual({ cum: 3218, normal: 3352 });
    expect(new Set(crops)).toEqual(new Set(["kimchi_cabbage"]));
  });

  it("한쪽이 실패해도 다른 쪽은 남기고, 실패한 쪽만 표시한다", async () => {
    const g = await getHomeGrowth("apple", {
      createHeat: () =>
        heatSource({
          onDate: async () => {
            throw new Error("heat_daily 읽기 실패: 가짜 오류");
          },
        }).src,
      createSun: () => sunSource(),
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
      now: NOW,
    });
    expect(g).toEqual({ heatOk: false, sunOk: false, heat: {}, sun: {} });
  });
});
