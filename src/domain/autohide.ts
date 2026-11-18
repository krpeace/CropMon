/**
 * 휴대폰 오토 하이드: 위 바를 접고 탭바를 숨길지 정하는 순수 규칙 (이슈 #159, 결정 0051).
 * 화면 부품(use-auto-fold)이 스크롤 위치 · 움직인 양 · 화면 크기를 읽어 넘기면 "접힘/펼침"만 돌려준다.
 * 아래 상수는 **제안값**이다 — 이 PC에서는 에뮬레이션으로만 봐서, 실제 휴대폰(S26 Ultra · 아이폰 · 카카오톡 인앱)에서
 * 느낌을 보고 이 한곳만 고친다 (전환 0.22초는 tokens.css 의 --fold-duration).
 */

/** 아래로 이 거리(px, 같은 방향 누적)를 **넘게** 내리면 접는다. */
export const FOLD_DOWN = 32;

/** 접힌 상태에서 위로 이 거리(px, 같은 방향 누적)를 **넘게** 올리면 펼친다. */
export const UNFOLD_UP = 12;

/** 맨 위 근처(스크롤 위치 ≤ 이 값, px)는 늘 펼친다. */
export const TOP_EDGE = 8;

/** 맨 아래 근처(끝까지 남은 거리 ≤ 이 값, px)는 늘 펼친다. */
export const BOTTOM_EDGE = 8;

/** 스크롤할 수 있는 거리(문서 높이 − 화면 높이)가 이보다 짧은 화면은 늘 펼친다. */
export const MIN_RANGE = 64;

/** 이 폭(px) 이상(태블릿 · 데스크톱)에는 오토 하이드가 없다 — 데스크톱 셸은 그대로. */
export const DESKTOP_MIN_WIDTH = 1024;

export type FoldState = {
  /** 접혀 있다(위 바 높이 32, 탭바 숨김). */
  folded: boolean;
  /** 같은 방향으로 움직인 누적 거리(px, 아래로 +). 방향이 바뀌면 새로 센다. */
  travel: number;
};

export const INITIAL_FOLD: FoldState = { folded: false, travel: 0 };

export type FoldInput = {
  /** 스크롤 위치 (window.scrollY) */
  y: number;
  /** 이번에 움직인 양 = 지금 위치 − 지난번 위치 (아래로 +) */
  delta: number;
  /** 화면(보이는 영역) 높이 (window.innerHeight) */
  viewportHeight: number;
  /** 문서 높이 (documentElement.scrollHeight) */
  docHeight: number;
  /** 화면 폭 · 높이 (window.innerWidth · innerHeight) */
  width: number;
  height: number;
};

/**
 * 다음 상태. 순서:
 * 1. 늘 펼침: 폭 1024 이상 · 가로 모드(폭 > 높이) · 스크롤 거리 < 64(짧은 화면).
 * 2. 고무줄(아이폰 사파리): 위치가 음수이거나 문서 끝을 넘으면 방향으로 읽지 않고 펼침.
 * 3. 맨 위 · 맨 아래 가장자리는 펼침.
 * 4. 그 밖에는 같은 방향 이동을 누적해 펼침 → 접힘(아래 > 32), 접힘 → 펼침(위 > 12).
 */
export function nextFold(prev: FoldState, i: FoldInput): FoldState {
  const range = i.docHeight - i.viewportHeight;
  if (i.width >= DESKTOP_MIN_WIDTH || i.width > i.height || range < MIN_RANGE) {
    return INITIAL_FOLD;
  }
  if (i.y < 0 || i.y > range) return INITIAL_FOLD;
  if (i.y <= TOP_EDGE || i.y >= range - BOTTOM_EDGE) return INITIAL_FOLD;

  if (i.delta === 0) return prev;
  const sameDirection =
    prev.travel === 0 || Math.sign(i.delta) === Math.sign(prev.travel);
  const travel = sameDirection ? prev.travel + i.delta : i.delta;

  let folded = prev.folded;
  if (!folded && travel > FOLD_DOWN) folded = true;
  else if (folded && travel < -UNFOLD_UP) folded = false;
  return { folded, travel };
}
