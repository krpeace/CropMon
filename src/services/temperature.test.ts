import { describe, expect, it } from "vitest";

import { OBSERVED_DATE_COPY } from "@/domain/water-outlook";
import type {
  HeatLatestRow,
  HeatRow,
  HeatSource,
} from "@/infra/supabase/heat-source";

import type { SeriesLookup } from "@/infra/supabase/accum-series";

import { getTemperatureView } from "./temperature";

const OK = (tBaseC: number | null, heatStart: string, sunStart = heatStart) =>
  ({
    kind: "ok",
    heat: tBaseC == null ? null : { tBaseC, cumStartMmdd: heatStart },
    sun: { cumStartMmdd: sunStart },
  }) satisfies SeriesLookup;
/** 사과 (4, 01-01): 지금 화면 작물은 모두 01-01 계열이다. */
const FIND = async () => OK(4, "01-01");

/**
 * 가짜 DB. 값은 지어낸 것이다. 오늘 = 2026-10-25 (한국), 마지막 관측일 = 10월 24일.
 * 평년 누적 = 13 × (1월 1일부터 n번째 날), 올해 누적 = 14 × n (어제까지).
 */
const NOW = () => new Date("2026-10-25T03:00:00Z");
const DAY = 86_400_000;
const iso = (i: number) =>
  new Date(Date.parse("2026-01-01T00:00:00Z") + i * DAY)
    .toISOString()
    .slice(0, 10);

function yearRows(lastLead: number | null = 20, scale = 14): HeatRow[] {
  return Array.from({ length: 365 }, (_, i) => {
    const date = iso(i);
    const observed = date < "2026-10-25";
    return {
      date,
      t_base_c: 4,
      gdd_day: observed ? scale : null,
      gdd_cum: observed ? scale * (i + 1) : null,
      gdd_normal_cum: 13 * (i + 1),
      lead_days: date === "2026-10-24" ? lastLead : observed ? 5 : null,
      normal_from: 2016,
      normal_to: 2025,
      filled: false,
    };
  });
}

const latest = (
  stn_id: string,
  date: string,
  gdd_cum: number | null,
  gdd_normal_cum: number | null,
): HeatLatestRow => ({
  stn_id,
  date,
  lead_days: 7, // 화면은 쓰지 않는다 (결정 0032)
  gdd_cum,
  gdd_normal_cum,
});

function source(over: Partial<HeatSource> = {}): HeatSource {
  return {
    year: async () => yearRows(),
    stages: async () => [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000],
    // heat-sun 이 매일 09:20(KST)에 올리는 시각 = 00:20Z (계약 v1.8)
    lastUpdated: async () => "2026-10-25T00:20:05.123+00:00",
    onDate: async () => [
      latest("101", "2026-10-24", 4180, 4000),
      latest("119", "2026-10-24", 3950, 4000),
      latest("216", "2026-10-24", null, 3000),
    ],
    recent: async (ids) =>
      ids.includes("131")
        ? [
            latest("131", "2026-10-22", 3900, 3900),
            latest("131", "2026-10-23", 4005, 4000),
          ]
        : [],
    ...over,
  };
}

const CHUNCHEON = { id: 101, name: "춘천", measuresSunlight: true };
const SEL = { stationId: 101, crop: "apple" as const };

