import { describe, expect, it } from "vitest";

import { shouldRefreshData, shouldRunRotation } from "./auto-rotate-state";

describe("shouldRunRotation — 종합 화면 자동 순환 실행 조건", () => {
  it("기본 상태(auto 켜짐, visible, 창 닫힘, 대표 지점 안)에서는 실행된다", () => {
    expect(
      shouldRunRotation({
        auto: true,
        visible: true,
        sheet: false,
        popover: false,
        pos: 1,
      }),
    ).toBe(true);
  });

  it("탭이 숨겨지면(visible false) 실행되지 않는다", () => {
    expect(
      shouldRunRotation({
        auto: true,
        visible: false,
        sheet: false,
        popover: false,
        pos: 1,
      }),
    ).toBe(false);
  });

  it("사용자가 자동 전환을 끄면(auto false) 실행되지 않는다", () => {
    expect(
      shouldRunRotation({
        auto: false,
        visible: true,
        sheet: false,
        popover: false,
        pos: 1,
      }),
    ).toBe(false);
  });

  it("시트나 팝오버가 열려 있으면 실행되지 않는다", () => {
    expect(
      shouldRunRotation({
        auto: true,
        visible: true,
        sheet: true,
        popover: false,
        pos: 1,
      }),
    ).toBe(false);
    expect(
      shouldRunRotation({
        auto: true,
        visible: true,
        sheet: false,
        popover: true,
        pos: 1,
      }),
    ).toBe(false);
  });

  it("대표 지점 밖(pos null)이면 실행되지 않는다", () => {
    expect(
      shouldRunRotation({
        auto: true,
        visible: true,
        sheet: false,
        popover: false,
        pos: null,
      }),
    ).toBe(false);
  });
});

describe("shouldRefreshData — 30분 주기 자료 갱신 판정", () => {
  const INTERVAL_MS = 30 * 60 * 1000; // 30분
  const BASE_TIME = 1_000_000_000;

  it("30분이 지나고 탭이 활성화 상태(visible)이면 갱신 대상이다", () => {
    expect(
      shouldRefreshData({
        isHidden: false,
        lastRefreshedAt: BASE_TIME,
        now: BASE_TIME + INTERVAL_MS,
        intervalMs: INTERVAL_MS,
      }),
    ).toBe(true);
  });

  it("30분이 지났더라도 탭이 숨김 상태(hidden)이면 갱신하지 않는다", () => {
    expect(
      shouldRefreshData({
        isHidden: true,
        lastRefreshedAt: BASE_TIME,
        now: BASE_TIME + INTERVAL_MS + 1000,
        intervalMs: INTERVAL_MS,
      }),
    ).toBe(false);
  });

  it("30분이 지나지 않았으면 갱신하지 않는다", () => {
    expect(
      shouldRefreshData({
        isHidden: false,
        lastRefreshedAt: BASE_TIME,
        now: BASE_TIME + INTERVAL_MS - 1000,
        intervalMs: INTERVAL_MS,
      }),
    ).toBe(false);
  });
});
