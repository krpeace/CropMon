import { describe, expect, it } from "vitest";

import {
  BOTTOM_EDGE,
  FOLD_DOWN,
  INITIAL_FOLD,
  MIN_RANGE,
  nextFold,
  TOP_EDGE,
  UNFOLD_UP,
  type FoldInput,
  type FoldState,
} from "./autohide";

/** 휴대폰 세로 390×844, 문서 높이 3000 (스크롤 거리 2156) 기준. 필요한 값만 덮어쓴다. */
const base: FoldInput = {
  y: 100,
  delta: 0,
  viewportHeight: 844,
  docHeight: 3000,
  width: 390,
  height: 844,
};
const step = (prev: FoldState, over: Partial<FoldInput>) =>
  nextFold(prev, { ...base, ...over });

describe("상수 — 휴대폰에서 바꾸기 쉽게 한곳에", () => {
  it("아래 32 · 위 12 · 맨 위 8 · 맨 아래 8 · 짧은 화면 64", () => {
    expect(FOLD_DOWN).toBe(32);
    expect(UNFOLD_UP).toBe(12);
    expect(TOP_EDGE).toBe(8);
    expect(BOTTOM_EDGE).toBe(8);
    expect(MIN_RANGE).toBe(64);
  });

  it("처음에는 펼침, 누적 0", () => {
    expect(INITIAL_FOLD).toEqual({ folded: false, travel: 0 });
  });
});

describe("접기 — 아래로 32px 을 넘게", () => {
  it("아래로 31 → 펼침 유지", () => {
    const s = step(INITIAL_FOLD, { y: 131, delta: 31 });
    expect(s.folded).toBe(false);
    expect(s.travel).toBe(31);
  });

  it("아래로 32 딱 → 펼침 유지 (넘지 않았다)", () => {
    expect(step(INITIAL_FOLD, { y: 132, delta: 32 }).folded).toBe(false);
  });

  it("아래로 33 → 접힘", () => {
    expect(step(INITIAL_FOLD, { y: 133, delta: 33 }).folded).toBe(true);
  });

  it("여러 번에 나눠 내려도 같은 방향이면 누적한다 (10+10+10 → 펼침, +3 → 접힘)", () => {
    let s = INITIAL_FOLD;
    s = step(s, { y: 110, delta: 10 });
    s = step(s, { y: 120, delta: 10 });
    s = step(s, { y: 130, delta: 10 });
    expect(s).toEqual({ folded: false, travel: 30 });
    s = step(s, { y: 133, delta: 3 });
    expect(s.folded).toBe(true);
  });

  it("움직이지 않았으면(delta 0) 그대로", () => {
    const prev: FoldState = { folded: true, travel: 50 };
    expect(step(prev, { y: 500, delta: 0 })).toEqual(prev);
  });

  it("접힌 채 더 내려도 접힘 유지", () => {
    const s = step({ folded: true, travel: 40 }, { y: 600, delta: 20 });
    expect(s.folded).toBe(true);
    expect(s.travel).toBe(60);
  });
});

describe("펼치기 — 위로 12px 을 넘게", () => {
  const folded: FoldState = { folded: true, travel: 80 };

  it("접힌 상태에서 위로 11 → 접힘 유지", () => {
    const s = step(folded, { y: 489, delta: -11 });
    expect(s.folded).toBe(true);
    expect(s.travel).toBe(-11);
  });

  it("위로 12 딱 → 접힘 유지 (넘지 않았다)", () => {
    expect(step(folded, { y: 488, delta: -12 }).folded).toBe(true);
  });

  it("위로 13 → 펼침", () => {
    expect(step(folded, { y: 487, delta: -13 }).folded).toBe(false);
  });

  it("나눠서 올려도 누적한다 (-11 뒤 -2 → 펼침)", () => {
    let s = step(folded, { y: 489, delta: -11 });
    expect(s.folded).toBe(true);
    s = step(s, { y: 487, delta: -2 });
    expect(s.folded).toBe(false);
  });
});

describe("방향이 바뀌면 누적을 새로 센다", () => {
  it("아래로 30 내리다 위로 5 → 누적이 -5 로 바뀐다 (접히지 않음)", () => {
    let s = step(INITIAL_FOLD, { y: 130, delta: 30 });
    s = step(s, { y: 125, delta: -5 });
    expect(s).toEqual({ folded: false, travel: -5 });
  });

  it("위로 올리다 다시 아래로 내리면 거기서부터 새로 센다 (-5 뒤 +20 → 20)", () => {
    let s: FoldState = { folded: false, travel: -5 };
    s = step(s, { y: 145, delta: 20 });
    expect(s.travel).toBe(20);
    expect(s.folded).toBe(false);
  });

  it("접힌 상태에서 위로 5 올렸다가 다시 아래로 내리면 접힘 유지", () => {
    let s: FoldState = { folded: true, travel: 60 };
    s = step(s, { y: 495, delta: -5 });
    s = step(s, { y: 520, delta: 25 });
    expect(s.folded).toBe(true);
  });
});

