/**
 * 동의 화면의 순수 부분 (이슈 #191, 결정 0065). 확정 문구 · 큰 버튼 글자 · 주소 만들기 · 로그인 직후 갈림 · 관문 판단.
 * 화면 · 네트워크를 불러오지 않는다. 판(버전) 판단은 `legal.ts` 의 `needsConsent` 가 맡는다.
 */
import {
  loginRequiredRedirect,
  validateRedirectPath,
  withLoginNotice,
} from "./auth";
import { needsConsent } from "./legal";

/**
 * 확정 문구 (전문가 2차 회신 뒤 2026-11-19 확정). **글자 하나도 바꾸지 않는다** — 시험이 글자 그대로 견준다.
 * 시안 v0.4.2 의 그림은 옛 문구라 시안이 아니라 이 상수를 쓴다.
 */
export const CONSENT_COPY = {
  title: "CropMon을 시작하려면 동의가 필요해요",
  agreeAll: "모두 동의하고 시작하기",
  /** 셋을 손으로 다 켜면 큰 버튼 글자만 이것으로 바뀐다. */
  agreeAllWhenChecked: "동의하고 시작하기",
  checks: [
    { id: "age14", label: "(필수) 만 14세 이상입니다", view: null },
    { id: "terms", label: "(필수) 이용약관 동의", view: "terms" },
    {
      id: "privacy",
      label: "(필수) 개인정보 수집·이용 안내 확인",
      view: "privacy",
    },
  ],
  viewButton: "보기",
  summary: [
    "· 받는 정보: 소셜 계정 회원 번호·이름(별명)·이메일, 농장 주소와 관수 기록",
    "· 쓰는 곳: 내 농장 토양 수분 계산. 통계에는 알아볼 수 없게 묶어서만 써요",
    "· 보관: 탈퇴하면 바로 삭제(암호화 백업은 최대 7일)",
  ],
  notice:
    "동의하지 않으면 회원 기능(내 농장·관수 기록)은 쓸 수 없어요. 로그인 없이 보던 화면은 그대로 쓸 수 있어요.",
  noticeLeave:
    "동의하지 않고 나가면 로그인 정보는 24시간 안에 자동으로 지워져요.",
  leave: "동의하지 않고 나가기",
} as const;

/**
 * 동의를 저장하지 못했을 때 화면 맨 위에 띄우는 한 줄. **확정 문구 밖** — 검토 채팅 승인(2026-11-20).
 * 그래서 `CONSENT_COPY` 에 넣지 않고 따로 둔다.
 */
export const CONSENT_SAVE_FAILED_TEXT =
  "동의를 저장하지 못했어요. 잠시 뒤 다시 해 주세요";

export type ConsentChecks = {
  age14: boolean;
  terms: boolean;
  privacy: boolean;
};

/** 큰 버튼 글자: 셋이 모두 켜져 있을 때만 "동의하고 시작하기", 아니면 "모두 동의하고 시작하기". (누르면 어느 쪽이든 셋 모두로 기록한다.) */
export function consentButtonLabel(checks: ConsentChecks): string {
  return checks.age14 && checks.terms && checks.privacy
    ? CONSENT_COPY.agreeAllWhenChecked
    : CONSENT_COPY.agreeAll;
}

const CONSENT_PATH = "/consent";

/**
 * 프록시가 로그인한 사람의 로그인 필요 주소 요청에 "지금 주소"(경로 + 검색어)를 실어 주는 요청 머리 이름 (결정 0065).
 * 레이아웃은 자기 주소를 모르는데 공통 관문이 동의 화면 뒤 돌아올 곳을 알아야 해서다.
 */
export const CURRENT_PATH_HEADER = "x-cm-next";

