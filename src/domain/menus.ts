/**
 * 메뉴 사전과 "저장값 → 보여 줄 메뉴" 규칙 (이슈 #145, 결정 0046).
 * ID 는 기기·계정에 저장되는 값이므로 한 번 정하면 바꾸지 않는다. 이름·주소만 화면용으로 고친다.
 */

export const MENU_IDS = [
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
] as const;

export type MenuId = (typeof MENU_IDS)[number];

/** 휴대폰 상단 맥락 바 가운데에 놓을 것: 작물·지역 캡슐(selection) 또는 화면 제목(title). */
export type MenuContext = "selection" | "title";

export type MenuDef = {
  id: MenuId;
  /** 화면에 쓰는 이름 */
  label: string;
  /** 기존 주소는 바꾸지 않는다 (공유된 링크 유지) */
  href: string;
  /** 지금 쓸 수 있는 메뉴인가. false 면 "준비 중". */
  ready: boolean;
  /**
   * 이 화면의 맥락 종류 (이슈 #155, 결정 0049). 관측 · 시세 · 일지는 원래 품목 칩 · 농장 날짜지만
   * 아직 "준비 중"이라 이번엔 제목만 둔다 — 나중에 이 값만 바꾸면 된다.
   */
  context: MenuContext;
  /** 끌 수 없는 메뉴 (종합) */
  alwaysOn?: true;
};

export const MENU_DEFS: Record<MenuId, MenuDef> = {
  home: {
    id: "home",
    label: "종합",
    href: "/",
    ready: true,
    context: "selection",
    alwaysOn: true,
  },
  water: {
    id: "water",
    label: "물",
    href: "/water",
    ready: true,
    context: "selection",
  },
  temp: {
    id: "temp",
    label: "온도",
    href: "/temperature",
    ready: true,
    context: "selection",
  },
  sun: {
    id: "sun",
    label: "햇빛",
    href: "/sunlight",
    ready: true,
    context: "selection",
  },
  outlook: {
    id: "outlook",
    label: "관측",
    href: "/outlook",
    ready: false,
    context: "title",
  },
  price: {
    id: "price",
    label: "시세",
    href: "/market",
    ready: false,
    context: "title",
  },
  farminfo: {
    id: "farminfo",
    label: "농사정보",
    href: "/farminfo",
    ready: false,
    context: "title",
  },
  pest: {
    id: "pest",
    label: "병해충",
    href: "/pest",
    ready: false,
    context: "title",
  },
  soil: {
    id: "soil",
    label: "토양",
    href: "/soil",
    ready: false,
    context: "selection",
  },
  diary: {
    id: "diary",
    label: "일지",
    href: "/diary",
    ready: false,
    context: "title",
  },
};

/** 저장값이 없을 때의 순서. 데스크톱 메뉴 줄은 저장값과 상관없이 늘 이 순서다. */
export const DEFAULT_MENU_ORDER: readonly MenuId[] = MENU_IDS;

/** 더보기 화면의 주소 (하단 탭 맨 오른쪽 고정, 메뉴 사전에는 없다). */
export const MORE_HREF = "/more";

/** 휴대폰 하단 탭 수 (더보기는 따로 맨 오른쪽에 붙는다). */
export const TAB_COUNT = 4;

/** 기기(localStorage)에 설정값을 기억해 두는 이름. */
export const MENU_STORAGE_KEY = "cropmon-menus";

/** 설정값 판 번호. 모르는 판은 읽지 않고 기본값으로 동작한다. */
export const MENU_SAVED_VERSION = 1;

/**
 * 설정값: 메뉴 ID 순서 + 끈 메뉴 목록.
 * ID 는 사전에서 사라졌을 수 있어 글자 그대로 둔다 (resolveMenus 가 거른다).
 */
export type SavedMenus = {
  v: typeof MENU_SAVED_VERSION;
  order: string[];
  off: string[];
};

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((x) => typeof x === "string");

