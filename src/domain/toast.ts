/**
 * 알림(토스트)의 순수 부분 (이슈 #189, 결정 0064). 로그인에서 돌아온 주소의 `login` 표시를 읽고 알림 문구를 정한다.
 * 알림 부품은 공통이라 앞으로 "탈퇴했어요" · "기록을 지웠어요"도 같은 부품을 쓴다.
 */
import type { LoginNotice } from "./auth";

/** 알림이 화면에 떠 있는 시간(ms). */
export const TOAST_MS = 4000;

/** 로그인 표시별 알림 문구. 취소는 사용자의 선택이므로 아무 말 없음(null). */
export const LOGIN_TOAST_TEXT: Record<LoginNotice, string | null> = {
  ok: "로그인했어요",
  failed: "로그인을 마치지 못했어요. 잠시 뒤 다시 해 주세요",
  cancelled: null,
};

/** 주소 검색어에서 `login` 표시(ok · failed · cancelled)를 읽는다. `login=1`(시트 열기)이나 모르는 값은 null. */
export function readLoginNotice(search: string): LoginNotice | null {
  const value = new URLSearchParams(search).get("login");
  return value === "ok" || value === "failed" || value === "cancelled"
    ? value
    : null;
}
