import { describe, expect, it } from "vitest";

import {
  announceMoved,
  announceToggled,
  layoutModel,
  moveBy,
  moveMenu,
  nearestIndex,
  savedOrNull,
  toggleMenu,
} from "./menus-layout";
import {
  DEFAULT_MENU_ORDER,
  MENU_IDS,
  parseSavedMenus,
  resolveMenus,
  type MenuId,
  type SavedMenus,
} from "./menus";

const ids = (m: { rows: { id: MenuId }[] }) => m.rows.map((r) => r.id);
const DEFAULT: SavedMenus = {
  v: 1,
  order: [...DEFAULT_MENU_ORDER],
  off: [],
};
/** 저장할 값을 글자로 썼다가 읽어 resolveMenus 를 거친다 (저장 → 읽기 왕복). */
const roundTrip = (s: SavedMenus) =>
  resolveMenus(parseSavedMenus(JSON.stringify(s)));

describe("layoutModel — 목록 줄 · 탭 번호 · 구분선", () => {
  it("저장값이 없으면 기본 순서 · 모두 켬 · 탭 1~4(종합 물 온도 햇빛)", () => {
    const m = layoutModel(null);
    expect(ids(m)).toEqual([...MENU_IDS]);
    expect(m.rows.every((r) => r.on)).toBe(true);
    expect(m.rows.map((r) => r.tabNo)).toEqual([
      1,
      2,
      3,
      4,
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("종합만 '항상 사용'(fixed)", () => {
    const m = layoutModel(null);
    expect(m.rows.filter((r) => r.fixed).map((r) => r.id)).toEqual(["home"]);
  });

  it("구분선은 켠 메뉴 넷째 줄 바로 아래(= 다섯째 줄 앞)", () => {
    expect(layoutModel(null).cutBefore).toBe(4);
  });

  it("끈 메뉴도 목록에 남고, 탭 번호와 구분선 계산에서는 빠진다 — 물을 끄면 관측이 탭 4", () => {
    const m = layoutModel(toggleMenu(DEFAULT, "water"));
    expect(m.rows).toHaveLength(10);
    const water = m.rows.find((r) => r.id === "water")!;
    expect(water).toMatchObject({ on: false, tabNo: null });
    expect(
      m.rows.filter((r) => r.tabNo !== null).map((r) => [r.id, r.tabNo]),
    ).toEqual([
      ["home", 1],
      ["temp", 2],
      ["sun", 3],
      ["outlook", 4],
    ]);
    // 넷째 켠 줄(관측) 바로 아래: 목록에서 관측은 5번째(인덱스 4) → 구분선은 인덱스 5 앞
    expect(m.cutBefore).toBe(5);
  });

  it("켠 메뉴가 4개 이하면 구분선이 없다(켠 것 모두가 탭)", () => {
    let s = DEFAULT;
    for (const id of MENU_IDS.slice(4)) s = toggleMenu(s, id); // 종합 물 온도 햇빛만 켬
    const m = layoutModel(s);
    expect(m.rows.filter((r) => r.on)).toHaveLength(4);
    expect(m.cutBefore).toBeNull();
    s = toggleMenu(s, "sun"); // 3개
    expect(layoutModel(s).cutBefore).toBeNull();
  });

  it("켠 메뉴가 정확히 5개일 때 구분선은 다섯째 켠 줄 앞", () => {
    let s = DEFAULT;
    for (const id of MENU_IDS.slice(5)) s = toggleMenu(s, id); // 종합 물 온도 햇빛 관측
    const m = layoutModel(s);
    expect(m.rows.filter((r) => r.on)).toHaveLength(5);
    expect(m.cutBefore).toBe(4);
  });

  it("종합을 옮기면 탭 번호도 따라간다(resolveMenus 그대로)", () => {
    const m = layoutModel(moveMenu(DEFAULT, "home", 2));
    expect(ids(m).slice(0, 4)).toEqual(["water", "temp", "home", "sun"]);
    expect(m.rows.find((r) => r.id === "home")!.tabNo).toBe(3);
  });

  it("저장값에 없는 새 ID 는 끝에, 사라진 ID 는 무시(resolveMenus 와 같은 규칙)", () => {
    const m = layoutModel({ v: 1, order: ["sun", "x-old", "home"], off: [] });
    expect(ids(m).slice(0, 2)).toEqual(["sun", "home"]);
    expect(ids(m)).toHaveLength(10);
    expect(new Set(ids(m)).size).toBe(10);
  });
});

describe("moveMenu · moveBy — 옮기기", () => {
  const first = (s: SavedMenus) => layoutModel(s).rows.map((r) => r.id);

  it("위로 · 아래로 한 칸", () => {
    expect(first(moveBy(DEFAULT, "temp", -1)).slice(0, 3)).toEqual([
      "home",
      "temp",
      "water",
    ]);
    expect(first(moveBy(DEFAULT, "water", 1)).slice(0, 3)).toEqual([
      "home",
      "temp",
      "water",
    ]);
  });

  it("맨 위 · 맨 아래, 종합도 옮겨진다", () => {
    expect(first(moveMenu(DEFAULT, "sun", 0))[0]).toBe("sun");
    expect(first(moveMenu(DEFAULT, "home", 9))[9]).toBe("home");
    expect(first(moveMenu(DEFAULT, "diary", 0))[0]).toBe("diary");
  });

  it("끝에서 더 가지 않는다(맨 위 ▲ · 맨 아래 ▼ 는 그대로)", () => {
    expect(moveBy(DEFAULT, "home", -1)).toEqual(DEFAULT);
    expect(moveBy(DEFAULT, "diary", 1)).toEqual(DEFAULT);
  });

  it("범위 밖 자리는 끝으로 맞춘다 · 모르는 ID 는 그대로", () => {
    expect(first(moveMenu(DEFAULT, "water", -5))[0]).toBe("water");
    expect(first(moveMenu(DEFAULT, "water", 99))[9]).toBe("water");
    expect(moveMenu(DEFAULT, "nope" as MenuId, 3)).toEqual(DEFAULT);
  });

  it("끈 줄도 옮겨지고 끈 상태가 유지된다", () => {
    const off = toggleMenu(DEFAULT, "pest");
    const moved = moveMenu(off, "pest", 1);
    const m = layoutModel(moved);
    expect(m.rows[1]).toMatchObject({ id: "pest", on: false });
  });

  it("옮겨도 order 에는 10개 ID 모두 · 중복 없음", () => {
    const s = moveMenu(moveBy(DEFAULT, "soil", -3), "home", 5);
    expect(s.order).toHaveLength(10);
    expect(new Set(s.order).size).toBe(10);
    expect([...s.order].sort()).toEqual([...MENU_IDS].sort());
  });
});

describe("toggleMenu — 끄기/켜기", () => {
  it("끄고 다시 켠다", () => {
    const off = toggleMenu(DEFAULT, "water");
    expect(off.off).toEqual(["water"]);
    expect(toggleMenu(off, "water").off).toEqual([]);
  });

  it("종합은 못 끈다(저장값에 절대 넣지 않음)", () => {
    expect(toggleMenu(DEFAULT, "home")).toEqual(DEFAULT);
    const messy: SavedMenus = { v: 1, order: [...MENU_IDS], off: ["home"] };
    expect(toggleMenu(messy, "water").off).not.toContain("home");
  });

  it("order 의 순서를 건드리지 않는다", () => {
    const s = moveMenu(DEFAULT, "sun", 0);
    expect(toggleMenu(s, "water").order).toEqual(s.order);
  });
});

describe("저장 → 읽기 왕복: 같은 화면이 된다", () => {
  const cases: [string, SavedMenus][] = [
    ["기본값", DEFAULT],
    ["물 끔", toggleMenu(DEFAULT, "water")],
    ["종합을 3번째로", moveMenu(DEFAULT, "home", 2)],
    [
      "여러 번 바꿈",
      toggleMenu(moveMenu(moveBy(DEFAULT, "diary", -9), "sun", 1), "temp"),
    ],
  ];
  for (const [name, saved] of cases) {
    it(`${name}: 화면이 보여 줄 탭 · 더보기 · 데스크톱이 layoutModel 과 어긋나지 않는다`, () => {
      const r = roundTrip(saved);
      const m = layoutModel(saved);
      expect(r.tabs.map((t) => t.id)).toEqual(
        m.rows.filter((x) => x.tabNo !== null).map((x) => x.id),
      );
      expect(r.hiddenCount).toBe(m.rows.filter((x) => !x.on).length);
      // 더보기: 종합이 맨 위, 켠 메뉴 전부
      expect(r.more).toHaveLength(m.rows.filter((x) => x.on).length);
      expect(r.more[0].id).toBe("home");
      // 데스크톱은 늘 기본 순서(끈 메뉴만 빠짐)
      expect(r.desktop.map((d) => d.id)).toEqual(
        DEFAULT_MENU_ORDER.filter((id) => m.rows.find((x) => x.id === id)!.on),
      );
    });
  }

  it("바꾼 값은 parseSavedMenus 가 그대로 읽는다 (v 1, 같은 값)", () => {
    const s = toggleMenu(moveMenu(DEFAULT, "water", 4), "pest");
    expect(parseSavedMenus(JSON.stringify(s))).toEqual(s);
    expect(s.v).toBe(1);
  });
});

describe("savedOrNull — 기본값이면 저장값을 지운다", () => {
  it("기본 순서 · 모두 켬이면 null(저장값 없음과 같다)", () => {
    expect(savedOrNull(DEFAULT)).toBeNull();
    expect(
      savedOrNull(toggleMenu(toggleMenu(DEFAULT, "water"), "water")),
    ).toBeNull();
  });
  it("하나라도 다르면 그 값 그대로", () => {
    const s = toggleMenu(DEFAULT, "water");
    expect(savedOrNull(s)).toEqual(s);
    const t = moveBy(DEFAULT, "water", 1);
    expect(savedOrNull(t)).toEqual(t);
  });
});

describe("nearestIndex — 끌어서 놓을 자리", () => {
  const centers = [28, 84, 140, 196, 252]; // 줄 가운데 높이

  it("가장 가까운 줄 가운데의 번호", () => {
    expect(nearestIndex(centers, 28)).toBe(0);
    expect(nearestIndex(centers, 100)).toBe(1);
    expect(nearestIndex(centers, 113)).toBe(2); // 84 와 140 의 한가운데보다 140 쪽
    expect(nearestIndex(centers, 112)).toBe(1); // 한가운데(112)는 위쪽 줄로
  });

  it("목록 밖(위 · 아래 끝)으로 나가도 끝 줄로 맞춘다", () => {
    expect(nearestIndex(centers, -500)).toBe(0);
    expect(nearestIndex(centers, 9999)).toBe(4);
  });

  it("줄이 없으면 0", () => {
    expect(nearestIndex([], 10)).toBe(0);
  });
});

describe("알림 문구 (aria-live) — 짧게", () => {
  it("옮겼어요 · 껐어요 · 켰어요", () => {
    expect(announceMoved("물", 2)).toBe("물을 2번째로 옮겼어요");
    expect(announceMoved("온도", 1)).toBe("온도를 1번째로 옮겼어요");
    expect(announceToggled("물", false)).toBe("물을 껐어요");
    expect(announceToggled("물", true)).toBe("물을 켰어요");
  });

  it("받침 있는 이름은 '을', 없는 이름은 '를'", () => {
    expect(announceToggled("종합", false)).toBe("종합을 껐어요"); // 합 → 받침 ㅂ
    expect(announceToggled("시세", false)).toBe("시세를 껐어요");
    expect(announceToggled("일지", false)).toBe("일지를 껐어요");
    expect(announceToggled("병해충", true)).toBe("병해충을 켰어요");
    expect(announceToggled("토양", true)).toBe("토양을 켰어요");
    expect(announceMoved("햇빛", 4)).toBe("햇빛을 4번째로 옮겼어요");
  });
});
