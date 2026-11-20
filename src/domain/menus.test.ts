import { describe, expect, it } from "vitest";

import {
  DEFAULT_MENU_ORDER,
  MENU_DEFS,
  MENU_IDS,
  MENU_STORAGE_KEY,
  parseSavedMenus,
  resolveMenus,
  screenContext,
  type MenuId,
} from "./menus";

const ids = (menus: readonly { id: MenuId }[]) => menus.map((m) => m.id);

describe("메뉴 사전 — 고정 ID 는 저장값이 되므로 바뀌면 안 된다", () => {
  it("ID 10개와 이름·주소·상태가 이슈 #145 표 그대로다", () => {
    expect(MENU_IDS).toEqual([
      "home",
      "water",
      "temp",
      "sun",
      "outlook",
      "price",
      "farminfo",
      "pest",
      "soil",
      "diary",
    ]);
    const row = (id: MenuId) => {
      const d = MENU_DEFS[id];
      return [d.id, d.label, d.href, d.ready];
    };
    expect(MENU_IDS.map(row)).toEqual([
      ["home", "종합", "/", true],
      ["water", "물", "/water", true],
      ["temp", "온도", "/temperature", true],
      ["sun", "햇빛", "/sunlight", true],
      ["outlook", "관측", "/outlook", false],
      ["price", "시세", "/market", false],
      ["farminfo", "농사정보", "/farminfo", false],
      ["pest", "병해충", "/pest", false],
      ["soil", "토양", "/soil", false],
      ["diary", "일지", "/diary", false],
    ]);
  });

  it("끌 수 없는 메뉴는 종합 하나뿐이다", () => {
    expect(MENU_IDS.filter((id) => MENU_DEFS[id].alwaysOn)).toEqual(["home"]);
  });

  it("기본 순서: 종합·물·온도·햇빛·관측·시세·농사정보·병해충·토양·일지", () => {
    expect(DEFAULT_MENU_ORDER.map((id) => MENU_DEFS[id].label)).toEqual([
      "종합",
      "물",
      "온도",
      "햇빛",
      "관측",
      "시세",
      "농사정보",
      "병해충",
      "토양",
      "일지",
    ]);
  });

  it("저장 키는 cropmon-menus", () => {
    expect(MENU_STORAGE_KEY).toBe("cropmon-menus");
  });
});

describe("resolveMenus — 기본값", () => {
  it("저장값이 없으면 기본 순서로, 탭 4개는 종합·물·온도·햇빛", () => {
    const r = resolveMenus(null);
    expect(ids(r.tabs)).toEqual(["home", "water", "temp", "sun"]);
    expect(ids(r.more)).toEqual([...DEFAULT_MENU_ORDER]);
    expect(ids(r.desktop)).toEqual([...DEFAULT_MENU_ORDER]);
    expect(r.hiddenCount).toBe(0);
  });
});

describe("resolveMenus — 끄기", () => {
  it("온도를 끄면 탭·더보기·데스크톱에서 빠지고 관측이 탭 4번이 된다 (준비 중 메뉴도 규칙대로 올라온다)", () => {
    const r = resolveMenus({
      v: 1,
      order: [...DEFAULT_MENU_ORDER],
      off: ["temp"],
    });
    expect(ids(r.tabs)).toEqual(["home", "water", "sun", "outlook"]);
    expect(ids(r.more)).not.toContain("temp");
    expect(ids(r.desktop)).not.toContain("temp");
    expect(r.hiddenCount).toBe(1);
  });

  it("종합이 꺼짐으로 저장돼 있어도 켠 것으로 본다 (숨긴 개수에도 안 센다)", () => {
    const r = resolveMenus({
      v: 1,
      order: [...DEFAULT_MENU_ORDER],
      off: ["home"],
    });
    expect(ids(r.tabs)[0]).toBe("home");
    expect(ids(r.more)[0]).toBe("home");
    expect(ids(r.desktop)[0]).toBe("home");
    expect(r.hiddenCount).toBe(0);
  });

  it("켠 메뉴가 4개보다 적으면 탭도 그만큼이다", () => {
    const off = MENU_IDS.filter((id) => id !== "home" && id !== "water");
    const r = resolveMenus({ v: 1, order: [...DEFAULT_MENU_ORDER], off });
    expect(ids(r.tabs)).toEqual(["home", "water"]);
    expect(r.hiddenCount).toBe(8);
  });

  it("종합만 남기면 탭은 종합 하나", () => {
    const off = MENU_IDS.filter((id) => id !== "home");
    const r = resolveMenus({ v: 1, order: [...DEFAULT_MENU_ORDER], off });
    expect(ids(r.tabs)).toEqual(["home"]);
    expect(ids(r.more)).toEqual(["home"]);
    expect(r.hiddenCount).toBe(9);
  });

  it("같은 ID 를 두 번 꺼도 한 번만 센다", () => {
    const r = resolveMenus({
      v: 1,
      order: [...DEFAULT_MENU_ORDER],
      off: ["temp", "temp"],
    });
    expect(r.hiddenCount).toBe(1);
  });
});

