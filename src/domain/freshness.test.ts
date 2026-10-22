import { describe, expect, it } from "vitest";

import { getFreshness } from "./freshness";

const NOW = "2026-10-22T12:00:00Z";

describe("getFreshness", () => {
  it("마지막 갱신 시각이 없으면 '자료 없음'이고 멈춘 것으로 본다", () => {
    expect(getFreshness(null, NOW)).toEqual({
      label: "자료 없음",
      isStale: true,
    });
    expect(getFreshness(undefined, NOW)).toEqual({
      label: "자료 없음",
      isStale: true,
    });
    expect(getFreshness("", NOW)).toEqual({
      label: "자료 없음",
      isStale: true,
    });
  });

  it("날짜로 읽을 수 없는 값은 '자료 없음'으로 본다", () => {
    expect(getFreshness("어제", NOW)).toEqual({
      label: "자료 없음",
      isStale: true,
    });
  });

  it("현재 시각을 읽을 수 없으면 '자료 없음'으로 본다", () => {
    expect(getFreshness(NOW, "잘못된 값")).toEqual({
      label: "자료 없음",
      isStale: true,
    });
  });

  it("1분 미만이면 '방금 전'", () => {
    expect(getFreshness(NOW, NOW)).toEqual({
      label: "방금 전",
      isStale: false,
    });
    expect(getFreshness("2026-10-22T11:59:01Z", NOW)).toEqual({
      label: "방금 전",
      isStale: false,
    });
  });

  it("미래 시각이면 '방금 전'", () => {
    expect(getFreshness("2026-10-22T13:00:00Z", NOW)).toEqual({
      label: "방금 전",
      isStale: false,
    });
  });

  it("1시간 미만이면 'N분 전' (분은 버림)", () => {
    expect(getFreshness("2026-10-22T11:59:00Z", NOW).label).toBe("1분 전");
    expect(getFreshness("2026-10-22T11:00:01Z", NOW).label).toBe("59분 전");
  });

  it("1시간 이상이면 'N시간 전' (시간은 버림)", () => {
    expect(getFreshness("2026-10-22T11:00:00Z", NOW).label).toBe("1시간 전");
    expect(getFreshness("2026-10-22T09:30:00Z", NOW).label).toBe("2시간 전");
    expect(getFreshness("2026-10-20T12:00:00Z", NOW).label).toBe("48시간 전");
  });

  it("경과 13시간까지는 정상, 13시간을 넘으면 멈춘 것으로 본다", () => {
    expect(getFreshness("2026-10-21T23:00:00Z", NOW)).toEqual({
      label: "13시간 전",
      isStale: false,
    });
    expect(getFreshness("2026-10-21T22:59:00Z", NOW)).toEqual({
      label: "13시간 전",
      isStale: true,
    });
  });

  it("시간대 표기가 달라도 같은 순간이면 같은 결과", () => {
    expect(getFreshness("2026-10-22T20:30:00+09:00", NOW).label).toBe(
      "30분 전",
    );
  });
});
