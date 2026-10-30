import { describe, expect, it } from "vitest";

import {
  heatBar,
  NATIONAL_TAB_DEFAULT,
  parseSavedTab,
  sunBar,
} from "./national-list";

describe("heatBar (온도 막대, ℃ 차이)", () => {
  it("0 은 최소 1.5% (오른쪽)", () => {
    expect(heatBar(0)).toEqual({ side: "right", pct: 1.5 });
  });
  it("앞섬은 가운데에서 오른쪽으로, 300℃ 가 한쪽 끝(50%)", () => {
    expect(heatBar(150)).toEqual({ side: "right", pct: 25 });
    expect(heatBar(300)).toEqual({ side: "right", pct: 50 });
    expect(heatBar(180)).toEqual({ side: "right", pct: 30 });
  });
  it("뒤처짐은 왼쪽으로", () => {
    expect(heatBar(-60)).toEqual({ side: "left", pct: 10 });
  });
  it("300℃ 를 넘으면 50% 에서 자른다", () => {
    expect(heatBar(900)).toEqual({ side: "right", pct: 50 });
    expect(heatBar(-900)).toEqual({ side: "left", pct: 50 });
  });
  it("작은 값은 최소 1.5% 로 보이게 (9℃ 까지), 10℃ 부터는 눈금대로", () => {
    expect(heatBar(-5)).toEqual({ side: "left", pct: 1.5 });
    expect(heatBar(-9)?.pct).toBe(1.5);
    expect(heatBar(-10)?.pct).toBeCloseTo(10 / 6);
  });
  it("값이 없으면 막대 없음", () => {
    expect(heatBar(null)).toBeNull();
  });
});

describe("sunBar (햇빛 막대)", () => {
  it("80% = 0, 120% = 꽉 참", () => {
    expect(sunBar(96)).toBe(40);
    expect(sunBar(105)).toBe(62.5);
  });
  it("3~100% 로 자른다", () => {
    expect(sunBar(70)).toBe(3);
    expect(sunBar(130)).toBe(100);
  });
  it("값이 없으면 null", () => {
    expect(sunBar(null)).toBeNull();
  });
});

describe("parseSavedTab", () => {
  it("네 탭만 읽는다", () => {
    for (const t of ["water", "days", "heat", "sun"]) {
      expect(parseSavedTab(t)).toBe(t);
    }
  });
  it("잘못된 값은 물", () => {
    expect(NATIONAL_TAB_DEFAULT).toBe("water");
    expect(parseSavedTab("blue")).toBe("water");
    expect(parseSavedTab("")).toBe("water");
    expect(parseSavedTab(null)).toBe("water");
  });
});
