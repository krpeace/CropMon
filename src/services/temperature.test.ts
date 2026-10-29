import { describe, expect, it } from "vitest";

import type {
  HeatLatestRow,
  HeatRow,
  HeatSource,
} from "@/infra/supabase/heat-source";

import { getTemperatureView } from "./temperature";

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
  lead_days: number | null,
): HeatLatestRow => ({
  stn_id,
  date,
  lead_days,
  gdd_cum: 2000,
  gdd_normal_cum: 1900,
});

function source(over: Partial<HeatSource> = {}): HeatSource {
  return {
    year: async () => yearRows(),
    stages: async () => [500, 1000, 1500, 2000, 2500, 3000, 3500, 4000],
    onDate: async () => [
      latest("101", "2026-10-24", 20),
      latest("119", "2026-10-24", 6),
      latest("216", "2026-10-24", null),
    ],
    recent: async (ids) =>
      ids.includes("131")
        ? [latest("131", "2026-10-22", 4), latest("131", "2026-10-23", 5)]
        : [],
    ...over,
  };
}

const CHUNCHEON = { id: 101, name: "춘천", measuresSunlight: true };
const SEL = { stationId: 101, crop: "apple" as const };

describe("getTemperatureView — 정상", () => {
  it("생육 속도: DB 의 lead_days 그대로, 숫자 줄에 차이, 기준 온도·평년 기간", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source(),
      now: NOW,
    });
    expect(v.problem).toBeNull();
    expect(v.basis).toBe("어제까지 관측 기준");
    expect(v.verdict).toBe("평년보다 생육 20일 빠름");
    // 10월 24일 = 297번째 날: 올해 14 × 297, 평년 13 × 297
    expect(v.numbers).toEqual({
      thisYear: "4,158",
      normal: "3,861",
      diff: "+297",
    });
    expect(v.baseTemp).toBe(4);
    expect(v.normalPeriod).toBe("2016–2025");
  });

  it("단계 카드: 막 지난 단계와 다음 단계, 올해·평년 도달일", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source(),
      now: NOW,
    });
    expect(v.stages).toEqual([
      // 3500 ÷ 14 = 250번째 날(9/7), 3500 ÷ 13 → 270번째 날(9/27)
      {
        title: "적산온도 3,500 ℃·일",
        thisYear: "9월 7일",
        normal: "평년 9월 27일",
        reached: true,
      },
      {
        title: "적산온도 4,000 ℃·일",
        thisYear: "10월 13일",
        normal: "평년 11월 4일",
        reached: true,
      },
    ]);
  });

  it("아직 닿지 않은 단계는 '아직', 평년에도 닿지 않으면 그렇게 적는다", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source({ stages: async () => [1000, 5000] }),
      now: NOW,
    });
    expect(v.stages[1]).toEqual({
      title: "적산온도 5,000 ℃·일",
      thisYear: "아직",
      normal: "평년에는 닿지 않아요",
      reached: false,
    });
  });

  it("그래프용 날짜별 값: 1년 치, 올해는 어제까지만", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source(),
      now: NOW,
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
    });
    expect(v.compareProblem).toBeNull();
    expect(v.compare).toHaveLength(10);
    const by = new Map(v.compare.map((r) => [r.name, r]));
    expect(by.get("춘천")).toMatchObject({
      lead: 20,
      text: "+20일",
      selected: true,
    });
    expect(by.get("수원")).toMatchObject({
      lead: 6,
      text: "+6일",
      selected: false,
    });
    expect(by.get("청주")).toMatchObject({ lead: 5, text: "+5일" });
    expect(by.get("태백")).toMatchObject({ lead: null, text: "자료 없음" });
    expect(by.get("안동")).toMatchObject({ lead: null, text: "자료 없음" });
  });

  it("배추는 DB 에서 kimchi_cabbage 로, 작물 공통은 common 으로 묻는다", async () => {
    const asked: string[] = [];
    await getTemperatureView({ stationId: 101, crop: "cabbage" }, CHUNCHEON, {
      createSource: () =>
        source({
          year: async (_s, crop) => (asked.push(crop), yearRows()),
          stages: async (crop) => (asked.push(crop), [300, 600]),
        }),
      now: NOW,
    });
    expect(asked).toEqual(["kimchi_cabbage", "kimchi_cabbage"]);

    const askedCommon: string[] = [];
    await getTemperatureView({ stationId: 101, crop: "common" }, CHUNCHEON, {
      createSource: () =>
        source({
          year: async (_s, crop) => (askedCommon.push(crop), yearRows()),
          stages: async (crop) => (askedCommon.push(crop), [1000, 2000]),
        }),
      now: NOW,
    });
    expect(askedCommon).toEqual(["common", "common"]);
  });
});

describe("getTemperatureView — 자료 없음·실패", () => {
  it("태백형: lead_days 가 비었고 올해 누적이 평년 한 해 합보다 크면", async () => {
    // 올해 하루 20 → 10/24 에 5,940, 평년 한 해 13 × 365 = 4,745
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source({ year: async () => yearRows(null, 20) }),
      now: NOW,
    });
    expect(v.verdict).toBe("평년 한 해 치를 넘었어요");
  });

  it("lead_days 가 비었고 그 밖이면 '자료 없음'", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source({ year: async () => yearRows(null) }),
      now: NOW,
    });
    expect(v.verdict).toBe("자료 없음");
    expect(v.numbers?.thisYear).toBe("4,158");
  });

  it("그해 자료가 없으면 이유를 적고 멈추지 않는다 (대표 밖 지점은 대표 지점 안내)", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => source({ year: async () => [] }),
      now: NOW,
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
      },
    );
    expect(vOut.problem).toBe(
      "이 지점은 아직 물 계산을 하지 않아요. 가까운 대표 지점을 골라 보세요",
    );
    expect(vOut.verdict).toBe("자료 없음");
  });

  it("DB 가 오류를 주면 '자료 없음'과 쉬운 이유, 지역 비교는 따로 보인다", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () =>
        source({
          year: async () => {
            throw new Error("heat_daily 읽기 실패: 가짜 오류");
          },
        }),
      now: NOW,
    });
    expect(v.problem).toBe(
      "온도 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    );
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
            throw new Error("heat_daily 읽기 실패: 가짜 오류");
          },
        }),
      now: NOW,
    });
    expect(v.problem).toBeNull();
    expect(v.compare).toEqual([]);
    expect(v.compareProblem).toBe("지역 비교 자료를 읽지 못했어요.");
  });

  it("연결 정보가 없어 source 를 만들지 못해도 멈추지 않는다", async () => {
    const v = await getTemperatureView(SEL, CHUNCHEON, {
      createSource: () => {
        throw new Error("env");
      },
      now: NOW,
    });
    expect(v.problem).not.toBeNull();
    expect(v.compareProblem).not.toBeNull();
  });
});
