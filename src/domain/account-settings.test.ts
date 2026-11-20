import { describe, expect, it } from "vitest";

import {
  accountValuesFromRow,
  baseFor,
  canonFont,
  canonLayout,
  canonTheme,
  decideFollow,
  decideLayoutOnLogin,
  decideQuietOnLogin,
  isDefaultFont,
  isDefaultLayout,
  mergeUpdate,
  readBase,
  validateSettingsUpdate,
  withBase,
} from "./account-settings";
import { DEFAULT_MENU_ORDER, type SavedMenus } from "./menus";

const menus = (order: string[], off: string[] = []): SavedMenus => ({
  v: 1,
  order,
  off,
});
const swapped = menus([
  "home",
  "temp",
  "water",
  ...DEFAULT_MENU_ORDER.slice(3),
]);
const waterOff = menus([...DEFAULT_MENU_ORDER], ["water"]);

describe("정규 글자 · 기본값 비교 — 같은 상태는 같은 글자", () => {
  it("메뉴: 기본 순서 · 모두 켬은 null 과 같고 기본값이다", () => {
    expect(canonLayout(null)).toBe(canonLayout(menus([...DEFAULT_MENU_ORDER])));
    expect(isDefaultLayout(null)).toBe(true);
    expect(isDefaultLayout(menus([...DEFAULT_MENU_ORDER]))).toBe(true);
    expect(isDefaultLayout(swapped)).toBe(false);
    expect(isDefaultLayout(waterOff)).toBe(false);
  });

  it("메뉴: 일부 ID 만 적힌 값 · 사라진 ID · 종합을 끈 값도 풀어서 견준다 (resolveMenus 와 같은 규칙)", () => {
    // 앞의 둘만 적어도 나머지는 기본 순서로 이어 붙는다
    expect(canonLayout(menus(["home", "temp"]))).toBe(canonLayout(swapped));
    // 모르는 ID 는 버린다 · 종합은 끌 수 없다
    expect(
      canonLayout(menus([...DEFAULT_MENU_ORDER, "ghost"], ["ghost", "home"])),
    ).toBe(canonLayout(null));
  });

  it("글씨: 기본값은 보통 · 따르기 꺼짐뿐", () => {
    expect(isDefaultFont({ step: "normal", follow: false })).toBe(true);
    expect(isDefaultFont({ step: "large", follow: false })).toBe(false);
    expect(isDefaultFont({ step: "normal", follow: true })).toBe(false);
    expect(canonFont({ step: "large", follow: true })).toBe(
      canonFont({ follow: true, step: "large" }),
    );
  });

  it("테마: 저장한 선택이 없으면 빈 글자(= 휴대폰 설정 따름)", () => {
    expect(canonTheme(null)).toBe("");
    expect(canonTheme("dark")).toBe("dark");
  });
});

describe("accountValuesFromRow — DB 줄 → 거른 값 (비었거나 틀리면 null = 한 번도 저장 안 함)", () => {
  it("올바른 값은 정규 모양으로", () => {
    const v = accountValuesFromRow({
      layout: { v: 1, order: ["home", "temp"], off: [] },
      font_scale: { v: 1, step: "large", follow: true },
      theme: "dark",
    });
    expect(canonLayout(v.layout)).toBe(canonLayout(swapped));
    expect(v.fontScale).toEqual({ step: "large", follow: true });
    expect(v.theme).toBe("dark");
  });

  it("비었거나 모양이 틀리면 칸마다 null", () => {
    for (const row of [
      null,
      undefined,
      {},
      { layout: null, font_scale: null, theme: null },
      { layout: [], font_scale: "x", theme: "blue" },
      {
        layout: { v: 2, order: [], off: [] },
        font_scale: { v: 2, step: "normal", follow: false },
        theme: "",
      },
      {
        layout: { v: 1, order: "home", off: [] },
        font_scale: { v: 1, step: "huge", follow: false },
        theme: 3,
      },
      { font_scale: { v: 1, step: "normal" } },
    ]) {
      expect(accountValuesFromRow(row as never), JSON.stringify(row)).toEqual({
        layout: null,
        fontScale: null,
        theme: null,
      });
    }
  });
});

