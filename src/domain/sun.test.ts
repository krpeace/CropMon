import { describe, expect, it } from "vitest";

import {
  lastMonthNote,
  lowestMonth,
  monthlySun,
  sunPercent,
  sunSummary,
} from "./sun";

describe("sunPercent", () => {
  it("올해 누적 ÷ 평년 누적, 반올림한 %", () => {
    expect(sunPercent(3218, 3352)).toBe(96);
    expect(sunPercent(3660, 3520)).toBe(104);
  });

  it("값이 없거나 평년이 0 이면 null", () => {
    expect(sunPercent(null, 3352)).toBeNull();
    expect(sunPercent(3218, null)).toBeNull();
    expect(sunPercent(3218, 0)).toBeNull();
  });
});

describe("monthlySun", () => {
  const rows = [
    { date: "2026-01-30", rs_day_mj: 8, rs_normal_day_mj: 10 },
    { date: "2026-01-31", rs_day_mj: 8, rs_normal_day_mj: 10 },
    { date: "2026-02-01", rs_day_mj: 12, rs_normal_day_mj: 10 },
    { date: "2026-02-02", rs_day_mj: null, rs_normal_day_mj: 10 },
    { date: "2026-02-03", rs_day_mj: 9, rs_normal_day_mj: 10 },
  ];

  it("달마다 그날 값을 더한다 (마지막 관측일까지만, 빈 날은 건너뜀)", () => {
    expect(monthlySun(rows, "2026-02-02")).toEqual([
      { month: 1, thisYear: 16, normal: 20, pct: 80 },
      { month: 2, thisYear: 12, normal: 20, pct: 60 },
    ]);
  });

  it("평년이 0 인 달은 % 를 비운다", () => {
    expect(
      monthlySun(
        [{ date: "2026-01-01", rs_day_mj: 1, rs_normal_day_mj: 0 }],
        "2026-01-01",
      ),
    ).toEqual([{ month: 1, thisYear: 1, normal: 0, pct: null }]);
  });
});

describe("lowestMonth", () => {
  it("평년 대비가 가장 낮은 달", () => {
    expect(
      lowestMonth([
        { month: 1, thisYear: 9, normal: 10, pct: 90 },
        { month: 3, thisYear: 8.5, normal: 10, pct: 85 },
        { month: 2, thisYear: 9.9, normal: 10, pct: 99 },
      ])?.month,
    ).toBe(3);
  });

  it("고를 달이 없으면 null", () => {
    expect(lowestMonth([])).toBeNull();
    expect(
      lowestMonth([{ month: 1, thisYear: 0, normal: 0, pct: null }]),
    ).toBeNull();
  });
});

describe("sunSummary", () => {
  const low = { month: 3, thisYear: 85, normal: 100, pct: 85 };

  it("시안 문장: 평년과 견준 말 + 가장 적은 달", () => {
    expect(sunSummary(104, low)).toBe(
      "평년보다 조금 많았어요. 3월이 가장 적었어요 (평년의 85%).",
    );
    expect(sunSummary(96, low)).toBe(
      "평년보다 조금 적었어요. 3월이 가장 적었어요 (평년의 85%).",
    );
    expect(sunSummary(100, low)).toBe(
      "평년과 비슷했어요. 3월이 가장 적었어요 (평년의 85%).",
    );
  });

  it("98~102% 는 '비슷', 가장 적은 달이 없으면 앞 문장만", () => {
    expect(sunSummary(98, null)).toBe("평년과 비슷했어요.");
    expect(sunSummary(102, null)).toBe("평년과 비슷했어요.");
    expect(sunSummary(103, null)).toBe("평년보다 조금 많았어요.");
  });
});

describe("lastMonthNote", () => {
  it("'10월은 24일까지'", () => {
    expect(lastMonthNote("2026-10-24")).toBe("10월은 24일까지");
  });
});
