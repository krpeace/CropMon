/**
 * 화면 구성 화면(`/layout`)의 순서 계산 (이슈 #176, 결정 0058). 저장 규칙(`SavedMenus` v1 · `resolveMenus`, 결정 0046)은
 * 바꾸지 않고, 그 값을 **바꾸는** 쪽의 순수 함수만 둔다: 목록 줄 · 탭 번호 · 구분선 위치, 옮기기, 끄기/켜기, 기본값, 끌어서 놓을 자리,
 * 화면 읽기용 알림 문구. 저장 → 읽기 왕복(`parseSavedMenus` → `resolveMenus`)이 같은 화면이 되는지는 시험이 확인한다.
 */
import {
  DEFAULT_MENU_ORDER,
  MENU_DEFS,
  MENU_IDS,
  MENU_SAVED_VERSION,
  TAB_COUNT,
  type MenuId,
  type SavedMenus,
} from "./menus";

const isMenuId = (id: string): id is MenuId =>
  (MENU_IDS as readonly string[]).includes(id);

/** 저장값(없으면 기본값)의 전체 순서: 저장 순서 + 새 ID 는 끝에, 사라진 ID 는 버림, 중복 없음 (`resolveMenus` 와 같은 규칙). */
function fullOrder(saved: SavedMenus | null): MenuId[] {
  const order: MenuId[] = [];
  for (const id of [...(saved?.order ?? []), ...DEFAULT_MENU_ORDER]) {
    if (isMenuId(id) && !order.includes(id)) order.push(id);
  }
  return order;
}

/** 끈 메뉴 (종합은 절대 안 들어간다). */
function offSet(saved: SavedMenus | null): Set<MenuId> {
  return new Set(
    (saved?.off ?? []).filter(
      (id): id is MenuId => isMenuId(id) && !MENU_DEFS[id].alwaysOn,
    ),
  );
}

/** 저장할 값을 만든다: `order` 에 10개 ID 모두, `off` 에 끈 ID 만(종합 없음), 중복 없음. 판 번호는 올리지 않는다(v1). */
function build(order: readonly MenuId[], off: ReadonlySet<MenuId>): SavedMenus {
  return {
    v: MENU_SAVED_VERSION,
    order: [...order],
    // off 는 order 의 순서대로 적는다(같은 상태가 같은 글자가 되게)
    off: order.filter((id) => off.has(id) && !MENU_DEFS[id].alwaysOn),
  };
}

export type LayoutRow = {
  id: MenuId;
  /** 켬. 끈 줄도 목록에 남는다(다시 켤 수 있어야 하므로). */
  on: boolean;
  /** 하단 탭 번호 1~4(켠 메뉴 위에서 4개). 탭이 아니면 null. */
  tabNo: number | null;
  /** 끌 수 없는 줄(종합 — "항상 사용"). 순서는 바꿀 수 있다. */
  fixed: boolean;
};

export type LayoutModel = {
  rows: LayoutRow[];
  /** "↑ 여기까지 하단 탭 · 아래는 더보기" 구분선을 이 번호의 줄 앞에 그린다. 켠 메뉴가 4개 이하면 null. */
  cutBefore: number | null;
};

/** 설정값(없으면 기본값)에서 화면 구성 목록을 만든다. */
export function layoutModel(saved: SavedMenus | null): LayoutModel {
  const order = fullOrder(saved);
  const off = offSet(saved);
  let tabs = 0;
  let onCount = 0;
  let fourthOnIndex = -1;
  const rows: LayoutRow[] = order.map((id, i) => {
    const on = !off.has(id);
    let tabNo: number | null = null;
    if (on) {
      onCount += 1;
      if (tabs < TAB_COUNT) {
        tabs += 1;
        tabNo = tabs;
        if (tabs === TAB_COUNT) fourthOnIndex = i;
      }
    }
    return { id, on, tabNo, fixed: Boolean(MENU_DEFS[id].alwaysOn) };
  });
  return {
    rows,
    cutBefore: onCount > TAB_COUNT ? fourthOnIndex + 1 : null,
  };
}