/** 저장된 글자를 설정값으로 읽는다. 없거나 깨졌거나 모르는 판이면 null (기본값으로 본다). */
export function parseSavedMenus(raw: string | null): SavedMenus | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const { v, order, off } = parsed as Record<string, unknown>;
  if (v !== MENU_SAVED_VERSION) return null;
  if (!isStringArray(order) || !isStringArray(off)) return null;
  return { v: MENU_SAVED_VERSION, order, off };
}

export type ResolvedMenus = {
  /** 하단 탭 (켠 메뉴 가운데 위에서 4개, 적으면 그만큼) */
  tabs: MenuDef[];
  /** 더보기 목록: 켠 메뉴 전부, 종합이 맨 위 */
  more: MenuDef[];
  /** 데스크톱 메뉴 줄: 기본 순서 고정, 끈 메뉴만 뺀다 */
  desktop: MenuDef[];
  /** 끈 메뉴 개수 (종합은 끌 수 없으므로 세지 않는다) */
  hiddenCount: number;
};

const isMenuId = (id: string): id is MenuId =>
  (MENU_IDS as readonly string[]).includes(id);

/**
 * 설정값(없으면 기본값)에서 화면에 그릴 메뉴를 만든다.
 * - 종합은 꺼짐으로 저장돼 있어도 켠 것으로 본다.
 * - 설정값에 없는 새 ID 는 끝에 "켬"으로 붙이고, 사전에서 사라진 ID 는 무시한다.
 */
export function resolveMenus(saved: SavedMenus | null): ResolvedMenus {
  const order: MenuId[] = [];
  for (const id of [...(saved?.order ?? []), ...DEFAULT_MENU_ORDER]) {
    if (isMenuId(id) && !order.includes(id)) order.push(id);
  }
  const off = new Set<MenuId>(
    (saved?.off ?? []).filter(
      (id): id is MenuId => isMenuId(id) && !MENU_DEFS[id].alwaysOn,
    ),
  );

  const on = order.filter((id) => !off.has(id));
  const home = on.filter((id) => MENU_DEFS[id].alwaysOn);
  const rest = on.filter((id) => !MENU_DEFS[id].alwaysOn);

  return {
    tabs: on.slice(0, TAB_COUNT).map((id) => MENU_DEFS[id]),
    more: [...home, ...rest].map((id) => MENU_DEFS[id]),
    desktop: DEFAULT_MENU_ORDER.filter((id) => !off.has(id)).map(
      (id) => MENU_DEFS[id],
    ),
    hiddenCount: off.size,
  };
}

/** 휴대폰 맥락 바의 화면별 모양. 가운데가 캡슐이면 선택 줄, 제목이면 글자(뒤로 화살표가 있을 수 있다). */
export type ScreenContext =
  { kind: "selection" } | { kind: "title"; title: string; back: boolean };

/** 탭 · 메뉴 사전에 없는 화면: 더보기, 그리고 한 번 더 들어간 2단계 화면(내 농장 미리보기 · 글씨 크기). */
const EXTRA_SCREENS: Record<string, ScreenContext> = {
  [MORE_HREF]: { kind: "title", title: "더보기", back: false },
  "/my-farm": { kind: "title", title: "내 농장", back: true },
  "/font-size": { kind: "title", title: "글씨 크기", back: true },
};

/**
 * 주소(pathname) → 맥락 바 가운데 모양. 쿼리 문자열 · 끝의 슬래시는 무시한다.
 * 메뉴 사전 화면은 `context` 를 따르고(제목이면 메뉴 이름), 모르는 주소(404 등)는 지금과 같은 캡슐이다.
 */
export function screenContext(pathname: string): ScreenContext {
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";
  const extra = EXTRA_SCREENS[path];
  if (extra) return extra;
  const def = MENU_IDS.map((id) => MENU_DEFS[id]).find((d) => d.href === path);
  if (!def || def.context === "selection") return { kind: "selection" };
  return { kind: "title", title: def.label, back: false };
}
