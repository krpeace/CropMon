import { describe, expect, it } from "vitest";

import {
  monthBars,
  sunCompareBar,
  SUN_NORMAL_LINE,
  sunChart,
} from "./sun-chart";

describe("monthBars", () => {
  it("막대 높이는 모든 달 중 가장 큰 값에 맞춘 %", () => {
    expect(
      monthBars([
        { thisYear: 200, normal: 400 },
        { thisYear: 300, normal: 100 },
      ]),
    ).toEqual([
      { thisYear: 50, normal: 100 },
      { thisYear: 75, normal: 25 },
    ]);
  });

  it("값이 모두 0 이면 높이 0", () => {
    expect(monthBars([{ thisYear: 0, normal: 0 }])).toEqual([
      { thisYear: 0, normal: 0 },
    ]);
  });
});

describe("sunCompareBar", () => {
  it("시안 눈금: 85% 가 0, 110% 가 끝, 세로선 100% 는 60%", () => {
    expect(SUN_NORMAL_LINE).toBe(60);
    expect(sunCompareBar(100)).toBe(60);
    expect(sunCompareBar(96)).toBeCloseTo(44);
  });

  it("너무 작거나 크면 칸 안에 붙인다 (최소 3%)", () => {
    expect(sunCompareBar(70)).toBe(3);
    expect(sunCompareBar(130)).toBe(100);
    expect(sunCompareBar(null)).toBe(0);
  });
});

describe("sunChart", () => {
  it("누적 그래프는 온도와 같은 좌표 (올해 실선·평년 점선·오늘·월 눈금, 1,000 단위)", () => {
    const c = sunChart(
      [
        { date: "2026-01-01", cum: 0, normalCum: 0 },
        { date: "2026-01-02", cum: 1500, normalCum: 1900 },
      ],
      "2026-01-02",
    );
    expect(c.top).toBe(2000);
    expect(c.year).toBe("M0.5 100.00L1.5 25.00");
    expect(c.today).toBe("75%");
  });
});