/** 동의 화면으로 돌아오면 안 되는 주소(동의 화면 자신 · 그 아래). 돌고 도는 일을 막는다. */
function isConsentPath(path: string): boolean {
  const cut = path.search(/[?#]/);
  const pathname = cut === -1 ? path : path.slice(0, cut);
  return pathname === CONSENT_PATH || pathname.startsWith(`${CONSENT_PATH}/`);
}

/** 동의 뒤 돌아갈 주소(next) 검사: 우리 사이트 안의 경로이고 동의 화면 자신이 아니면 그대로, 아니면 `/`. */
export function readConsentNext(next: string | null | undefined): string {
  const safe = validateRedirectPath(next ?? null);
  return isConsentPath(safe) ? "/" : safe;
}

/** `/consent?next=<검사한 next>` (저장에 실패해 돌아올 때는 `&consent=failed`). */
export function consentHref(next: string, failed = false): string {
  const base = `${CONSENT_PATH}?next=${encodeURIComponent(readConsentNext(next))}`;
  return failed ? `${base}&consent=failed` : base;
}

/** 주소의 `consent=failed`(저장 실패) 표시. */
export function readConsentFailed(search: string): boolean {
  const query = search.startsWith("?") ? search.slice(1) : search;
  return new URLSearchParams(query).get("consent") === "failed";
}

/** "동의하고 시작하기" 폼이 보낼 곳: `POST /auth/consent?next=…`. */
export function consentPostAction(next: string): string {
  return `/auth/consent?next=${encodeURIComponent(readConsentNext(next))}`;
}

/** 로그인한 사람의 members 줄에서 읽은 동의 판 두 개. 읽기에 실패하면 `{ ok: false }`. */
export type ConsentRead =
  | { ok: true; termsVersion: string | null; privacyVersion: string | null }
  | { ok: false };

/** "동의하지 않고 나가기" 폼이 보낼 곳: `POST /auth/consent/decline?next=…` (결정 0069). 로그아웃 길(`/auth/signout`)과 다르다. */
export function consentDeclineAction(next: string): string {
  return `/auth/consent/decline?next=${encodeURIComponent(readConsentNext(next))}`;
}

/**
 * "동의하지 않고 나가기"를 눌렀을 때 계정을 지우나 (이슈 #199, 결정 0069).
 * **동의한 적이 한 번도 없는 회원만**(두 판 열이 모두 비어 있음) 지운다 — 가입만 하고 동의 전에 떠난 사람이다.
 * 예전 판에 동의했던 회원(약관이 바뀌어 다시 묻는 중)은 농장 · 관수 기록이 있을 수 있어 지우지 않고 로그아웃만 한다.
 * 동의 기록을 읽지 못해도 지우지 않는다(남은 계정은 정기 정리 O2).
 */
export function declineAction(read: ConsentRead): "delete" | "signout-only" {
  return read.ok && read.termsVersion === null && read.privacyVersion === null
    ? "delete"
    : "signout-only";
}

/**
 * 로그인 직후(콜백) 보낼 곳. 동의가 필요하면(비어 있음 · 모르는 판 · **읽기 실패**) `/consent?next=<원래 next>`,
 * 아니면 `next` 에 `login=ok`. 읽기에 실패해도 로그인은 막지 않고 동의 화면이 다시 확인한다.
 */
export function postLoginDestination(read: ConsentRead, next: string): string {
  if (!read.ok || needsConsent(read)) return consentHref(next);
  // 동의가 끝난 사람의 next 가 동의 화면 자신이면 / 로 보낸다(동의 화면이 되돌려 보내는 한 번을 줄임)
  return withLoginNotice(readConsentNext(next), "ok");
}

export type GateDecision =
  "not-found" | "login" | "ok" | "consent" | "leave" | "show";

/**
 * 로그인 필요 쪽의 공통 관문 판단 (결정 0065). 동의 화면 밖(`onConsentPage` false)과 동의 화면 자신(true)이 같은 함수를 쓰되
 * **동의 화면 자신은 어떤 입력으로도 `consent`(동의 화면으로 보내기)가 나오지 않는다** — 자기 자신으로 돌고 도는 일이 없다.
 * - 스위치 끔 → `not-found` (알파와 같다)
 * - 로그인하지 않음 → `login`
 * - 동의함 → 밖: `ok` / 동의 화면: `leave`(next 로 떠남)
 * - 동의 전 · 읽기 실패 → 밖: `consent`(동의 화면으로) / 동의 화면: `show`(그린다)
 */
export function consentGate(input: {
  switchOn: boolean;
  signedIn: boolean;
  read: ConsentRead | null;
  onConsentPage: boolean;
}): GateDecision {
  if (!input.switchOn) return "not-found";
  if (!input.signedIn) return "login";
  const consented = input.read?.ok === true && !needsConsent(input.read);
  if (input.onConsentPage) return consented ? "leave" : "show";
  return consented ? "ok" : "consent";
}

/** 비로그인 때 보낼 로그인 시트 주소(`/?login=1&next=<next>`). */
export function loginHrefFor(next: string): string {
  const url = new URL(readConsentNext(next), "http://cropmon.invalid");
  return loginRequiredRedirect(url.pathname, url.search);
}
