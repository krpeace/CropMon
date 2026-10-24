import { describe, expect, it } from "vitest";

import { formatKoreanDateTime, koreanClock } from "./datetime";

describe("formatKoreanDateTime", () => {
  it("한국 시간으로 날짜와 시각을 보여 준다", () => {
    expect(formatKoreanDateTime("2026-10-22T06:05:00Z")).toBe(
      "2026년 10월 22일 오후 3:05",
    );
  });

  it("한국 날짜가 바뀌는 시각도 맞게 보여 준다", () => {
    expect(formatKoreanDateTime("2026-10-22T15:30:00Z")).toBe(
      "2026년 10월 23일 오전 12:30",
    );
  });

  it("값이 없거나 읽을 수 없으면 '자료 없음'", () => {
    expect(formatKoreanDateTime(null)).toBe("자료 없음");
    expect(formatKoreanDateTime("잘못된 값")).toBe("자료 없음");
  });
});

describe("koreanClock", () => {
  it("발표·갱신 표시에 쓰는 한국 시각 조각", () => {
    expect(koreanClock("2026-10-24T17:41:09+00:00")).toEqual({
      month: 10,
      day: 25,
      hour: "02",
      minute: "41",
    });
  });

  it("읽을 수 없으면 null", () => {
    expect(koreanClock("잘못된 값")).toBeNull();
  });
});
