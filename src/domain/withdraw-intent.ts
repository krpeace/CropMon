/**
 * 탈퇴 재인증의 순수 부분 (이슈 #197, 결정 0068). 화면 · 네트워크 · Node 를 불러오지 않는다.
 *
 * 구글 · 네이버 회원은 탈퇴할 때 그 공급자로 **한 번 더 로그인**해 새 공급자 토큰을 받고, 그 자리에서 탈퇴 + 끊기를 한다
 * (공급자 토큰을 DB · 쿠키에 쌓지 않기 위해). 그 사이에 "누가 탈퇴하려 했나"를 **탈퇴 의도 쿠키**(`cm_wd`)가 기억한다:
 * 지금 회원 번호의 **해시** · 공급자 · 만료 시각. 콜백은 새로 인증된 세션의 회원 번호 해시가 이 값과 **같을 때만** 지운다 —
 * 재인증 화면에서 다른 계정을 고르면 아무것도 지우지 않는다.
 */
import type { AccountProvider } from "./account-info";

export const WITHDRAW_INTENT_COOKIE = "cm_wd";
/** 콜백만 이 쿠키를 받는다. */
export const WITHDRAW_INTENT_PATH = "/auth/callback";
/** 수명(초). 공급자 로그인에 걸리는 시간으로 충분히 짧게. */
export const WITHDRAW_INTENT_MAX_AGE = 300;

export type ReauthProvider = "google" | "naver";

/**
 * 누가 재인증을 하나. 연결된 공급자에 구글 · 네이버가 있으면 그것(네이버는 `naverEnabled` 일 때만).
 * 둘 다 있으면 처음 가입한 공급자가 대상이면 그것, 아니면 구글 → 네이버. 카카오만 있거나 대상이 없으면 `null`(L6-1 그대로).
 * 재인증하지 않은 나머지 공급자는 끊지 못하므로 부르는 쪽이 알림에 안내 줄을 붙인다.
 */
export function reauthTarget(input: {
  providers: readonly AccountProvider[];
  signupProvider: AccountProvider | null;
  naverEnabled: boolean;
}): ReauthProvider | null {
  const candidates: ReauthProvider[] = [];
  if (input.providers.includes("google")) candidates.push("google");
  if (input.naverEnabled && input.providers.includes("naver")) {
    candidates.push("naver");
  }
  if (candidates.length === 0) return null;
  const first = input.signupProvider;
  if (first === "google" || first === "naver") {
    if (candidates.includes(first)) return first;
  }
  return candidates[0];
}

/** Supabase `signInWithOAuth` 에 넘길 공급자 이름. 네이버는 사용자 지정(custom) 공급자다. */
export function reauthLoginProvider(p: ReauthProvider): string {
  return p === "naver" ? "custom:naver" : "google";
}

type Intent = { v: 1; who: string; p: ReauthProvider; exp: number };

const WHO_SHAPE = /^[0-9a-f]{16}$/;
const MAX_RAW = 1024;

/** 쿠키 값: 위 세 값을 JSON → base64url (쿠키에 안전한 글자만). 회원 번호 · 메일은 넣지 않는다. */
export function encodeIntent(input: {
  who: string;
  provider: ReauthProvider;
  nowMs: number;
}): string {
  const intent: Intent = {
    v: 1,
    who: input.who,
    p: input.provider,
    exp: input.nowMs + WITHDRAW_INTENT_MAX_AGE * 1000,
  };
  return toBase64Url(JSON.stringify(intent));
}

export type IntentRead =
  | { ok: true; who: string; provider: ReauthProvider }
  | { ok: false; reason: "missing" | "broken" | "expired" };

/** 쿠키 값을 읽는다. 없음 · 깨짐 · 만료는 모두 "지우지 않는다"로 이어진다. */
export function readIntent(
  raw: string | null | undefined,
  nowMs: number,
): IntentRead {
  if (typeof raw !== "string" || raw === "")
    return { ok: false, reason: "missing" };
  const broken = { ok: false, reason: "broken" } as const;
  if (raw.length > MAX_RAW || !/^[A-Za-z0-9_-]+$/.test(raw)) return broken;
  let data: unknown;
  try {
    data = JSON.parse(fromBase64Url(raw));
  } catch {
    return broken;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return broken;
  const o = data as Record<string, unknown>;
  if (o.v !== 1) return broken;
  if (typeof o.who !== "string" || !WHO_SHAPE.test(o.who)) return broken;
  if (o.p !== "google" && o.p !== "naver") return broken;
  if (typeof o.exp !== "number" || !Number.isFinite(o.exp)) return broken;
  // 5분보다 오래 사는 값은 우리가 만든 것이 아니다
  if (o.exp > nowMs + WITHDRAW_INTENT_MAX_AGE * 1000 + 60_000) return broken;
  if (nowMs >= o.exp) return { ok: false, reason: "expired" };
  return { ok: true, who: o.who, provider: o.p };
}

/** `Cookie` 머리에서 이름이 정확히 같은 쿠키 하나의 값. 이름이 비슷한 다른 쿠키는 읽지 않는다. */
export function cookieValue(
  header: string | null | undefined,
  name: string,
): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at === -1) continue;
    if (part.slice(0, at).trim() === name) {
      const value = part.slice(at + 1).trim();
      return value === "" ? null : value;
    }
  }
  return null;
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(raw: string): string {
  const b64 = raw.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
