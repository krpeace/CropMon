import type { SupabaseClient } from "@supabase/supabase-js";

import { pickKakaoUserId, providersOf } from "@/domain/account-info";
import type { AccountProvider } from "@/domain/account-info";

import { logAuthError } from "./auth-log";

/**
 * 회원 정보 화면 · 탈퇴가 읽는 값 (이슈 #195, 결정 0067). Next.js 를 모른다(결정 0033) — 로그인한 사람의 쿠키 세션 클라이언트를 받는다.
 * 서버 기록에는 단계와 오류 코드만 남긴다(이메일 · 이름 · 사용자 ID · 원문 오류는 안 남김, 결정 0061).
 */

export type MemberIdentity = {
  userId: string;
  email: string | null;
  /** 로그인에 쓴 공급자들(아는 것만, 중복 없이). */
  providers: AccountProvider[];
  /** 카카오 회원번호(숫자만). 카카오로 로그인한 적이 없거나 읽을 수 없으면 null. */
  kakaoUserId: string | null;
};

/**
 * `auth.getUser()` 에서 메일 · 공급자 목록 · 카카오 회원번호를 읽는다. **탈퇴 전에** 읽어 둬야 한다(지운 뒤에는 못 읽음).
 * `getUser()` 는 Auth 서버에 묻는다 — 쿠키 값만 믿지 않는다. 로그인한 사람이 없거나 오류 · 던짐이면 null (던지지 않는다).
 */
export async function readIdentity(
  client: SupabaseClient,
): Promise<MemberIdentity | null> {
  try {
    const { data, error } = await client.auth.getUser();
    if (error) {
      logAuthError("account/identity", error.code);
      return null;
    }
    const user = data?.user;
    if (!user || typeof user.id !== "string") return null;
    return {
      userId: user.id,
      email:
        typeof user.email === "string" && user.email !== "" ? user.email : null,
      providers: providersOf(user.identities),
      kakaoUserId: pickKakaoUserId(user.identities),
    };
  } catch {
    logAuthError("account/identity");
    return null;
  }
}

/** 회원 정보 화면에 필요한 `members` 열만 (역할 · 화면 설정 열은 읽지 않는다). */
const MEMBER_COLUMNS =
  "display_name, provider, created_at, terms_version, terms_agreed_at, privacy_version, privacy_confirmed_at";

export type MemberRowRead =
  { ok: true; row: Record<string, unknown> | null } | { ok: false };

/** 자기 `members` 줄(RLS 로 자기 줄만 보인다). 줄이 없으면 `row: null`. 오류 · 던짐은 `{ ok: false }`. */
export async function readMemberRow(
  client: SupabaseClient,
): Promise<MemberRowRead> {
  try {
    const { data, error } = await client
      .from("members")
      .select(MEMBER_COLUMNS)
      .maybeSingle();
    if (error) {
      logAuthError("account/read", error.code);
      return { ok: false };
    }
    return { ok: true, row: (data as Record<string, unknown> | null) ?? null };
  } catch {
    logAuthError("account/read");
    return { ok: false };
  }
}

/**
 * `public.delete_my_account()` (D1-1)를 회원 세션으로 부른다. 서버 키는 쓰지 않는다. 성공이면 true, 오류 · 던짐이면 false.
 * 이 함수가 성공하기 전에는 카카오 연결 끊기 · 로그아웃을 하지 않는다(부르는 쪽 약속).
 */
export async function deleteMyAccount(
  client: SupabaseClient,
): Promise<boolean> {
  try {
    const { error } = await client.rpc("delete_my_account");
    if (error) {
      logAuthError("withdraw/delete", error.code);
      return false;
    }
    return true;
  } catch {
    logAuthError("withdraw/delete");
    return false;
  }
}