describe("맨 위 · 맨 아래 — 늘 펼침", () => {
  it("맨 위 근처(스크롤 위치 ≤ 8)는 늘 펼침, 누적 0", () => {
    expect(step({ folded: true, travel: 90 }, { y: 0, delta: -90 })).toEqual(
      INITIAL_FOLD,
    );
    expect(step({ folded: true, travel: 90 }, { y: 8, delta: -20 })).toEqual(
      INITIAL_FOLD,
    );
  });

  it("맨 위에서 9px 내려오면 가장자리가 아니다 (접힘 유지)", () => {
    expect(step({ folded: true, travel: 90 }, { y: 9, delta: -5 }).folded).toBe(
      true,
    );
  });

  it("맨 아래 근처(끝까지 남은 거리 ≤ 8)는 늘 펼침", () => {
    const range = base.docHeight - base.viewportHeight; // 2156
    expect(step({ folded: true, travel: 90 }, { y: range, delta: 40 })).toEqual(
      INITIAL_FOLD,
    );
    expect(
      step({ folded: true, travel: 90 }, { y: range - 8, delta: 40 }),
    ).toEqual(INITIAL_FOLD);
  });

  it("맨 아래에서 9px 위는 가장자리가 아니다", () => {
    const range = base.docHeight - base.viewportHeight;
    expect(
      step({ folded: true, travel: 90 }, { y: range - 9, delta: 5 }).folded,
    ).toBe(true);
  });
});

describe("고무줄 스크롤 (아이폰 사파리) — 방향으로 잘못 읽지 않는다", () => {
  const range = base.docHeight - base.viewportHeight;

  it("위치가 음수(맨 위에서 튕김) → 펼침, 누적 0", () => {
    expect(step({ folded: true, travel: 90 }, { y: -30, delta: -40 })).toEqual(
      INITIAL_FOLD,
    );
    expect(step(INITIAL_FOLD, { y: -5, delta: 50 })).toEqual(INITIAL_FOLD);
  });

  it("문서 끝을 넘음(맨 아래에서 튕김) → 펼침, 누적 0", () => {
    expect(
      step({ folded: false, travel: 20 }, { y: range + 40, delta: 60 }),
    ).toEqual(INITIAL_FOLD);
    expect(
      step({ folded: true, travel: 90 }, { y: range + 5, delta: -30 }),
    ).toEqual(INITIAL_FOLD);
  });
});

describe("늘 펼침 — 짧은 화면 · 가로 · 데스크톱", () => {
  const big = { y: 300, delta: 200 };

  it("스크롤 거리가 64 미만인 짧은 화면은 늘 펼침", () => {
    // 화면 844, 문서 890 → 스크롤 거리 46
    expect(step(INITIAL_FOLD, { ...big, docHeight: 890 })).toEqual(
      INITIAL_FOLD,
    );
    expect(
      step({ folded: true, travel: 90 }, { ...big, docHeight: 907 }),
    ).toEqual(INITIAL_FOLD); // 63
  });

  it("스크롤 거리가 64 딱이면 짧은 화면이 아니다 (큰 움직임은 접힘)", () => {
    // 문서 908 → 거리 64, y 를 가장자리 밖(32)으로
    const s = step(INITIAL_FOLD, { y: 32, delta: 40, docHeight: 908 });
    expect(s.folded).toBe(true);
  });

  it("가로 모드(폭 > 높이)는 늘 펼침", () => {
    expect(
      step(INITIAL_FOLD, {
        ...big,
        width: 844,
        height: 390,
        viewportHeight: 390,
      }),
    ).toEqual(INITIAL_FOLD);
  });

  it("폭 1024 이상(태블릿 · 데스크톱)은 늘 펼침", () => {
    expect(step(INITIAL_FOLD, { ...big, width: 1024, height: 1366 })).toEqual(
      INITIAL_FOLD,
    );
    expect(step(INITIAL_FOLD, { ...big, width: 1440, height: 900 })).toEqual(
      INITIAL_FOLD,
    );
  });

  it("폭 1023 세로는 접는다", () => {
    expect(
      step(INITIAL_FOLD, { ...big, width: 1023, height: 1366 }).folded,
    ).toBe(true);
  });

  it("접혀 있던 상태에서 화면이 가로로 돌면 펼친다", () => {
    expect(
      step(
        { folded: true, travel: 90 },
        { y: 400, delta: 0, width: 844, height: 390, viewportHeight: 390 },
      ),
    ).toEqual(INITIAL_FOLD);
  });
});