describe("getTemperatureView — 정상", () => {
  it("생육 속도: 평년 대비 ℃ 차이, 숫자 줄, 기준 온도·평년 기간", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source(),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.problem).toBeNull();
    expect(v.basis).toBe("어제까지 관측 기준");
    expect(v.verdict).toBe("평년보다 +297℃");
    // 10월 24일 = 297번째 날: 올해 14 × 297, 평년 13 × 297
    expect(v.numbers).toEqual({
      thisYear: "4,158",
      normal: "3,861",
      diff: "+297",
    });
    expect(v.baseTemp).toBe(4);
    expect(v.normalPeriod).toBe("2016–2025");
  });

  it("마지막 계산 시각(heat_series_daily 올린 시각)과 마지막 관측일을 함께 준다", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source(),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.updatedAt).toBe("2026-10-25T00:20:05.123+00:00");
    expect(v.observedDate).toBe("2026-10-24");
  });

  it("계산 시각만 읽지 못하면 그 값만 null 이고 화면 자료는 그대로다", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () =>
        source({ lastUpdated: async () => Promise.reject(new Error("x")) }),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.updatedAt).toBeNull();
    expect(v.problem).toBeNull();
    expect(v.observedDate).toBe("2026-10-24");
  });

  it("단계 카드: 막 지난 단계와 다음 단계, 올해·평년 도달일", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source(),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.stages).toEqual([
      // 3500 ÷ 14 = 250번째 날(9/7), 3500 ÷ 13 → 270번째 날(9/27)
      {
        title: "적산온도 3,500℃",
        thisYear: "9월 7일",
        normal: "평년 9월 27일",
        reached: true,
        lag: { text: "20일 빠름", tone: "early" },
      },
      {
        title: "적산온도 4,000℃",
        thisYear: "10월 13일",
        normal: "평년 11월 4일",
        reached: true,
        lag: { text: "22일 빠름", tone: "early" },
      },
    ]);
  });

  it("단계 카드 꼬리표: 지연 · 같은 날 · 평년이 못 닿음 · 올해 아직", async () => {
    // 올해 하루 10 (n번째 날 10n), 평년 하루 13: 1300 은 올해 130번째·평년 100번째 날 → 30일 지연
    const slow = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () =>
        source({
          year: async () => yearRows(5, 10),
          stages: async () => [1300, 1500],
        }),
      now: NOW,
      findSeries: FIND,
    });
    expect(slow.stages[0]).toMatchObject({
      thisYear: "5월 10일",
      normal: "평년 4월 10일",
      lag: { text: "30일 지연", tone: "late" },
    });

    // 올해·평년이 같은 값이면 같은 날
    const same = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () =>
        source({
          year: async () => yearRows(0, 13),
          stages: async () => [1300, 1500],
        }),
      now: NOW,
      findSeries: FIND,
    });
    expect(same.stages[0].lag).toEqual({ text: "평년과 같음", tone: "same" });

    // 올해 도달, 평년은 그해 안에 못 닿음 → 꼬리표 없음 (올해 하루 20 → 10/24 에 5,940, 평년 한 해 4,745)
    const only = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () =>
        source({
          year: async () => yearRows(null, 20),
          stages: async () => [5000, 5500],
        }),
      now: NOW,
      findSeries: FIND,
    });
    expect(only.stages[0]).toMatchObject({
      reached: true,
      normal: "평년에는 닿지 않아요",
      lag: null,
    });
  });

  it("아직 닿지 않은 단계는 '아직', 평년에도 닿지 않으면 그렇게 적는다", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source({ stages: async () => [1000, 5000] }),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.stages[1]).toEqual({
      title: "적산온도 5,000℃",
      thisYear: "아직",
      normal: "평년에는 닿지 않아요",
      reached: false,
      lag: null,
    });
  });

  it("그래프용 날짜별 값: 1년 치, 올해는 어제까지만", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source(),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.today).toBe("2026-10-25");
    expect(v.days).toHaveLength(365);
    expect(v.days[0]).toEqual({ date: "2026-01-01", cum: 14, normalCum: 13 });
    expect(v.days.find((d) => d.date === "2026-10-25")?.cum).toBeNull();
  });

  it("지역 비교: 10곳, 어제 값이 없는 지점은 최근 며칠에서 보충, 고른 지점 표시", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source(),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.compareProblem).toBeNull();
    expect(v.compare).toHaveLength(10);
    const by = new Map(v.compare.map((r) => [r.name, r]));
    expect(by.get("춘천")).toMatchObject({
      diff: 180,
      text: "+180℃",
      selected: true,
    });
    expect(by.get("수원")).toMatchObject({
      diff: -50,
      text: "-50℃",
      selected: false,
    });
    expect(by.get("청주")).toMatchObject({ diff: 5, text: "+5℃" });
    expect(by.get("태백")).toMatchObject({ diff: null, text: "자료 없음" });
    expect(by.get("안동")).toMatchObject({ diff: null, text: "자료 없음" });
  });

  it("배추는 kimchi_cabbage 로, 작물 공통은 common 으로 계열을 찾고 사전 단계도 그 작물로 읽는다", async () => {
    const asked: string[] = [];
    await getTemperatureView({ stationId: 101, crop: "cabbage" }, CHUNCHEON, {
      createSource: () =>
        source({
          stages: async (crop) => (asked.push(`단계 ${crop}`), [300, 600]),
        }),
      now: NOW,
      findSeries: async (crop) => (asked.push(`계열 ${crop}`), OK(5, "01-01")),
    });
    expect(new Set(asked)).toEqual(
      new Set(["계열 kimchi_cabbage", "단계 kimchi_cabbage"]),
    );

    const askedCommon: string[] = [];
    await getTemperatureView({ stationId: 101, crop: "common" }, CHUNCHEON, {
      createSource: () =>
        source({
          stages: async (crop) => (askedCommon.push(`단계 ${crop}`), [1000]),
        }),
      now: NOW,
      findSeries: async (crop) => (
        askedCommon.push(`계열 ${crop}`),
        OK(5, "01-01")
      ),
    });
    expect(new Set(askedCommon)).toEqual(
      new Set(["계열 common", "단계 common"]),
    );
  });
});

