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

/** 탈퇴 뒤 종합으로 돌아온 주소의 `account` 표시 (이슈 #195, 결정 0067). 끝에 안내 한 줄이 붙는 쪽은 `withdrawn-unlinked`. */
export type AccountNotice =
  "withdrawn" | "withdrawn-unlinked" | "withdraw-other";

/** 안내가 붙는 알림은 긴 글(두 줄)이라 더 오래 띄운다. */
export const ACCOUNT_TOAST_LONG_MS = 7000;

/** `account` 표시별 알림. 두 줄은 한 알림 안의 줄바꿈(`\n`) — 화면은 `whitespace-pre-line` 로 그린다. */
export const ACCOUNT_TOAST: Record<
  AccountNotice,
  { text: string; ms: number }
> = {
  withdrawn: { text: "탈퇴했어요", ms: TOAST_MS },
  "withdrawn-unlinked": {
    text: "탈퇴했어요\n연결된 서비스는 각 계정 설정에서 해제할 수 있어요",
    ms: ACCOUNT_TOAST_LONG_MS,
  },
  // 탈퇴 재인증에서 다른 계정을 골랐다(이슈 #197, 결정 0068) — 아무것도 지우지 않았고 이 기기는 로그아웃됐다
  "withdraw-other": {
    text: "다른 계정으로 로그인해서 탈퇴하지 않았어요. 원래 계정으로 다시 로그인해 주세요",
    ms: ACCOUNT_TOAST_LONG_MS,
  },
};

/** 주소 검색어에서 `account` 표시를 읽는다. 모르는 값은 null. */
export function readAccountNotice(search: string): AccountNotice | null {
  const value = new URLSearchParams(search).get("account");
  return value === "withdrawn" ||
    value === "withdrawn-unlinked" ||
    value === "withdraw-other"
    ? value
    : null;
}
