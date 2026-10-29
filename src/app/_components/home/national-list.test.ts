import { describe, expect, it } from "vitest";

import {
  heatBar,
  NATIONAL_TAB_DEFAULT,
  parseSavedTab,
  sunBar,
} from "./national-list";

describe("heatBar (온도 막대)", () => {
  it("빠름은 가운데에서 오른쪽으로 하루 2%", () => {
    expect(heatBar(20)).toEqual({ side: "right", pct: 40 });
  });
  it("늦음은 왼쪽으로", () => {
    expect(heatBar(-3)).toEqual({ side: "left", pct: 6 });
  });
  it("0 은 최소 1.5%", () => {
    expect(heatBar(0)?.pct).toBe(1.5);
  });
  it("±40일은 50% 에서 자른다", () => {
    expect(heatBar(40)).toEqual({ side: "right", pct: 50 });
    expect(heatBar(-40)).toEqual({ side: "left", pct: 50 });
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
