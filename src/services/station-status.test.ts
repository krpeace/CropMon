import { describe, expect, it } from "vitest";

import type { StatusSource } from "@/infra/supabase/status-source";

import { getObserved, getStationBoard, statusesOf } from "./station-status";

/** 가짜 DB. 값은 지어낸 것이다. */
const S101 = "101-apple-main-k3-loam-2026";
const C101 = "101-kimchi_cabbage-summer-k1-loam-2026";
const S216 = "216-apple-main-k3-loam-2026";
const season = {
  raw_mm: 65,
  taw_mm: 130,
  season_start: "2026-04-01",
  season_end: "2026-11-15",
};
const SCEN = [
  { scenario_id: S101, stn_id: "101", crop_id: "apple", ...season },
  {
    scenario_id: C101,
    stn_id: "101",
    crop_id: "kimchi_cabbage",
    ...season,
    raw_mm: 29.25,
    taw_mm: 65,
    season_start: "2026-06-01",
    season_end: "2026-09-08",
  },
  { scenario_id: S216, stn_id: "216", crop_id: "apple", ...season },
];
const RUNS = [
  {
    run_id: 9,
    stn_id: "101",
    run_at: "2026-10-25T08:00:00+00:00",
    run_name: "저녁",
    finished_at: "2026-10-25T08:42:00+00:00",
  },
  {
    run_id: 7,
    stn_id: "101",
    run_at: "2026-10-24T17:00:00+00:00",
    run_name: "아침",
    finished_at: "2026-10-24T17:41:00+00:00",
  },
];
const day = (target_date: string, lead_day: number, status: string) => ({
  run_id: 9,
  scenario_id: S101,
  target_date,
  lead_day,
  status,
});

function fake(
  over: Partial<StatusSource> = {},
  calls: string[] = [],
): StatusSource {
  return {
    defaultScenarios: async (y) => (calls.push(`defaultScenarios ${y}`), SCEN),
    recentRuns: async (n) => (calls.push(`recentRuns ${n}`), RUNS),
    summaries: async (r, s) => (
      calls.push(`summaries ${r.join(",")} ${s.length}`),
      [
        {
          run_id: 9,
          scenario_id: S101,
          status_start: "caution",
          start_date: "2026-10-25",
          dr_start_mm: 52.4,
          need_center_in: 1,
        },
        {
          run_id: 7,
          scenario_id: S101,
          status_start: "normal",
          start_date: "2026-10-24",
          dr_start_mm: 30,
          need_center_in: null,
        },
      ]
    ),
    recentBalance: async (s, since) => (
      calls.push(`recentBalance ${s.length} ${since}`),
      [
        {
          scenario_id: S216,
          date: "2026-10-24",
          status: "normal",
          dr_mm: 20.2,
        },
        { scenario_id: S216, date: "2026-10-23", status: "need", dr_mm: 70 },
        {
          scenario_id: S101,
          date: "2026-10-24",
          status: "caution",
          dr_mm: 50.7,
        },
        {
          scenario_id: C101,
          date: "2026-10-24",
          status: "dormant",
          dr_mm: null,
        },
      ]
    ),
    outlookDays: async (r, s) => (
      calls.push(`outlookDays ${r.join(",")} ${s.length}`),
      [
        day("2026-10-29", 4, "need"),
        day("2026-10-26", 1, "need"),
        day("2026-10-27", 2, "need"),
        day("2026-10-28", 3, "caution"),
      ]
    ),
    recentWeather: async (since) => (
      calls.push(`recentWeather ${since}`),
      [
        {
          stn_id: "216",
          date: "2026-10-24",
          fetched_at: "2026-10-24T17:20:00+00:00",
        },
        {
          stn_id: "216",
          date: "2026-10-23",
          fetched_at: "2026-10-23T17:20:00+00:00",
        },
      ]
    ),
    lastObserved: async () => ({
      date: "2026-10-24",
      fetched_at: "2026-10-24T17:20:00+00:00",
    }),
    recentSoilWater: async (since) => (
      calls.push(`recentSoilWater ${since}`),
      [
        {
          stn_id: "101",
          soil_code: "loam",
          date: "2026-10-24",
          dr_mm: 33.8,
          taw_mm: 65,
          raw_mm: 26,
          aw_pct: 48,
          status: "fair",
        },
        {
          stn_id: "101",
          soil_code: "loam",
          date: "2026-10-23",
          dr_mm: 30,
          taw_mm: 65,
          raw_mm: 26,
          aw_pct: 53.8,
          status: "fair",
        },
        {
          stn_id: "101",
          soil_code: "sand",
          date: "2026-10-24",
          dr_mm: 21,
          taw_mm: 30,
          raw_mm: 12,
          aw_pct: 30,
          status: "dry",
        },
      ]
    ),
    ...over,
  };
}
const NOW = () => new Date("2026-10-25T18:00:00+09:00");