describe("getTemperatureView — 자료 없음·실패", () => {
  it("올해가 평년보다 많이 높아도 묶음 문구 없이 숫자로 (태백형)", async () => {
    // 올해 하루 20 → 10/24 에 5,940, 평년 13 × 297 = 3,861
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source({ year: async () => yearRows(null, 20) }),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.verdict).toBe("평년보다 +2,079℃");
  });

  it("올해와 평년이 같으면 '평년과 같아요'", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source({ year: async () => yearRows(null, 13) }),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.verdict).toBe("평년과 같아요");
  });

  it("그해 자료가 없으면 이유를 적고 멈추지 않는다 (대표 밖 지점은 대표 지점 안내)", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source({ year: async () => [] }),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.problem).toBe("이 지역·작물의 2026 적산온도가 아직 없어요.");
    expect(v.verdict).toBe("자료 없음");
    expect(v.compare).toHaveLength(10);

    const hongcheon = {
      id: 212,
      name: "홍천",
      sido: "강원",
      isRepresentative: false,
      measuresSunlight: false,
      sunlightMeasured: null,
    };
    const vOut = await getTemperatureView(
      { stationId: 212, crop: "apple" },
      hongcheon,
      {
        createSource: () => source({ year: async () => [] }),
        now: NOW,
        findSeries: FIND,
      },
    );
    expect(vOut.problem).toBe("이 지역·작물의 2026 적산온도가 아직 없어요.");
    expect(vOut.verdict).toBe("자료 없음");
  });

  it("비대표 지점 배추(cabbage)도 물 계산 안내 대신 적산온도 안내를 보여 준다", async () => {
    const hongcheon = {
      id: 212,
      name: "홍천",
      sido: "강원",
      lat: 37.683,
      lon: 127.88,
      altitude: 140,
      isRepresentative: false,
      isActive: true,
      hasForecast: false,
      measuresSunlight: false,
      sunlightMeasured: null,
    };
    const vOut = await getTemperatureView(
      { stationId: 212, crop: "cabbage" },
      hongcheon,
      {
        createSource: () => source({ year: async () => [] }),
        now: NOW,
        findSeries: FIND,
      },
    );
    expect(vOut.problem).toBe("이 지역·작물의 2026 적산온도가 아직 없어요.");
    expect(vOut.verdict).toBe("자료 없음");
  });

  it("작물 공통(common)은 비대표 지점이어도 물 계산 안내 대신 일반 안내를 보여 준다", async () => {
    const hongcheon = {
      id: 212,
      name: "홍천",
      sido: "강원",
      lat: 37.683,
      lon: 127.88,
      altitude: 140,
      isRepresentative: false,
      isActive: true,
      hasForecast: false,
      measuresSunlight: false,
      sunlightMeasured: null,
    };
    const vOut = await getTemperatureView(
      { stationId: 212, crop: "common" },
      hongcheon,
      {
        createSource: () => source({ year: async () => [] }),
        now: NOW,
        findSeries: FIND,
      },
    );
    expect(vOut.problem).toBe("이 지역·작물의 2026 적산온도가 아직 없어요.");
    expect(vOut.verdict).toBe("자료 없음");
  });

  it("DB 가 오류를 주면 '자료 없음'과 쉬운 이유, 지역 비교는 따로 보인다", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () =>
        source({
          year: async () => {
            throw new Error("heat_series_daily 읽기 실패: 가짜 오류");
          },
        }),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.problem).toBe(
      "온도 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    );
    expect(v.failed).toBe(true);
    expect(v.verdict).toBe("자료 없음");
    expect(v.numbers).toBeNull();
    expect(v.stages).toEqual([]);
    expect(v.days).toEqual([]);
    expect(v.compare).toHaveLength(10);
  });

  it("지역 비교 읽기가 실패해도 위쪽은 보인다", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () =>
        source({
          onDate: async () => {
            throw new Error("heat_series_daily 읽기 실패: 가짜 오류");
          },
        }),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.problem).toBeNull();
    expect(v.compare).toEqual([]);
    expect(v.compareProblem).toBe(
      "지역 비교 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    );
  });

  it("연결 정보가 없어 source 를 만들지 못해도 멈추지 않는다", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => {
        throw new Error("env");
      },
      now: NOW,
      findSeries: FIND,
    });
    expect(v.problem).not.toBeNull();
    expect(v.compareProblem).not.toBeNull();
  });
});

