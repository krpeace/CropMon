import { describe, expect, it } from "vitest";

import { seasonChart, yE } from "./season-chart";

const day = (
  date: string,
  status: "dormant" | "caution",
  dr: number | null,
  rain = 0,
) => ({
  date,
  etoMm: 3,
  etcMm: status === "dormant" ? null : 2,
  rainMm: rain,
  drMm: dr,
  status,
});

describe("seasonChart", () => {
  const rows = [
    day("2026-03-31", "dormant", null, 30),
    day("2026-04-01", "caution", 0),
    day("2026-04-02", "caution", 65),
  ];
  const c = seasonChart(rows, 65, 130, "2026-04-02");

  it("하루 1칸, 휴면기는 회색 구역, 부족한 물은 휴면기에서 끊는다", () => {
    expect(c.n).toBe(3);
    expect(c.off).toBe("M0 0H1V100H0Z");
    expect(c.dr).toBe("M1.5 100.00L2.5 53.00");
    expect(c.etc.startsWith("M1.5")).toBe(true);
  });

  it("비 막대는 위에서 아래로, 60 mm 가 48%", () => {
    expect(c.rain).toBe("M0.1 0h0.8v24.00h-0.8z");
  });

  it("관수 시작점 선과 고른 날 표시, 월 눈금", () => {
    expect(c.rawLine).toBe("M0 53.00H3");
    expect(c.sel).toBe(`${(2.5 / 3) * 100}%`);
    expect(c.months.map((m) => m.label)).toEqual(["3월", "4월"]);
    expect(yE(7.5)).toBe(8);
    // 오늘처럼 작기 자료에 없는 날은 마지막 날에 표시
    expect(seasonChart(rows, 65, 130, "2026-04-03").sel).toBe(c.sel);
  });
});
