/**
 * 회원제 표시 쿠키 `cm_m` (이슈 #189, 결정 0064). 순수 함수 — 화면 · 네트워크를 불러오지 않는다.
 *
 * 공개 화면은 정적 · `use cache`(결정 0038)라서 서버가 "회원제 스위치가 켜졌는지 · 로그인했는지"를 HTML 에 못 싣는다.
 * 그래서 프록시가 이 작은 쿠키를 심고(자바스크립트가 읽을 수 있게 HttpOnly 아님), 첫 그리기 전에 도는 스크립트
 * (`buildMembersScript`)가 읽어 `<html data-members>` 에 단다. 헤더는 CSS 가 그 속성으로 모양 하나만 보이게 한다.
 *
 * 값에는 **개인 값이 없다**: `a`(켬 · 비로그인) · `i`(켬 · 로그인함), 네이버가 켜져 있으면 뒤에 `n`.
 * 끔이면 쿠키가 없다(= 지금 알파 모양). 모르는 값도 끔으로 읽는다.
 * 이 쿠키는 **모양만** 바꾼다. 진짜 막이는 서버 · RLS 다(위조해도 헤더 모양만 바뀜).
 */

export const MEMBERS_STATE_COOKIE = "cm_m";

export type MembersMode = "off" | "anon" | "in";
export type MembersState = { mode: MembersMode; naver: boolean };

const OFF: MembersState = { mode: "off", naver: false };
const VALID = /^[ai]n?$/;

/** 쿠키 값 → 상태. 없거나 모르는 값이면 끔(지금 알파 모양). */
export function parseMembersState(
  raw: string | null | undefined,
): MembersState {
  if (typeof raw !== "string" || !VALID.test(raw)) return OFF;
  return {
    mode: raw.startsWith("i") ? "in" : "anon",
    naver: raw.endsWith("n"),
  };
}

/** `document.cookie` 글자(`a=1; cm_m=in; b=2`)에서 cm_m 하나를 찾아 읽는다. 이름이 비슷한 다른 쿠키는 읽지 않는다. */
export function parseMembersFromCookieHeader(header: string): MembersState {
  const hit = new RegExp(`(?:^|; )${MEMBERS_STATE_COOKIE}=([^;]*)`).exec(
    header,
  );
  return parseMembersState(hit?.[1]);
}

/** 프록시가 심고 싶은 값. 스위치 끔이면 쿠키를 원하지 않는다(null). */
export function wantedMembersCookie(input: {
  membersOn: boolean;
  naverOn: boolean;
  signedIn: boolean;
}): string | null {
  if (!input.membersOn) return null;
  return `${input.signedIn ? "i" : "a"}${input.naverOn ? "n" : ""}`;
}

export type MembersCookieAction =
  { kind: "none" } | { kind: "set"; value: string } | { kind: "clear" };

/**
 * 지금 요청에 실려 온 값(`current`)과 원하는 값(`wanted`)으로 할 일을 정한다.
 * - 원하는 값이 없고(끔) 쿠키도 없으면 아무것도 안 한다 — 쿠키 없는 방문자는 지금 알파와 같다.
 * - 원하는 값이 없는데 쿠키가 있으면(켰다가 끔 · 위조) 지운다.
 * - 원하는 값이 있으면 **다를 때만** 쓴다.
 */
export function membersCookieAction(
  current: string | undefined,
  wanted: string | null,
): MembersCookieAction {
  if (wanted === null) {
    return current === undefined ? { kind: "none" } : { kind: "clear" };
  }
  return current === wanted ? { kind: "none" } : { kind: "set", value: wanted };
}

/**
 * 첫 그리기 전에 `<head>` 에서 도는 스크립트 글자(`THEME_SCRIPT` 와 같은 방식). 쿠키를 읽어 `<html>` 에
 * `data-members="anon|in"` 과 (네이버 켬이면) `data-naver="1"` 을 단다. 쿠키가 없거나 모르는 값이면 **아무것도 안 단다**(= 알파 모양).
 * 쿠키를 읽다 오류가 나도 화면을 막지 않는다(`try`).
 */
export function buildMembersScript(): string {
  const name = JSON.stringify(MEMBERS_STATE_COOKIE);
  return `(function(){try{var m=new RegExp("(?:^|; )"+${name}+"=([^;]*)").exec(document.cookie);if(!m||!/^[ai]n?$/.test(m[1]))return;var d=document.documentElement.dataset;d.members=m[1].charAt(0)==="i"?"in":"anon";if(m[1].length>1)d.naver="1"}catch(e){}})()`;
}