describe("지역 비교 적산 기준일 다름 (후보 3 #128 PR 2)", () => {
  it("지점별 날짜가 섞이면 대표 기준일 + 괄호 안내, 예외 지점에만 M/D, 자료 없음은 null", async () => {
    const mixed = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source(),
      now: NOW,
      findSeries: FIND,
    });
    expect(mixed.compareNote).toBe(
      `${OBSERVED_DATE_COPY.yesterdayValue} ${OBSERVED_DATE_COPY.mixedSuffix}`,
    );
    expect(mixed.compare.find((r) => r.id === 101)?.dateTag).toBeNull();
    expect(mixed.compare.find((r) => r.id === 131)?.dateTag).toBe("10/23");
    expect(mixed.compare.find((r) => r.id === 216)?.dateTag).toBeNull();
  });

  it("전원 어제(10-24)면 compareNote 와 dateTag 모두 생략한다", async () => {
    const allYesterday = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () =>
        source({
          recent: async () => [],
        }),
      now: NOW,
      findSeries: FIND,
    });
    expect(allYesterday.compareNote).toBeNull();
    expect(allYesterday.compare.every((r) => r.dateTag === null)).toBe(true);
  });

  it("유효 지점이 모두 같은 과거 날짜면 상단 1줄만 표시하고 괄호 태그는 붙이지 않는다", async () => {
    const allPast = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () =>
        source({
          onDate: async () => [
            latest("101", "2026-10-22", 4100, 3980),
            latest("119", "2026-10-22", 3900, 3980),
            latest("216", "2026-10-22", null, 3000),
          ],
          recent: async () => [],
        }),
      now: NOW,
      findSeries: FIND,
    });
    expect(allPast.compareNote).toBe("10월 22일까지의 값이에요");
    expect(allPast.compare.every((r) => r.dateTag === null)).toBe(true);
  });
});

