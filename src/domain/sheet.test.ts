import { describe, expect, it } from "vitest";

import {
  dragOffset,
  dragOutcome,
  SHEET_DRAG_CLOSE,
  SHEET_TOP_GAP,
  sheetLayout,
} from "./sheet";

describe("상수", () => {
  it("위 여백 48px, 끌어서 닫는 기준 80px", () => {
    expect(SHEET_TOP_GAP).toBe(48);
    expect(SHEET_DRAG_CLOSE).toBe(80);
  });
});

describe("sheetLayout — 보이는 화면(visualViewport) 기준 위치와 최대 높이", () => {
  it("키보드가 없으면 시트는 화면 아래 끝(bottom 0), 최대 높이는 화면 높이 − 48", () => {
    expect(
      sheetLayout({ innerHeight: 844, vvHeight: 844, vvOffsetTop: 0 }),
    ).toEqual({
      bottom: 0,
      maxHeight: 796,
      keyboardOpen: false,
    });
  });

  it("키보드가 올라오면(보이는 화면이 줄면) 시트가 키보드 바로 위로 올라온다", () => {
    // 844 중 보이는 화면 544 → 키보드 300
    expect(
      sheetLayout({ innerHeight: 844, vvHeight: 544, vvOffsetTop: 0 }),
    ).toEqual({
      bottom: 300,
      maxHeight: 496,
      keyboardOpen: true,
    });
  });

  it("보이는 화면이 위로 밀려(offsetTop) 있으면 그만큼을 뺀다", () => {
    // 보이는 화면: 위에서 100 ~ 600, 레이아웃 뷰포트 아래 끝은 844 → 시트는 244 위
    expect(
      sheetLayout({ innerHeight: 844, vvHeight: 500, vvOffsetTop: 100 }),
    ).toEqual({
      bottom: 244,
      maxHeight: 452,
      keyboardOpen: true,
    });
  });

  it("보이는 화면이 아주 작아도 음수가 나오지 않는다", () => {
    const l = sheetLayout({ innerHeight: 200, vvHeight: 30, vvOffsetTop: 0 });
    expect(l.maxHeight).toBe(0);
    expect(l.bottom).toBe(170);
  });

  it("보이는 화면이 더 크게 잡혀도(확대 등) bottom 은 0 아래로 가지 않는다", () => {
    const l = sheetLayout({ innerHeight: 700, vvHeight: 800, vvOffsetTop: 0 });
    expect(l.bottom).toBe(0);
    expect(l.keyboardOpen).toBe(false);
  });

  it("1px 안팎의 오차는 키보드로 보지 않는다 (홈 막대 · 주소창 반올림)", () => {
    const l = sheetLayout({
      innerHeight: 844,
      vvHeight: 843.6,
      vvOffsetTop: 0,
    });
    expect(l.keyboardOpen).toBe(false);
    expect(l.bottom).toBeCloseTo(0.4, 5);
  });
});

describe("dragOffset — 끄는 동안 시트가 따라 내려간 거리", () => {
  it("아래로 끈 만큼, 위로 끌면 0 (시트는 위로 올라가지 않는다)", () => {
    expect(dragOffset(55)).toBe(55);
    expect(dragOffset(0)).toBe(0);
    expect(dragOffset(-30)).toBe(0);
  });
});

describe("dragOutcome — 놓았을 때 닫을까, 제자리로 돌릴까", () => {
  it("80px 을 넘으면 닫는다", () => {
    expect(dragOutcome(81)).toBe("close");
    expect(dragOutcome(100)).toBe("close");
    expect(dragOutcome(400)).toBe("close");
  });

  it("80px 까지는 제자리로 (40px 은 안 닫힘, 80 딱은 '넘지' 않았다)", () => {
    expect(dragOutcome(0)).toBe("restore");
    expect(dragOutcome(40)).toBe("restore");
    expect(dragOutcome(80)).toBe("restore");
  });

  it("위로 끈 값(음수)은 제자리로", () => {
    expect(dragOutcome(-100)).toBe("restore");
  });
});