describe("resolveMenus — 순서 바꾸기", () => {
  const order: MenuId[] = [
    "water",
    "sun",
    "home",
    "outlook",
    "temp",
    "price",
    "farminfo",
    "pest",
    "soil",
    "diary",
  ];

  it("휴대폰 탭은 저장된 순서를 따른다 (켠 것 가운데 위에서 4개)", () => {
    const r = resolveMenus({ v: 1, order, off: [] });
    expect(ids(r.tabs)).toEqual(["water", "sun", "home", "outlook"]);
  });

  it("더보기는 저장된 순서를 따르되 종합이 맨 위다", () => {
    const r = resolveMenus({ v: 1, order, off: [] });
    expect(ids(r.more)).toEqual([
      "home",
      "water",
      "sun",
      "outlook",
      "temp",
      "price",
      "farminfo",
      "pest",
      "soil",
      "diary",
    ]);
  });

  it("데스크톱 메뉴 줄은 순서를 바꿔도 기본 순서 그대로, 끈 메뉴만 빠진다", () => {
    const r = resolveMenus({ v: 1, order, off: ["pest"] });
    expect(ids(r.desktop)).toEqual(
      DEFAULT_MENU_ORDER.filter((id) => id !== "pest"),
    );
  });
});

describe("resolveMenus — 사전이 바뀐 경우", () => {
  it("저장값에 없는 새 ID 는 끝에 켠 채로 붙는다", () => {
    const order = DEFAULT_MENU_ORDER.filter((id) => id !== "diary");
    const r = resolveMenus({ v: 1, order, off: [] });
    expect(ids(r.more).at(-1)).toBe("diary");
    expect(ids(r.desktop)).toContain("diary");
    expect(r.hiddenCount).toBe(0);
  });

  it("순서엔 없고 끈 목록에만 있는 ID 는 꺼진 채로 둔다", () => {
    const order = DEFAULT_MENU_ORDER.filter((id) => id !== "diary");
    const r = resolveMenus({ v: 1, order, off: ["diary"] });
    expect(ids(r.more)).not.toContain("diary");
    expect(r.hiddenCount).toBe(1);
  });

  it("사전에서 사라진 ID 는 무시한다 (순서·끈 목록 모두, 개수에도 안 센다)", () => {
    const r = resolveMenus({
      v: 1,
      order: ["gone", ...DEFAULT_MENU_ORDER, "gone2"],
      off: ["gone", "gone3"],
    });
    expect(ids(r.more)).toEqual([...DEFAULT_MENU_ORDER]);
    expect(r.hiddenCount).toBe(0);
  });

  it("순서에 같은 ID 가 두 번 있으면 처음 것만 쓴다", () => {
    const r = resolveMenus({
      v: 1,
      order: ["water", "water", ...DEFAULT_MENU_ORDER],
      off: [],
    });
    expect(ids(r.more)).toEqual([
      "home",
      "water",
      ...DEFAULT_MENU_ORDER.filter((id) => id !== "home" && id !== "water"),
    ]);
  });
});

describe("parseSavedMenus — 기기 저장값 읽기", () => {
  it("올바른 값은 그대로 읽는다", () => {
    expect(
      parseSavedMenus('{"v":1,"order":["home","water"],"off":["temp"]}'),
    ).toEqual({ v: 1, order: ["home", "water"], off: ["temp"] });
  });

  it("값이 없으면 null", () => {
    expect(parseSavedMenus(null)).toBeNull();
    expect(parseSavedMenus("")).toBeNull();
  });

  it("JSON 이 아니거나 모양이 틀리면 null (기본값으로 동작)", () => {
    for (const raw of [
      "not json",
      "[]",
      "null",
      "1",
      '{"v":1}',
      '{"v":1,"order":"home","off":[]}',
      '{"v":1,"order":[],"off":"temp"}',
      '{"v":1,"order":[1,2],"off":[]}',
      '{"v":1,"order":[],"off":[null]}',
    ]) {
      expect(parseSavedMenus(raw), raw).toBeNull();
    }
  });

  it("모르는 판 번호는 null — 읽기만 하고 덮어쓰지 않는다", () => {
    expect(parseSavedMenus('{"v":2,"order":[],"off":[]}')).toBeNull();
    expect(parseSavedMenus('{"order":[],"off":[]}')).toBeNull();
  });
});

