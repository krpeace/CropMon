import { describe, expect, it } from "vitest";

import type { StatusSource } from "@/infra/supabase/status-source";

import { getObserved, getStationStatuses } from "./station-status";

/** 가짜 DB. 값은 지어낸 것이다. */
const SCEN = [
  {
    scenario_id: "101-apple-main-k3-loam-2026",
    stn_id: "101",
    crop_id: "apple",
  },
  {
    scenario_id: "101-kimchi_cabbage-summer-k1-loam-2026",
    stn_id: "101",
    crop_id: "kimchi_cabbage",
  },
  {
    scenario_id: "216-apple-main-k3-loam-2026",
    stn_id: "216",
    crop_id: "apple",
  },
];
const RUNS = [
  { run_id: 9, stn_id: "101", run_at: "2026-10-25T08:00:00+00:00" },
  { run_id: 7, stn_id: "101", run_at: "2026-10-24T17:00:00+00:00" },
];

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
        { run_id: 9, scenario_id: SCEN[0].scenario_id, status_start: "need" },
        {
          run_id: 7,
          scenario_id: SCEN[0].scenario_id,
          status_start: "caution",
        },
      ]
    ),
    recentBalance: async (s, since) => (
      calls.push(`recentBalance ${s.length} ${since}`),
      [
        {
          scenario_id: SCEN[2].scenario_id,
          date: "2026-10-24",
          status: "normal",
        },
        {
          scenario_id: SCEN[2].scenario_id,
          date: "2026-10-23",
          status: "need",
        },
        {
          scenario_id: SCEN[1].scenario_id,
          date: "2026-10-24",
          status: "dormant",
        },
      ]
    ),
    lastObserved: async () => ({
      date: "2026-10-24",
      fetched_at: "2026-10-24T17:20:00+00:00",
    }),
    ...over,
  };
}
const NOW = () => new Date("2026-10-25T18:00:00+09:00");

describe("getStationStatuses", () => {
  it("지점마다 최신 회차의 출발 상태, 회차가 없으면 마지막 관측 물수지, 둘 다 없으면 null", async () => {
    const calls: string[] = [];
    const s = await getStationStatuses({
      createSource: () => fake({}, calls),
      now: NOW,
    });
    expect(calls).toEqual([
      "defaultScenarios 2026",
      "recentRuns 40",
      "summaries 9 3",
      "recentBalance 3 2026-10-18",
    ]);
    expect(s.apple[101]).toBe("need"); // 17시 회차(9)가 02시(7)보다 새것
    expect(s.apple[216]).toBe("normal"); // 회차 없음 → 마지막 관측일 10/24
    expect(s.cabbage[101]).toBe("dormant"); // 배추는 DB 이름 kimchi_cabbage
    expect(s.apple[119]).toBeNull();
    expect(Object.keys(s.apple)).toHaveLength(10);
  });

  it("DB 를 읽지 못하면 던지지 않고 모두 null", async () => {
    const s = await getStationStatuses({
      createSource: () =>
        fake({ recentRuns: async () => Promise.reject(new Error("timeout")) }),
      now: NOW,
    });
    expect(Object.values(s.apple).every((v) => v === null)).toBe(true);
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