describe("validateSettingsUpdate — 쓰기 전에 전부 먼저 거른다 (하나라도 틀리면 아무것도 안 씀)", () => {
  const ok = (body: unknown) => validateSettingsUpdate(body);

  it("바뀐 칸만 받고 정규 글자로 만든다", () => {
    expect(ok({ theme: "light" })).toEqual({
      ok: true,
      update: { theme: "light" },
    });
    expect(ok({ fontScale: { v: 1, step: "xlarge", follow: false } })).toEqual({
      ok: true,
      update: { fontScale: { step: "xlarge", follow: false } },
    });
    const r = ok({ layout: { v: 1, order: ["home", "temp"], off: ["temp"] } });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // 정규 모양: order 에 10개 ID 모두, off 는 order 순서대로
      expect(r.update.layout!.order).toHaveLength(DEFAULT_MENU_ORDER.length);
      expect(r.update.layout!.off).toEqual(["temp"]);
    }
  });

  it("셋을 한 번에도 된다", () => {
    const r = ok({
      layout: { v: 1, order: [...DEFAULT_MENU_ORDER], off: [] },
      fontScale: { v: 1, step: "normal", follow: false },
      theme: "dark",
    });
    expect(r.ok).toBe(true);
  });

  it("모르는 칸 · 빈 본문 · 객체가 아닌 값은 거절", () => {
    for (const body of [
      null,
      undefined,
      "x",
      3,
      [],
      {},
      { other: 1 },
      { theme: "dark", extra: true },
    ]) {
      expect(ok(body).ok, JSON.stringify(body)).toBe(false);
    }
  });

  it("틀린 값은 거절 — null 로 지우는 요청도 받지 않는다", () => {
    for (const body of [
      { theme: "blue" },
      { theme: null },
      { theme: "" },
      { fontScale: { v: 1, step: "huge", follow: false } },
      { fontScale: { v: 1, step: "normal" } },
      { fontScale: { v: 2, step: "normal", follow: false } },
      { fontScale: null },
      { layout: { v: 2, order: [], off: [] } },
      { layout: { v: 1, order: "home", off: [] } },
      { layout: { v: 1, order: [1], off: [] } },
      { layout: null },
    ]) {
      expect(ok(body).ok, JSON.stringify(body)).toBe(false);
    }
  });

  it("하나라도 틀리면 전체 거절 (옳은 칸도 안 쓴다)", () => {
    expect(
      ok({ theme: "dark", fontScale: { v: 1, step: "huge", follow: false } })
        .ok,
    ).toBe(false);
  });

  it("너무 큰 메뉴 값(ID 41개 · 41자)은 거절", () => {
    const many = Array.from({ length: 41 }, (_, i) => `m${i}`);
    expect(ok({ layout: { v: 1, order: many, off: [] } }).ok).toBe(false);
    expect(ok({ layout: { v: 1, order: ["x".repeat(41)], off: [] } }).ok).toBe(
      false,
    );
  });
});

describe("decideLayoutOnLogin — 로그인 직후 화면 구성 다섯 갈래 (이슈 #193 2절 표)", () => {
  it("기기 기본값 + 계정 비어 있음 → 아무것도 안 함", () => {
    expect(decideLayoutOnLogin(null, null)).toBe("none");
    expect(decideLayoutOnLogin(menus([...DEFAULT_MENU_ORDER]), null)).toBe(
      "none",
    );
  });
  it("기기 기본값 + 계정 값 있음 → 묻지 않고 계정 값을 씀 (계정도 기본값이면 할 일 없음)", () => {
    expect(decideLayoutOnLogin(null, swapped)).toBe("adopt");
    expect(decideLayoutOnLogin(null, menus([...DEFAULT_MENU_ORDER]))).toBe(
      "none",
    );
  });
  it("기기 다름 + 계정 비어 있음 → 저장할까요 시트", () => {
    expect(decideLayoutOnLogin(swapped, null)).toBe("ask-save");
  });
  it("기기 다름 + 계정과 같음 → 아무것도 안 함 (정규 모양으로 견줌)", () => {
    expect(decideLayoutOnLogin(swapped, menus(["home", "temp"]))).toBe("none");
    expect(decideLayoutOnLogin(swapped, swapped)).toBe("none");
  });
  it("기기 다름 + 계정과 다름 → 충돌형 시트", () => {
    expect(decideLayoutOnLogin(swapped, waterOff)).toBe("ask-conflict");
  });
});