describe("맥락 종류 — 휴대폰 상단 맥락 바 가운데에 무엇을 놓나 (이슈 #155)", () => {
  it("종합 · 물 · 온도 · 햇빛 · 토양은 작물·지역 캡슐(selection)", () => {
    for (const id of ["home", "water", "temp", "sun", "soil"] as const) {
      expect(MENU_DEFS[id].context, id).toBe("selection");
    }
  });

  it("관측 · 시세 · 농사정보 · 병해충 · 일지는 제목(title) — 준비 중이라 이번엔 제목만", () => {
    for (const id of [
      "outlook",
      "price",
      "farminfo",
      "pest",
      "diary",
    ] as const) {
      expect(MENU_DEFS[id].context, id).toBe("title");
    }
  });

  it("메뉴 10개 모두 맥락 종류가 있다", () => {
    for (const id of MENU_IDS) {
      expect(["selection", "title"]).toContain(MENU_DEFS[id].context);
    }
  });
});

describe("screenContext(pathname)", () => {
  it("캡슐 다섯 화면", () => {
    for (const path of ["/", "/water", "/temperature", "/sunlight", "/soil"]) {
      expect(screenContext(path), path).toEqual({ kind: "selection" });
    }
  });

  it("제목 화면: 메뉴 이름이 제목, 뒤로 화살표 없음", () => {
    expect(screenContext("/outlook")).toEqual({
      kind: "title",
      title: "관측",
      back: false,
    });
    expect(screenContext("/market")).toEqual({
      kind: "title",
      title: "시세",
      back: false,
    });
    expect(screenContext("/farminfo")).toEqual({
      kind: "title",
      title: "농사정보",
      back: false,
    });
    expect(screenContext("/pest")).toEqual({
      kind: "title",
      title: "병해충",
      back: false,
    });
    expect(screenContext("/diary")).toEqual({
      kind: "title",
      title: "일지",
      back: false,
    });
  });

  it("/more 는 제목 '더보기', 뒤로 없음", () => {
    expect(screenContext("/more")).toEqual({
      kind: "title",
      title: "더보기",
      back: false,
    });
  });

  it("/my-farm 은 제목 '내 농장' + 뒤로 화살표 (탭 · 더보기에서 한 번 더 들어간 화면)", () => {
    expect(screenContext("/my-farm")).toEqual({
      kind: "title",
      title: "내 농장",
      back: true,
    });
  });

  it("/font-size 는 제목 '글씨 크기' + 뒤로 화살표 (더보기에서 한 번 더 들어간 화면)", () => {
    expect(screenContext("/font-size")).toEqual({
      kind: "title",
      title: "글씨 크기",
      back: true,
    });
    expect(screenContext("/font-size?st=101&crop=apple")).toEqual({
      kind: "title",
      title: "글씨 크기",
      back: true,
    });
  });

  it("/terms · /privacy 는 둘 다 제목 '약관' + 뒤로 화살표 (더보기에서 한 번 더 들어간 화면)", () => {
    for (const path of ["/terms", "/privacy", "/terms/", "/privacy?x=1"]) {
      expect(screenContext(path), path).toEqual({
        kind: "title",
        title: "약관",
        back: true,
      });
    }
  });

  it("/layout 은 제목 '화면 구성' + 뒤로 화살표 (더보기에서 한 번 더 들어간 화면)", () => {
    for (const path of ["/layout", "/layout/", "/layout?st=101&crop=apple"]) {
      expect(screenContext(path), path).toEqual({
        kind: "title",
        title: "화면 구성",
        back: true,
      });
    }
  });

  it("/account 는 '회원 정보', /account/withdraw 는 '회원 탈퇴' — 둘 다 뒤로 화살표 (이슈 #195)", () => {
    for (const path of ["/account", "/account/", "/account?x=1"]) {
      expect(screenContext(path), path).toEqual({
        kind: "title",
        title: "회원 정보",
        back: true,
      });
    }
    for (const path of [
      "/account/withdraw",
      "/account/withdraw?withdraw=failed",
    ]) {
      expect(screenContext(path), path).toEqual({
        kind: "title",
        title: "회원 탈퇴",
        back: true,
      });
    }
  });

  it("끝의 슬래시나 쿼리 문자열이 붙어도 같다", () => {
    expect(screenContext("/water/")).toEqual({ kind: "selection" });
    expect(screenContext("/my-farm/")).toEqual({
      kind: "title",
      title: "내 농장",
      back: true,
    });
    expect(screenContext("/more?st=101&crop=apple")).toEqual({
      kind: "title",
      title: "더보기",
      back: false,
    });
  });

  it("모르는 주소(404 등)는 지금과 같은 캡슐", () => {
    expect(screenContext("/없는-쪽")).toEqual({ kind: "selection" });
    expect(screenContext("")).toEqual({ kind: "selection" });
  });
});
