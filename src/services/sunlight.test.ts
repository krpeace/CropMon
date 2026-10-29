import { describe, expect, it } from "vitest";

import type {
  SunLatestRow,
  SunRow,
  SunSource,
} from "@/infra/supabase/sun-source";

import { getSunlightView } from "./sunlight";

/**
 * 가짜 DB. 값은 지어낸 것이다. 오늘 = 2026-10-25 (한국), 마지막 관측일 = 10월 24일.
 * 평년 하루 10 MJ/m², 올해 하루 11 (3월만 8 → 가장 적은 달 80%).
 */
const NOW = () => new Date("2026-10-25T03:00:00Z");
const DAY = 86_400_000;
const iso = (i: number) =>
  new Date(Date.parse("2026-01-01T00:00:00Z") + i * DAY)
    .toISOString()
    .slice(0, 10);

function yearRows(): SunRow[] {
  let cum = 0;
  return Array.from({ length: 365 }, (_, i) => {
    const date = iso(i);
    const observed = date < "2026-10-25";
    const day = observed ? (date.slice(5, 7) === "03" ? 8 : 11) : null;
    if (day != null) cum += day;
    return {
      date,
      rs_day_mj: day,
      rs_cum_mj: observed ? cum : null,
      rs_normal_day_mj: 10,
      rs_normal_cum_mj: 10 * (i + 1),
      normal_from: 2016,
      normal_to: 2025,
      filled: false,
    };
  });
}

const latest = (
  stn_id: string,
  date: string,
  cum: number,
  normal: number,
): SunLatestRow => ({
  stn_id,
  date,
  rs_cum_mj: cum,
  rs_normal_cum_mj: normal,
});

function source(over: Partial<SunSource> = {}): SunSource {
  return {
    year: async () => yearRows(),
    onDate: async () => [
      latest("101", "2026-10-24", 3218, 3352),
      latest("216", "2026-10-24", 3500, 3333),
    ],
    recent: async (ids) =>
      ids.includes("119")
        ? [
            latest("119", "2026-10-22", 3000, 3400),
            latest("119", "2026-10-23", 3351, 3419),
          ]
        : [],
    ...over,
  };
}

const CHUNCHEON = { id: 101, name: "춘천", measuresSunlight: true };
const SEL = { stationId: 101, crop: "apple" as const };
const opts = (over: Partial<SunSource> = {}) => ({
  createSource: () => source(over),
  now: NOW,
});

describe("getSunlightView — 정상", () => {
  it("올해 쌓인 햇빛: 평년 대비 %, 적산일사, 설명 한 줄, 평년 기간", async () => {
    const v = await getSunlightView(SEL, CHUNCHEON, opts());
    expect(v.kind).toBe("data");
    expect(v.problem).toBeNull();
    expect(v.basis).toBe("어제까지 관측 기준");
    // 10월 24일 = 297번째 날. 올해 = 11 × 266 + 8 × 31 = 3,174, 평년 = 2,970
    expect(v.verdict).toBe("올해 햇빛은 평년의 107%");
    expect(v.numbers).toEqual({ thisYear: "3,174", normal: "2,970" });
    expect(v.summary).toBe(
      "평년보다 조금 많았어요. 3월이 가장 적었어요 (평년의 80%).",
    );
    expect(v.normalPeriod).toBe("2016–2025");
  });

  it("월별: 1월 ~ 마지막 관측 달, 막대 위 %, 95% 미만 표시, 마지막 달 설명", async () => {
    const v = await getSunlightView(SEL, CHUNCHEON, opts());
    expect(v.months).toHaveLength(10);
    expect(v.months[0]).toEqual({
      label: "1월",
      thisYear: 341,
      normal: 310,
      pct: "110%",
      low: false,
    });
    expect(v.months[2]).toMatchObject({ label: "3월", pct: "80%", low: true });
    expect(v.monthNote).toBe("10월은 24일까지");
  });

  it("그래프용 날짜별 값: 1년 치, 올해는 어제까지만", async () => {
    const v = await getSunlightView(SEL, CHUNCHEON, opts());
    expect(v.today).toBe("2026-10-25");
    expect(v.days).toHaveLength(365);
    expect(v.days[0]).toEqual({ date: "2026-01-01", cum: 11, normalCum: 10 });
    expect(v.days.find((d) => d.date === "2026-10-25")?.cum).toBeNull();
  });

  it("지역 비교: 10곳, 마지막 관측일 누적의 평년 대비, 없는 지점은 '자료 없음'", async () => {
    const v = await getSunlightView(SEL, CHUNCHEON, opts());
    expect(v.compareProblem).toBeNull();
    expect(v.compare).toHaveLength(10);
    const by = new Map(v.compare.map((r) => [r.name, r]));
    expect(by.get("춘천")).toMatchObject({
      pct: 96,
      text: "96%",
      selected: true,
    });
    // 태백도 DB 에 자료가 있으면 보인다 (measuresSunlight 가 아니라 DB 기준)
    expect(by.get("태백")).toMatchObject({ pct: 105, text: "105%" });
    expect(by.get("수원")).toMatchObject({ pct: 98, text: "98%" });
    expect(by.get("진주")).toMatchObject({ pct: null, text: "자료 없음" });
  });
});

describe("getSunlightView — 재지 않는 지점·실패", () => {
  it("sun_daily 에 그 지점 줄이 없으면 '햇빛을 재지 않는 지점'", async () => {
    const v = await getSunlightView(
      { stationId: 192, crop: "apple" },
      { id: 192, name: "진주", measuresSunlight: true },
      opts({ year: async () => [] }),
    );
    expect(v.kind).toBe("notMeasured");
    expect(v.problem).toBeNull();
    expect(v.compare).toHaveLength(10);
  });

  it("DB 가 오류를 주면 '자료 없음'과 쉬운 이유, 지역 비교는 따로 보인다", async () => {
    const v = await getSunlightView(
      SEL,
      CHUNCHEON,
      opts({
        year: async () => {
          throw new Error("sun_daily 읽기 실패: 가짜 오류");
        },
      }),
    );
    expect(v.kind).toBe("error");
    expect(v.problem).toBe(
      "햇빛 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    );
    expect(v.verdict).toBe("자료 없음");
    expect(v.months).toEqual([]);
    expect(v.days).toEqual([]);
    expect(v.compare).toHaveLength(10);
  });

  it("지역 비교 읽기가 실패해도 위쪽은 보인다", async () => {
    const v = await getSunlightView(
      SEL,
      CHUNCHEON,
      opts({
        onDate: async () => {
          throw new Error("sun_daily 읽기 실패: 가짜 오류");
        },
      }),
    );
    expect(v.kind).toBe("data");
    expect(v.compare).toEqual([]);
    expect(v.compareProblem).toBe("지역 비교 자료를 읽지 못했어요.");
  });

  it("연결 정보가 없어 source 를 만들지 못해도 멈추지 않는다", async () => {
    const v = await getSunlightView(SEL, CHUNCHEON, {
      createSource: () => {
        throw new Error("env");
      },
      now: NOW,
    });
    expect(v.kind).toBe("error");
    expect(v.compareProblem).not.toBeNull();
  });
});