/** 목록에서 `id` 를 `toIndex` 번째(0부터) 자리로 옮긴다. 범위 밖은 끝으로 맞추고, 모르는 ID 는 그대로. 종합도 옮겨진다. */
export function moveMenu(
  saved: SavedMenus | null,
  id: MenuId,
  toIndex: number,
): SavedMenus {
  const order = fullOrder(saved);
  const off = offSet(saved);
  const from = order.indexOf(id);
  if (from < 0) return build(order, off);
  const to = Math.max(0, Math.min(order.length - 1, Math.trunc(toIndex)));
  order.splice(from, 1);
  order.splice(to, 0, id);
  return build(order, off);
}

/** 한 칸 위(-1) · 아래(+1)로. 끝에서는 그대로. */
export function moveBy(
  saved: SavedMenus | null,
  id: MenuId,
  delta: number,
): SavedMenus {
  const order = fullOrder(saved);
  const from = order.indexOf(id);
  if (from < 0) return build(order, offSet(saved));
  return moveMenu(saved, id, from + delta);
}

/** 끄기 ↔ 켜기. 종합은 못 끈다. 순서는 건드리지 않는다. */
export function toggleMenu(saved: SavedMenus | null, id: MenuId): SavedMenus {
  const order = fullOrder(saved);
  const off = offSet(saved);
  if (!MENU_DEFS[id]?.alwaysOn) {
    if (off.has(id)) off.delete(id);
    else off.add(id);
  }
  return build(order, off);
}

/** 기본 순서 · 모두 켬이면 null(저장값을 지운다 — 앞으로 기본 순서가 바뀌면 따라가게), 아니면 그 값. */
export function savedOrNull(saved: SavedMenus): SavedMenus | null {
  const order = fullOrder(saved);
  const sameOrder = order.every((id, i) => id === DEFAULT_MENU_ORDER[i]);
  return sameOrder && offSet(saved).size === 0 ? null : saved;
}

/** 끌어서 놓을 자리: 줄 가운데 높이들(`centers`, 끌기 시작 때 잰 값) 가운데 `y` 에 가장 가까운 번호. 같은 거리면 위쪽 줄. */
export function nearestIndex(centers: readonly number[], y: number): number {
  let best = 0;
  for (let i = 1; i < centers.length; i += 1) {
    if (Math.abs(centers[i] - y) < Math.abs(centers[best] - y)) best = i;
  }
  return best;
}

/** 길게 눌러 옮기기: 손가락을 댄 채 버텨야 하는 시간(ms). 이슈 #180, 결정 0060. */
export const LONG_PRESS_MS = 450;
/** 길게 누르는 동안 이만큼(px)까지는 흔들려도 괜찮다. 넘으면 스크롤로 보고 취소한다. */
export const LONG_PRESS_SLOP_PX = 8;

/**
 * 길게 눌러 옮기기를 시작할지 판단한다. **기다리는 동안에만** 쓴다 — 시작한 뒤의 움직임은 끌기라서 이 함수로 취소하지 않는다.
 * - `"cancel"`: 8px 을 넘게 움직였다(시간과 상관없이 — 타이머가 확인하는 순간에 이미 넘었어도 취소). 그냥 화면 스크롤이 된다.
 * - `"start"`: 8px 안에서 0.45초가 지났다(딱 0.45초부터).
 * - `"wait"`: 아직 0.45초 전이고 8px 안이다. 이때 손을 떼면(짧은 탭) 아무 일도 없다.
 * `movedPx` 는 손가락을 댄 곳에서 지금까지의 직선거리. 8px 딱은 "넘지" 않은 것이다.
 */
export function longPressDecision(
  elapsedMs: number,
  movedPx: number,
): "wait" | "start" | "cancel" {
  if (movedPx > LONG_PRESS_SLOP_PX) return "cancel";
  if (elapsedMs >= LONG_PRESS_MS) return "start";
  return "wait";
}

/** 받침이 있으면 "을", 없으면 "를" (한글 마지막 글자 기준). */
function objectParticle(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return "을";
  return code % 28 === 0 ? "를" : "을";
}

/** 화면 읽기용 알림: "물을 2번째로 옮겼어요". `position` 은 1부터. */
export function announceMoved(label: string, position: number): string {
  return `${label}${objectParticle(label)} ${position}번째로 옮겼어요`;
}

/** 화면 읽기용 알림: "물을 껐어요" / "물을 켰어요". */
export function announceToggled(label: string, on: boolean): string {
  return `${label}${objectParticle(label)} ${on ? "켰어요" : "껐어요"}`;
}
