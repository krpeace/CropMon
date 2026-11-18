/**
 * 아래에서 올라오는 시트의 순수 계산 (이슈 #157, 결정 0050).
 * 화면 부품(BottomSheet)이 보이는 화면(visualViewport)의 값을 읽어 넘기면, 위치 · 최대 높이 · 끌기 판단만 돌려준다.
 * 키보드 · 안전 영역은 브라우저마다 다르게 동작해서 계산을 여기로 빼 두고 단위 시험으로 고정한다.
 */

/** 시트 위로 남기는 덮개의 높이(px). 이 폭만큼은 덮개가 보여 "누르면 닫힘"이 남는다. */
export const SHEET_TOP_GAP = 48;

/** 손잡이 · 머리를 아래로 이 거리(px)를 **넘게** 끌고 놓으면 닫힌다. */
export const SHEET_DRAG_CLOSE = 80;

/** 키보드가 올라온 것으로 보는 아래 가림의 최소치(px). 홈 막대 · 주소창의 1px 안팎 오차는 키보드가 아니다. */
const KEYBOARD_MIN = 1;

export type SheetViewport = {
  /** window.innerHeight (레이아웃 뷰포트 높이) */
  innerHeight: number;
  /** visualViewport.height (보이는 화면 높이) */
  vvHeight: number;
  /** visualViewport.offsetTop (보이는 화면이 레이아웃 뷰포트 위에서 밀린 거리) */
  vvOffsetTop: number;
};

export type SheetLayout = {
  /** 시트 아래 끝을 레이아웃 뷰포트 아래 끝에서 띄우는 거리(px) = 키보드 높이. 없으면 0. */
  bottom: number;
  /** 시트 최대 높이(px) = 보이는 화면 높이 − 위 여백. 넘치면 시트 안에서 스크롤한다. */
  maxHeight: number;
  /** 키보드가 올라와 있다. 켜져 있으면 아래 안전 영역 여백은 쓰지 않는다. */
  keyboardOpen: boolean;
};

/**
 * 보이는 화면 기준 시트 위치와 최대 높이.
 * 아이폰 사파리 · 안드로이드 크롬은 키보드가 올라와도 `fixed bottom-0`(레이아웃 뷰포트 기준)이 키보드 밑에 가려지므로,
 * 키보드 높이(= 레이아웃 뷰포트 아래 끝 − 보이는 화면 아래 끝)만큼 시트를 띄운다.
 */
export function sheetLayout(v: SheetViewport): SheetLayout {
  const bottom = Math.max(0, v.innerHeight - v.vvHeight - v.vvOffsetTop);
  return {
    bottom,
    maxHeight: Math.max(0, v.vvHeight - SHEET_TOP_GAP),
    keyboardOpen: bottom > KEYBOARD_MIN,
  };
}

/** 끄는 동안 시트가 따라 내려간 거리. 위로 끌어도 시트는 올라가지 않는다(0). */
export function dragOffset(dy: number): number {
  return Math.max(0, dy);
}

/** 손을 놓았을 때: 80px 을 넘게 끌었으면 닫고, 아니면 제자리로 돌린다. */
export function dragOutcome(dy: number): "close" | "restore" {
  return dy > SHEET_DRAG_CLOSE ? "close" : "restore";
}
