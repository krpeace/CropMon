import { describe, expect, it } from "vitest";

import { SOIL_CODES } from "@/domain/selection";
import { STATIONS } from "@/infra/stations";
import type { StatusSource } from "@/infra/supabase/status-source";

import { listRegionPicker } from "./shell";
import { emptyBoard, getStationBoard, statusesOf } from "./station-status";

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
    recentRuns: async (since, ids) => (
      calls.push(`recentRuns ${since} ${ids.length}`),
      RUNS
    ),
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
          filled: false,
        },
        {
          scenario_id: S216,
          date: "2026-10-23",
          status: "need",
          dr_mm: 70,
          filled: false,
        },
        {
          scenario_id: S101,
          date: "2026-10-24",
          status: "caution",
          dr_mm: 50.7,
          filled: false,
        },
        {
          scenario_id: C101,
          date: "2026-10-24",
          status: "dormant",
          dr_mm: null,
          filled: false,
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
    latestSoilWater: async (stnIds) => (
      calls.push(`latestSoilWater ${stnIds.length}`),
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
          filled: false,
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
          filled: false,
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
          filled: false,
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
      "recentRuns 2026-10-22 10",
      "summaries 9 3",
      "recentBalance 3 2026-10-18",
      "outlookDays 9 3",
      "recentWeather 2026-10-18",
      "latestSoilWater 10",
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
      filled: false,
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
      weatherDate: null,
    });
  });

  it("예보가 없는 지점: 최신 관측 물수지, 갱신은 ASOS 받은 시각", async () => {
    const b = await getStationBoard({ createSource: () => fake(), now: NOW });
    expect(b.water.apple[216]).toMatchObject({
      status: "normal",
      drMm: 20.2,
      observedDate: "2026-10-24",
      filled: false,
      forecast: null,
    });
    expect(b.updated[216]).toEqual({
      at: "2026-10-24T17:20:00+00:00",
      runHour: null,
      weatherDate: "2026-10-24",
    });
    expect(b.water.cabbage[101]).toMatchObject({ status: "dormant" });
    expect(b.water.apple[119]).toBeNull();
    expect(b.updated[119]).toBeNull();
  });

  it("filled=true 전파: 물수지(start_date 일치 및 직전 관측 fallback)와 토양수분 filled 를 전달한다", async () => {
    const b = await getStationBoard({
      createSource: () =>
        fake({
          recentBalance: async () => [
            {
              scenario_id: S101,
              date: "2026-10-25",
              status: "caution",
              dr_mm: 52.4,
              filled: true,
            },
            {
              scenario_id: S101,
              date: "2026-10-24",
              status: "caution",
              dr_mm: 50.7,
              filled: false,
            },
            {
              scenario_id: S216,
              date: "2026-10-24",
              status: "normal",
              dr_mm: 20.2,
              filled: true,
            },
          ],
          latestSoilWater: async () => [
            {
              stn_id: "101",
              soil_code: "loam",
              date: "2026-10-24",
              dr_mm: 33.8,
              taw_mm: 65,
              raw_mm: 26,
              aw_pct: 48,
              status: "fair",
              filled: true,
            },
          ],
        }),
      now: NOW,
    });
    expect(b.water.apple[101]?.filled).toBe(true);
    expect(b.water.apple[216]?.filled).toBe(true);
    expect(b.soil.loam[101]?.filled).toBe(true);
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
      filled: false,
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
    expect(statusesOf(b).failed).toBe(true);
  });

  it("정상적인 DB 조회 시 statusesOf 결과의 failed 는 false 이다", async () => {
    const b = await getStationBoard({ createSource: () => fake(), now: NOW });
    expect(b.ok).toBe(true);
    expect(statusesOf(b).failed).toBe(false);
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

describe("토양수분 최신 뷰 (이슈 #82)", () => {
  const repStations = STATIONS.filter((s) => s.isRepresentative);

  it("97곳 × 7일 × 12종 자료가 있어도 판정 표가 대표 10곳 × 12종 = 120줄을 빠짐없이 받는다", async () => {
    let queriedStnIds: string[] = [];

    // 97개 전 지점 × 12토성의 최신 행 mock 데이터 생성 (총 97 * 12 = 1,164행)
    const activeStations = STATIONS.filter((s) => s.isActive);
    const mockAllRows = activeStations.flatMap((stn) =>
      SOIL_CODES.map((soil) => ({
        stn_id: String(stn.id),
        soil_code: soil,
        date: "2026-10-25",
        dr_mm: 20,
        taw_mm: 60,
        raw_mm: 24,
        aw_pct: 66.7,
        status: "fair" as const,
        filled: false,
      })),
    );

    const b = await getStationBoard({
      createSource: () =>
        fake({
          latestSoilWater: async (stnIds) => {
            queriedStnIds = stnIds;
            // 뷰는 대표 지점 ID로 필터링되어 전달되거나, 전 지점이 오더라도 필터링됨
            return mockAllRows.filter((r) => stnIds.includes(r.stn_id));
          },
        }),
      now: NOW,
    });

    // 1. 대표 10곳의 stn_id 목록으로 정확히 질의했는지 확인
    expect(queriedStnIds.sort()).toEqual(
      repStations.map((s) => String(s.id)).sort(),
    );
    expect(queriedStnIds).toHaveLength(10);

    // 2. 대표 10곳 × 12종 = 120개 슬롯이 빠짐없이 채워졌는지 확인
    let filledCount = 0;
    for (const soil of SOIL_CODES) {
      for (const stn of repStations) {
        const val = b.soil[soil][stn.id];
        expect(val).not.toBeNull();
        expect(val?.status).toBe("fair");
        expect(val?.observedDate).toBe("2026-10-25");
        filledCount++;
      }
    }
    expect(filledCount).toBe(120);
  });

  it("7일보다 오래된 줄만 있는 지점은 뷰에서 제외되어 '자료 없음'(null)이 된다", async () => {
    // 대표 지점 중 101번 지점은 7일 전보다 오래되어 뷰(date >= now - 7d)에서 제외됨
    // 나머지 9개 지점은 정상 데이터 존재
    const rowsWithout101 = repStations
      .filter((s) => s.id !== 101)
      .flatMap((stn) =>
        SOIL_CODES.map((soil) => ({
          stn_id: String(stn.id),
          soil_code: soil,
          date: "2026-10-24",
          dr_mm: 15,
          taw_mm: 50,
          raw_mm: 20,
          aw_pct: 70,
          status: "fair" as const,
          filled: false,
        })),
      );

    const b = await getStationBoard({
      createSource: () =>
        fake({
          latestSoilWater: async () => rowsWithout101,
        }),
      now: NOW,
    });

    // 101번 지점은 12개 토성 모두 "자료 없음"(null)이어야 함
    for (const soil of SOIL_CODES) {
      expect(b.soil[soil][101]).toBeNull();
    }

    // 나머지 9개 지점은 12개 토성 모두 정상 채워져 있어야 함 (9 * 12 = 108개)
    for (const stn of repStations.filter((s) => s.id !== 101)) {
      for (const soil of SOIL_CODES) {
        expect(b.soil[soil][stn.id]).not.toBeNull();
      }
    }
  });

  describe("운영 97곳 물 표시 정리 및 지점 필터링 (이슈 #98)", () => {
    const activeStations = STATIONS.filter((s) => s.isActive);
    const repStations = STATIONS.filter((s) => s.isRepresentative);

    it("getStationBoard가 latestSoilWater, recentWeather, recentRuns 세 곳 모두에 지점 목록을 넘긴다", async () => {
      let queriedRunsStnIds: string[] | undefined;
      let queriedRunsSince: string | undefined;
      let queriedWeatherStnIds: string[] | undefined;
      let queriedSoilStnIds: string[] | undefined;

      await getStationBoard({
        stationScope: "active",
        createSource: () =>
          fake({
            recentRuns: async (since, stnIds) => {
              queriedRunsSince = since;
              queriedRunsStnIds = stnIds;
              return RUNS;
            },
            recentWeather: async (_since, stnIds) => {
              queriedWeatherStnIds = stnIds;
              return [];
            },
            latestSoilWater: async (stnIds) => {
              queriedSoilStnIds = stnIds;
              return [];
            },
          }),
        now: NOW,
      });

      // recentRuns는 한국 시각 기준 최근 3일(2026-10-22) 및 운영 97곳
      expect(queriedRunsSince).toBe("2026-10-22");
      expect(queriedRunsStnIds).toBeDefined();
      expect(queriedRunsStnIds).toHaveLength(97);
      expect(queriedRunsStnIds?.sort()).toEqual(
        activeStations.map((s) => String(s.id)).sort(),
      );

      // recentWeather와 latestSoilWater는 운영 97곳
      expect(queriedWeatherStnIds).toBeDefined();
      expect(queriedWeatherStnIds).toHaveLength(97);
      expect(queriedWeatherStnIds?.sort()).toEqual(
        activeStations.map((s) => String(s.id)).sort(),
      );

      expect(queriedSoilStnIds).toBeDefined();
      expect(queriedSoilStnIds).toHaveLength(97);
      expect(queriedSoilStnIds?.sort()).toEqual(
        activeStations.map((s) => String(s.id)).sort(),
      );
    });

    it("stationScope: rep 시에는 대표 10곳으로 지점 목록을 넘긴다", async () => {
      let filteredStnIds: string[] | undefined;
      let queriedSince: string | undefined;

      await getStationBoard({
        stationScope: "rep",
        createSource: () =>
          fake({
            recentRuns: async (since, stnIds) => {
              queriedSince = since;
              filteredStnIds = stnIds;
              return RUNS;
            },
          }),
        now: NOW,
      });

      expect(queriedSince).toBe("2026-10-22");
      expect(filteredStnIds).toEqual(repStations.map((s) => String(s.id)));
    });

    it("stationScope: active 시 97곳의 토양수분(board.soil)과 갱신 시각(board.updated)이 모두 채워진다", async () => {
      const mockSoilRows = activeStations.flatMap((stn) =>
        SOIL_CODES.map((soil) => ({
          stn_id: String(stn.id),
          soil_code: soil,
          date: "2026-10-25",
          dr_mm: 15,
          taw_mm: 60,
          raw_mm: 24,
          aw_pct: 75,
          status: "fair" as const,
          filled: false,
        })),
      );
      const mockWeatherRows = activeStations.map((stn) => ({
        stn_id: String(stn.id),
        date: "2026-10-24",
        fetched_at: "2026-10-24T18:00:00+09:00",
      }));

      const board = await getStationBoard({
        stationScope: "active",
        createSource: () =>
          fake({
            recentWeather: async () => mockWeatherRows,
            latestSoilWater: async () => mockSoilRows,
          }),
        now: NOW,
      });

      // 1. 97곳 모두 board.soil에 키가 있고 채워져 있음
      for (const soil of SOIL_CODES) {
        expect(Object.keys(board.soil[soil])).toHaveLength(97);
        for (const stn of activeStations) {
          expect(board.soil[soil][stn.id]?.status).toBe("fair");
        }
      }

      // 2. 97곳 모두 board.updated에 채워져 있음 (비대표 지점은 runHour: null)
      expect(Object.keys(board.updated)).toHaveLength(97);
      const nonRepStation = activeStations.find((s) => !s.isRepresentative)!;
      expect(board.updated[nonRepStation.id]).toEqual({
        at: "2026-10-24T18:00:00+09:00",
        runHour: null,
        weatherDate: "2026-10-24",
      });

      // 3. statusesOf 결과도 97곳을 모두 포함
      const statuses = statusesOf(board);
      expect(Object.keys(statuses.soil.loam)).toHaveLength(97);
      expect(statuses.soil.loam[nonRepStation.id]).toBe("fair");
    });
  });

  describe("예보 지점 확대(S4) 대비 forecast_runs 밀림 방지 및 최신 회차 보장 (#110)", () => {
    const activeStations = STATIONS.filter((s) => s.isActive);
    const repStations = STATIONS.filter((s) => s.isRepresentative);

    it("97곳 회차가 섞여 있고 비대표 지점 회차가 훨씬 많아도 대표 10곳 최신 회차를 빠짐없이 읽는다", async () => {
      // 비대표 지점(홍천 212 외 다수)의 최신 회차가 대량으로 들어있고,
      // 대표 지점 회차가 뒤쪽에 섞여 있어도 지점별 최신 회차가 정상 반영되어야 함
      const nonRepRuns = activeStations
        .filter((s) => !s.isRepresentative)
        .slice(0, 50)
        .map((s, idx) => ({
          run_id: 200 + idx,
          stn_id: String(s.id),
          run_at: "2026-10-25T08:05:00+00:00", // 10/25 17시 (비대표 지점들이 대량으로 앞섬)
          run_name: "저녁" as const,
          finished_at: "2026-10-25T08:45:00+00:00",
        }));

      // 대표 지점 회차 (약간 이전 시각)
      const repRuns = repStations.map((s, idx) => ({
        run_id: 100 + idx,
        stn_id: String(s.id),
        run_at: "2026-10-25T08:00:00+00:00", // 10/25 17시
        run_name: "저녁" as const,
        finished_at: `2026-10-25T08:42:${String(idx).padStart(2, "0")}+00:00`,
      }));

      // 전체 섞인 회차 (비대표 지점 50개 + 대표 지점 10개)
      const mixedRuns = [...nonRepRuns, ...repRuns];

      const board = await getStationBoard({
        stationScope: "active",
        createSource: () =>
          fake({
            recentRuns: async () => mixedRuns,
          }),
        now: NOW,
      });

      // 1. 대표 10곳의 최신 회차가 빠짐없이 반영됨 (춘천 101 예보 정상)
      expect(board.water.apple[101]).not.toBeNull();
      expect(board.updated[101]).toEqual({
        at: "2026-10-25T08:42:00+00:00",
        runHour: "17",
        weatherDate: null,
      });

      // 2. 비대표 지점 중 예보가 있는 지점(212 등)도 updated에 회차 시각과 runHour가 정상 반영됨
      const sampleNonRep = activeStations.find((s) => !s.isRepresentative)!;
      expect(board.updated[sampleNonRep.id]?.runHour).toBe("17");
      expect(board.updated[sampleNonRep.id]?.at).toBe(
        "2026-10-25T08:45:00+00:00",
      );
    });

    it("최신 회차가 실패·미완료면 직전 회차로 대체되는 기존 동작이 유지된다", async () => {
      // 춘천(101)의 10/25 17시 회차가 실패하여 DB에 없고(또는 미수집),
      // 10/25 02시(아침) 회차만 정상 수집된 상황 시뮬레이션
      const runsWithFallback = [
        {
          run_id: 7,
          stn_id: "101",
          run_at: "2026-10-24T17:00:00+00:00", // 10/25 02시 회차
          run_name: "아침" as const,
          finished_at: "2026-10-24T17:41:00+00:00",
        },
      ];

      const board = await getStationBoard({
        createSource: () =>
          fake({
            recentRuns: async () => runsWithFallback,
          }),
        now: NOW,
      });

      // 최신 회차(17시)가 없으므로 직전 회차(02시, "아침")로 정상 대체되어 runHour="02" 표출
      expect(board.updated[101]).toEqual({
        at: "2026-10-24T17:41:00+00:00",
        runHour: "02",
        weatherDate: null,
      });
      expect(board.water.apple[101]?.forecast).not.toBeNull();
    });

    it("36시간 초과된 오래된 회차는 예보로 쓰지 않고 관측 기준으로 돌린다", async () => {
      // 36시간(1.5일)보다 오래된 회차 (예: 40시간 전 회차)
      const staleRuns = [
        {
          run_id: 1,
          stn_id: "101",
          run_at: "2026-10-23T20:00:00+00:00", // NOW(10/25 18:00 KST = 10/25 09:00 UTC) 기준 37시간 전
          run_name: "아침" as const,
          finished_at: "2026-10-23T20:40:00+00:00",
        },
      ];

      const board = await getStationBoard({
        createSource: () =>
          fake({
            recentRuns: async () => staleRuns,
          }),
        now: NOW,
      });

      // 36시간 초과로 인해 forecast는 null이고 관측 물수지 기준으로 전환됨
      expect(board.water.apple[101]?.forecast).toBeNull();
      expect(board.water.apple[101]?.observedDate).toBe("2026-10-24");
    });
  });
});

describe("대표 밖 지점의 사과·배추 판정 (#138)", () => {
  const rep = STATIONS.filter((s) => s.isRepresentative);
  const active = STATIONS.filter((s) => s.isActive);
  const repIds = rep.map((s) => s.id);
  // 강릉 105·서울 108: 운영 중이지만 대표 10곳 밖. 진도(첨찰산) 175: 폐지라 운영 97곳 밖.
  const byId = (id: number) => STATIONS.find((s) => s.id === id)!;
  const A105 = "105-apple-main-k3-loam-2026";
  const C105 = "105-kimchi_cabbage-summer-k1-loam-2026";
  const A108 = "108-apple-main-k3-loam-2026";
  const C108 = "108-kimchi_cabbage-summer-k1-loam-2026";
  const A175 = "175-apple-main-k3-loam-2026";
  const scen = (id: string, stn: string, crop: string) => ({
    scenario_id: id,
    stn_id: stn,
    crop_id: crop,
    ...season,
  });
  const NON_REP_SCEN = [
    ...SCEN,
    scen(A105, "105", "apple"),
    scen(C105, "105", "kimchi_cabbage"),
    scen(A108, "108", "apple"),
    scen(C108, "108", "kimchi_cabbage"),
    scen(A175, "175", "apple"),
  ];
  const bal = (
    scenario_id: string,
    date: string,
    status: string,
    dr: number,
  ) => ({
    scenario_id,
    date,
    status,
    dr_mm: dr,
    filled: false,
  });
  const NON_REP_BAL = [
    bal(A105, "2026-10-24", "caution", 40),
    bal(A105, "2026-10-23", "need", 70),
    bal(C105, "2026-10-24", "normal", 10),
    bal(A108, "2026-10-24", "need", 66),
    bal(C108, "2026-10-24", "dormant", 0),
    bal(A175, "2026-10-24", "normal", 5),
    bal(S101, "2026-10-24", "caution", 50.7),
  ];
  const source = () =>
    fake({
      defaultScenarios: async () => NON_REP_SCEN,
      recentBalance: async () => NON_REP_BAL,
      summaries: async () => [],
      outlookDays: async () => [],
      recentRuns: async () => [],
    });

  it("전제: 105·108 은 운영 중인 대표 밖 지점, 175 는 운영 97곳 밖이다", () => {
    for (const id of [105, 108]) {
      expect(byId(id)).toMatchObject({
        isRepresentative: false,
        isActive: true,
      });
    }
    expect(byId(175).isActive).toBe(false);
    expect(active).toHaveLength(97);
    expect(rep).toHaveLength(10);
  });

  it("active: 대표 밖 사과·배추 칸이 운영 97곳으로 만들어지고 상태가 채워진다", async () => {
    const board = await getStationBoard({
      stationScope: "active",
      createSource: source,
      now: NOW,
    });
    expect(Object.keys(board.water.apple)).toHaveLength(97);
    expect(Object.keys(board.water.cabbage)).toHaveLength(97);
    // 강릉 105 사과: 회차가 없으니 가장 최근 관측일(10/24) 판정, 예보 없음
    expect(board.water.apple[105]).toMatchObject({
      status: "caution",
      drMm: 40,
      observedDate: "2026-10-24",
      forecast: null,
    });
    expect(board.water.cabbage[105]).toMatchObject({ status: "normal" });
    expect(board.water.apple[108]).toMatchObject({ status: "need" });
    expect(board.water.cabbage[108]).toMatchObject({ status: "dormant" });
  });

  it("active: 대표 10곳의 사과 판정은 그대로다 (대표 밖을 넣어도 달라지지 않는다)", async () => {
    const board = await getStationBoard({
      stationScope: "active",
      createSource: source,
      now: NOW,
    });
    expect(board.water.apple[101]).toMatchObject({ status: "caution" });
  });

  it("active: 시나리오나 판정 줄이 없는 대표 밖 지점은 기존처럼 null(자료 없음)이다", async () => {
    const board = await getStationBoard({
      stationScope: "active",
      createSource: source,
      now: NOW,
    });
    // 홍천 212: 운영 중이지만 위 가짜 DB 에 시나리오가 없다
    expect(byId(212).isActive).toBe(true);
    expect(212 in board.water.apple).toBe(true);
    expect(board.water.apple[212]).toBeNull();
    expect(board.water.cabbage[212]).toBeNull();
    expect(statusesOf(board).apple[212]).toBeNull();
  });

  it("운영 97곳 밖 지점(175)은 줄이 있어도 칸이 없고 '자료 없음'(null)이다", async () => {
    const board = await getStationBoard({
      stationScope: "active",
      createSource: source,
      now: NOW,
    });
    expect(175 in board.water.apple).toBe(false);
    const statuses = statusesOf(board);
    expect(175 in statuses.apple).toBe(false);
    expect(statuses.apple[175] ?? null).toBeNull();
    // 지역 목록(운영 97곳)에도 없다
    const ids = listRegionPicker("apple", statuses, "").sections.flatMap((s) =>
      s.items.map((x) => x.id),
    );
    expect(ids).not.toContain(175);
  });

  it("범위가 rep 인 호출은 사과·배추 칸이 대표 10곳 그대로다 (전국 표 설계 보호)", async () => {
    for (const opts of [{}, { stationScope: "rep" as const }]) {
      const board = await getStationBoard({
        ...opts,
        createSource: source,
        now: NOW,
      });
      expect(Object.keys(board.water.apple).map(Number).sort()).toEqual(
        [...repIds].sort(),
      );
      expect(Object.keys(board.water.cabbage).map(Number).sort()).toEqual(
        [...repIds].sort(),
      );
      // 가짜 DB 에 강릉·서울 줄이 있어도 대표 보드에는 들어오지 않는다
      expect(105 in board.water.apple).toBe(false);
      expect(108 in board.water.cabbage).toBe(false);
      const statuses = statusesOf(board);
      expect(Object.keys(statuses.apple)).toHaveLength(10);
      expect(Object.keys(statuses.cabbage)).toHaveLength(10);
      expect(statuses.apple[101]).toBe("caution");
    }
  });

  it("emptyBoard: 기본은 대표 10곳, 운영 97곳을 넘기면 사과·배추도 97곳 (읽기 실패 폴백 포함)", () => {
    const base = emptyBoard(true);
    expect(Object.keys(base.water.apple)).toHaveLength(10);
    expect(Object.keys(base.water.cabbage)).toHaveLength(10);
    const wide = emptyBoard(false, active, active);
    expect(wide.ok).toBe(false);
    expect(Object.keys(wide.water.apple)).toHaveLength(97);
    expect(Object.keys(wide.water.cabbage)).toHaveLength(97);
    expect(wide.water.apple[105]).toBeNull();
    expect(Object.keys(wide.soil.loam)).toHaveLength(97);
    // 칸 범위를 따로 줄 수도 있다
    const only = emptyBoard(true, rep, rep, active);
    expect(Object.keys(only.water.apple)).toHaveLength(97);
    expect(Object.keys(only.soil.loam)).toHaveLength(10);
  });

  it("선택 줄이 읽는 값(statuses[작물][지점])과 지역 목록 배지·보드 값이 같다", async () => {
    const board = await getStationBoard({
      stationScope: "active",
      createSource: source,
      now: NOW,
    });
    const statuses = statusesOf(board);
    const listed = (crop: "apple" | "cabbage", id: number) =>
      listRegionPicker(crop, statuses, "")
        .sections.flatMap((s) => s.items)
        .find((x) => x.id === id)?.status;
    for (const [crop, id] of [
      ["apple", 105],
      ["cabbage", 105],
      ["apple", 108],
      ["cabbage", 108],
    ] as const) {
      const fromBoard = board.water[crop][id]?.status;
      expect(fromBoard).toBeDefined();
      expect(statuses[crop][id]).toBe(fromBoard);
      expect(listed(crop, id)).toBe(fromBoard);
    }
  });
});