describe("getStationBoard", () => {
  it("한 번에 일곱 번 읽는다", async () => {
    const calls: string[] = [];
    await getStationBoard({ createSource: () => fake({}, calls), now: NOW });
    expect(calls).toEqual([
      "defaultScenarios 2026",
      "recentRuns 40",
      "summaries 9 3",
      "recentBalance 3 2026-10-18",
      "outlookDays 9 3",
      "recentWeather 2026-10-18",
      "recentSoilWater 2026-10-18",
    ]);
  });

  it("예보 지점: 최신 회차(17시)의 출발 상태·예상일·앞으로 3일, 갱신은 회차 끝난 시각", async () => {
    const b = await getStationBoard({ createSource: () => fake(), now: NOW });
    expect(b.water.apple[101]).toEqual({
      status: "caution",
      drMm: 52.4,
      rawMm: 65,
      tawMm: 130,
      seasonStart: "2026-04-01",
      seasonEnd: "2026-11-15",
      observedDate: "2026-10-24",
      forecast: {
        needIn: 1, // 저녁 회차: 첫날 = 내일(10/26)
        days: [
          { date: "2026-10-26", status: "need" },
          { date: "2026-10-27", status: "need" },
          { date: "2026-10-28", status: "caution" },
        ],
      },
    });
    expect(b.updated[101]).toEqual({
      at: "2026-10-25T08:42:00+00:00",
      runHour: "17",
    });
  });

  it("예보가 없는 지점: 마지막 관측 물수지, 갱신은 ASOS 받은 시각", async () => {
    const b = await getStationBoard({ createSource: () => fake(), now: NOW });
    expect(b.water.apple[216]).toMatchObject({
      status: "normal",
      drMm: 20.2,
      observedDate: "2026-10-24",
      forecast: null,
    });
    expect(b.updated[216]).toEqual({
      at: "2026-10-24T17:20:00+00:00",
      runHour: null,
    });
    expect(b.water.cabbage[101]).toMatchObject({ status: "dormant" });
    expect(b.water.apple[119]).toBeNull();
    expect(b.updated[119]).toBeNull();
  });

  it("헤더 점 색은 상태만 (작물·토양별)", async () => {
    const b = await getStationBoard({ createSource: () => fake(), now: NOW });
    expect(b.soil.loam[101]).toEqual({
      status: "fair",
      awPct: 48,
      drMm: 33.8,
      tawMm: 65,
      rawMm: 26,
      observedDate: "2026-10-24",
    });
    expect(b.soil.sand[101]?.status).toBe("dry");
    const s = statusesOf(b);
    expect([
      s.apple[101],
      s.apple[216],
      s.apple[119],
      s.cabbage[101],
      s.soil.loam[101],
      s.soil.sand[101],
    ]).toEqual(["caution", "normal", null, "dormant", "fair", "dry"]);
  });

  it("DB 를 읽지 못하면 던지지 않고 모두 null", async () => {
    const b = await getStationBoard({
      createSource: () =>
        fake({ recentRuns: async () => Promise.reject(new Error("timeout")) }),
      now: NOW,
    });
    expect(Object.values(b.water.apple).every((v) => v === null)).toBe(true);
    expect(b.ok).toBe(false);
  });
});

describe("getObserved", () => {
  it("마지막 관측 받은 시각, 실패하면 null", async () => {
    expect(await getObserved(101, { createSource: () => fake() })).toEqual({
      date: "2026-10-24",
      fetchedAt: "2026-10-24T17:20:00+00:00",
    });
    expect(
      await getObserved(101, {
        createSource: () =>
          fake({ lastObserved: async () => Promise.reject(new Error("x")) }),
      }),
    ).toBeNull();
  });
});

describe("오래된 회차", () => {
  it("36시간보다 오래된 회차는 예보로 쓰지 않고 관측 기준으로", async () => {
    const old = [
      { ...RUNS[1], run_id: 3, run_at: "2026-10-22T17:00:00+00:00" },
    ];
    const b = await getStationBoard({
      createSource: () => fake({ recentRuns: async () => old }),
      now: NOW,
    });
    expect(b.water.apple[101]).toMatchObject({
      status: "caution",
      drMm: 50.7,
      forecast: null,
    });
  });
});
