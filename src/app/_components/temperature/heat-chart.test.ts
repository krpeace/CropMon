import { describe, expect, it } from "vitest";

import { compareBars, heatChart } from "./heat-chart";

const day = (date: string, cum: number | null, normalCum: number) => ({
  date,
  cum,
  normalCum,
});

describe("heatChart", () => {
  const days = [
    day("2026-01-01", 0, 0),
    day("2026-01-31", 1000, 900),
    day("2026-02-01", 1500, 1200),
    day("2026-02-02", null, 1900),
  ];
  const c = heatChart(days, "2026-02-02");

  it("세로 위쪽 끝은 1,000 단위로 올림 (가장 큰 값의 1.04배)", () => {
    // 1,900 × 1.04 = 1,976 → 2,000
    expect(c.top).toBe(2000);
    expect(c.yTicks).toEqual([
      { t: "0", top: "100%" },
      { t: "1,000", top: "50%" },
      { t: "2,000", top: "0%" },
    ]);
    expect(c.grid).toBe("M0 50.00H4");
  });

  it("올해 선은 값이 있는 날까지만, 평년 선은 끝까지", () => {
    expect(c.year).toBe("M0.5 100.00L1.5 50.00L2.5 25.00");
    expect(c.normal).toBe("M0.5 100.00L1.5 55.00L2.5 40.00L3.5 5.00");
  });

  it("올해 예상 점선은 그리지 않는다 (화면에서 계산하지 않음)", () => {
    expect(c).not.toHaveProperty("projection");
    // 올해 선은 마지막 관측일(2월 1일 = 2.5) 뒤로 이어지지 않는다
    expect(c.year).not.toMatch(/L3\.5/);
  });

  it("오늘 세로선, 월 눈금", () => {
    expect(c.today).toBe(`${(3.5 / 4) * 100}%`);
    expect(c.months).toEqual([
      { label: "1월", left: "0%" },
      { label: "2", left: "50%" },
    ]);
  });

  it("오늘이 표에 없으면 마지막 관측일에 둔다", () => {
    expect(heatChart(days, "2027-01-01").today).toBe(`${(2.5 / 4) * 100}%`);
  });

  it("자료가 비면 그리지 않을 만큼만 돌려준다", () => {
    const e = heatChart([], "2026-02-02");
    expect(e.year).toBe("");
    expect(e.normal).toBe("");
  });
});

describe("compareBars", () => {
  it("시안 눈금: 늦음 4일 · 빠름 8일, 0 은 33.3%", () => {
    const b = compareBars([3, -2, null]);
    expect(b.zero).toBeCloseTo(100 / 3);
    expect(b.bars[0]).toEqual({ left: 100 / 3, width: 3 * (100 / 12) });
    expect(b.bars[1]).toEqual({
      left: 100 / 3 - 2 * (100 / 12),
      width: 2 * (100 / 12),
    });
    expect(b.bars[2]).toBeNull();
  });

  it("가을처럼 날 수가 크면 막대가 칸을 넘지 않게 눈금을 넓힌다", () => {
    const b = compareBars([20, -6]);
    // 늦음 6 + 빠름 20 = 26일
    expect(b.zero).toBeCloseTo((6 / 26) * 100);
    expect(b.bars[0]!.left + b.bars[0]!.width).toBeCloseTo(100);
    expect(b.bars[1]!.left).toBeCloseTo(0);
  });

  it("0일도 얇게 보인다", () => {
    expect(compareBars([0]).bars[0]!.width).toBe(0.8);
  });
});