describe("대표 밖 지점 지역 비교 함께 표시 (#79)", () => {
  const SEOUL = { id: 108, name: "서울", measuresSunlight: true };
  const SEL_SEOUL = { stationId: 108, crop: "apple" as const };
  const REP_NAMES = [
    "춘천",
    "태백",
    "수원",
    "청주",
    "서산",
    "전주",
    "광주",
    "안동",
    "진주",
    "서귀포",
  ];

  it("서울(108)을 고르면 11줄이고, 첫 줄 서울(selected: true) 아래 대표 10곳 순서가 그대로다", async () => {
    const v = await getTemperatureView(SEL_SEOUL, SEOUL, {
      createSource: () =>
        source({
          onDate: async (ids) =>
            ids.includes("108")
              ? [latest("108", "2026-10-24", 4120, 4000)]
              : [
                  latest("101", "2026-10-24", 4180, 4000),
                  latest("119", "2026-10-24", 3950, 4000),
                ],
        }),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.compareProblem).toBeNull();
    expect(v.compare).toHaveLength(11);
    expect(v.compare[0]).toMatchObject({
      id: 108,
      name: "서울",
      selected: true,
      diff: 120,
      text: "+120℃",
      dateTag: null,
    });
    expect(v.compare.slice(1).map((r) => r.name)).toEqual(REP_NAMES);
    expect(v.compare.slice(1).every((r) => !r.selected)).toBe(true);
  });

  it("서울(108) 값이 없으면 첫 줄은 '자료 없음'(diff: null, dateTag: null)이고 대표 10곳은 그대로다", async () => {
    const v = await getTemperatureView(SEL_SEOUL, SEOUL, {
      createSource: () => source(),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.compareProblem).toBeNull();
    expect(v.compare).toHaveLength(11);
    expect(v.compare[0]).toEqual({
      id: 108,
      name: "서울",
      selected: true,
      diff: null,
      text: "자료 없음",
      dateTag: null,
    });
  });

  it("서울(108) 한 곳 읽기만 실패해도 대표 10곳은 보이고 서울 줄만 '자료 없음', compareProblem 은 null", async () => {
    const v = await getTemperatureView(SEL_SEOUL, SEOUL, {
      createSource: () =>
        source({
          onDate: async (ids) => {
            if (ids.length === 1 && ids[0] === "108") {
              throw new Error("timeout");
            }
            return [
              latest("101", "2026-10-24", 4180, 4000),
              latest("119", "2026-10-24", 3950, 4000),
            ];
          },
        }),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.compareProblem).toBeNull();
    expect(v.compare).toHaveLength(11);
    expect(v.compare[0]).toMatchObject({
      id: 108,
      name: "서울",
      selected: true,
      diff: null,
      text: "자료 없음",
      dateTag: null,
    });
    expect(v.compare.find((r) => r.id === 101)).toMatchObject({
      diff: 180,
      text: "+180℃",
    });
  });

  it("compareNote 는 대표 10곳 기준만 쓰고, 고른 지점 줄은 자기 기준일만 표시한다", async () => {
    // 대표 10곳은 모두 어제(10-24), 서울(108)만 10-21일 때: 안내문(compareNote)은 null, 서울 줄에만 10/21
    const v = await getTemperatureView(SEL_SEOUL, SEOUL, {
      createSource: () =>
        source({
          onDate: async (ids) =>
            ids.includes("108")
              ? []
              : [
                  latest("101", "2026-10-24", 4180, 4000),
                  latest("119", "2026-10-24", 3950, 4000),
                ],
          recent: async (ids) =>
            ids.includes("108")
              ? [latest("108", "2026-10-21", 4050, 3980)]
              : [],
        }),
      now: NOW,
      findSeries: FIND,
    });
    expect(v.compareNote).toBeNull();
    expect(v.compare[0]).toMatchObject({ id: 108, dateTag: "10/21" });
    expect(v.compare.slice(1).every((r) => r.dateTag === null)).toBe(true);
  });
});

describe("getTemperatureView — 계열 (결정 0072)", () => {
  const sel = { stationId: 101, crop: "apple" as const };
  const run = (
    find: () => Promise<SeriesLookup>,
    now: Date,
    over: Partial<HeatSource> = {},
  ) =>
    getTemperatureView(sel, CHUNCHEON, {
      createSource: () => source(over),
      findSeries: find,
      now: () => now,
    });

  it("소스에는 작물 번호가 아니라 찾은 계열을 넘긴다", async () => {
    const seen: unknown[] = [];
    await run(async () => OK(4.0, "01-01"), NOW(), {
      year: async (_s, series) => (seen.push(series), yearRows()),
      onDate: async (_i, series) => (seen.push(series), []),
    });
    expect(seen.length).toBeGreaterThan(0);
    for (const x of seen)
      expect(x).toEqual({ tBaseC: 4, cumStartMmdd: "01-01" });
  });

  // 포도 비가림 (10, 04-20) 기준
  const GRAPE = async () => OK(10, "04-20");
  const empty = { year: async () => [], onDate: async () => [] };

  it("작기 전: 시작일(04-20)보다 앞선 날은 줄이 없어도 '작기 전'이다 (04-19)", async () => {
    const v = await run(GRAPE, new Date("2026-04-19T03:00:00Z"), empty);
    expect(v.status).toBe("beforeSeason");
    expect(v.failed).toBe(false);
  });

  it("작기 전: 줄이 있어도(평년 값만) 시작일 앞이면 '작기 전'이다", async () => {
    const v = await run(GRAPE, new Date("2026-04-19T03:00:00Z"));
    expect(v.status).toBe("beforeSeason");
  });

  it("시작일(04-20) 당일 · 줄 있음 → 정상", async () => {
    const v = await run(GRAPE, new Date("2026-04-20T03:00:00Z"));
    expect(v.status).toBe("ok");
  });

  it("시작일 뒤인데 줄이 없음 → '작기 전'이 아니라 '자료 없음'", async () => {
    const v = await run(GRAPE, new Date("2026-06-01T03:00:00Z"), empty);
    expect(v.status).toBe("noData");
    expect(v.problem).toMatch(/아직 없어요/);
  });

  it("적산온도 안 냄(시설가온, heat null)은 따로 구별하고 DB 를 읽지 않는다", async () => {
    let read = 0;
    const v = await run(async () => OK(null, "01-01"), NOW(), {
      year: async () => (read++, yearRows()),
    });
    expect(v.status).toBe("noHeat");
    expect(read).toBe(0);
  });

  it("작형이 필요한 작물은 추측하지 않고 '작형 필요'", async () => {
    const v = await run(async () => ({ kind: "needSeasonType" }), NOW());
    expect(v.status).toBe("needSeasonType");
  });

  it("계열 뷰를 읽지 못하면 화면이 깨지지 않고 읽기 실패와 같은 '불러오지 못했어요'", async () => {
    const v = await run(
      async () => Promise.reject(new Error("view down")),
      NOW(),
    );
    expect(v.status).toBe("error");
    expect(v.failed).toBe(true);
    expect(v.problem).toMatch(/불러오지 못했어요/);
    expect(v.days).toEqual([]);
  });

  it("정상일 때 status 는 ok", async () => {
    const v = await run(FIND, NOW());
    expect(v.status).toBe("ok");
  });
});
