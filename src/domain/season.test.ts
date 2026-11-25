import { describe, expect, it } from "vitest";

import { isBeforeSeason } from "./season";

describe("isBeforeSeason", () => {
  it("누적 시작일보다 앞선 날만 작기 전이다 (04-20 기준)", () => {
    expect(isBeforeSeason("2026-04-19", "04-20")).toBe(true);
    expect(isBeforeSeason("2026-03-10", "04-20")).toBe(true);
    expect(isBeforeSeason("2026-04-20", "04-20")).toBe(false);
    expect(isBeforeSeason("2026-06-01", "04-20")).toBe(false);
  });
  it("01-01 계열은 1년 내내 작기 전이 아니다", () => {
    expect(isBeforeSeason("2026-01-01", "01-01")).toBe(false);
    expect(isBeforeSeason("2026-12-31", "01-01")).toBe(false);
  });
});