describe("decideQuietOnLogin — 글씨 크기 · 다크 모드는 조용히", () => {
  it("계정 비어 있음: 기기 기본값이면 안 함, 아니면 기기 값을 계정에", () => {
    expect(
      decideQuietOnLogin({
        deviceDefault: true,
        same: false,
        accountNull: true,
      }),
    ).toBe("none");
    expect(
      decideQuietOnLogin({
        deviceDefault: false,
        same: false,
        accountNull: true,
      }),
    ).toBe("push");
  });
  it("계정 값 있음: 같으면 안 함 · 기기 기본값이면 계정 값을 씀 · 기기가 기본값과 다르면 기기 값을 계정에(계정에 다른 값이 있어도)", () => {
    expect(
      decideQuietOnLogin({
        deviceDefault: false,
        same: true,
        accountNull: false,
      }),
    ).toBe("none");
    expect(
      decideQuietOnLogin({
        deviceDefault: true,
        same: false,
        accountNull: false,
      }),
    ).toBe("adopt");
    expect(
      decideQuietOnLogin({
        deviceDefault: false,
        same: false,
        accountNull: false,
      }),
    ).toBe("push");
  });
});

describe("decideFollow — 다른 기기에서 바꾼 값 따라오기: 기기 값이 기준과 같거나 기본값일 때만", () => {
  const f = (o: {
    account: string | null;
    device: string;
    deviceDefault: boolean;
    base: string | null;
  }) => decideFollow(o);

  it("계정이 비어 있으면(한 번도 저장 안 함) 아무것도 안 함", () => {
    expect(
      f({ account: null, device: "A", deviceDefault: false, base: "A" }),
    ).toBe("none");
  });
  it("같으면 기준만 맞춘다(mark)", () => {
    expect(
      f({ account: "A", device: "A", deviceDefault: false, base: null }),
    ).toBe("mark");
  });
  it("기기가 기준과 같으면(이 기기에서 따로 안 바꿈) 계정 값을 쓴다", () => {
    expect(
      f({ account: "B", device: "A", deviceDefault: false, base: "A" }),
    ).toBe("adopt");
  });
  it("기기가 기본값이면 계정 값을 쓴다 (기준이 없어도)", () => {
    expect(
      f({ account: "B", device: "D", deviceDefault: true, base: null }),
    ).toBe("adopt");
  });
  it("기기가 따로 달라졌으면(기준과 다르고 기본값도 아님) 건드리지 않는다 — 시트를 ×로 닫은 기기 값 보호", () => {
    expect(
      f({ account: "B", device: "A", deviceDefault: false, base: "Z" }),
    ).toBe("none");
    expect(
      f({ account: "B", device: "A", deviceDefault: false, base: null }),
    ).toBe("none");
  });
});

describe("기준(base) — 기기에 적는 마지막으로 맞춘 값 (회원 번호 해시와 함께)", () => {
  it("읽기: 같은 회원 해시일 때만 쓰고, 다르거나 깨졌으면 기준 없음", () => {
    const raw = JSON.stringify(withBase({ who: "h1" }, "theme", "dark"));
    expect(readBase(raw, "h1")).toEqual({ who: "h1", theme: "dark" });
    expect(readBase(raw, "h2")).toEqual({ who: "h2" }); // 다른 회원이 같은 기기로 로그인
    for (const bad of [
      null,
      "",
      "x",
      "[]",
      "3",
      JSON.stringify({ theme: "dark" }),
    ]) {
      expect(readBase(bad, "h1"), String(bad)).toEqual({ who: "h1" });
    }
  });

  it("칸 하나만 갈아 끼운다", () => {
    const b1 = withBase({ who: "h" }, "layout", "L");
    const b2 = withBase(b1, "fontScale", "F");
    expect(b2).toEqual({ who: "h", layout: "L", fontScale: "F" });
    expect(baseFor(b2, "layout")).toBe("L");
    expect(baseFor(b2, "theme")).toBeNull();
  });
});

describe("mergeUpdate — 모아 보낼 때 마지막 값만", () => {
  it("같은 칸은 나중 값이 이기고 다른 칸은 합친다", () => {
    expect(mergeUpdate({ theme: "dark" }, { theme: "light" })).toEqual({
      theme: "light",
    });
    expect(
      mergeUpdate(
        { theme: "dark" },
        { fontScale: { step: "large", follow: false } },
      ),
    ).toEqual({ theme: "dark", fontScale: { step: "large", follow: false } });
    expect(mergeUpdate({}, {})).toEqual({});
  });
});
