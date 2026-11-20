import type { SupabaseClient } from "@supabase/supabase-js";

import type { ConsentRead } from "@/domain/consent";

import { logAuthError } from "./auth-log";

/**
 * 동의 판 읽기 · 기록 (이슈 #191, 결정 0065). Next.js 를 모른다(결정 0033) — 로그인한 사람의 쿠키 세션 클라이언트를 받는다.
 * 서버 기록에는 단계와 오류 코드만 남긴다(이메일 · 이름 · 사용자 ID · 원문 오류는 안 남김, 결정 0061).
 */

/**
 * 로그인한 사람 자기 `members` 줄에서 **동의 판 두 열만** 읽는다(RLS 로 자기 줄만 보인다). 줄이 없으면 둘 다 null(동의 전).
 * 오류가 나거나 던져도 던지지 않고 `{ ok: false }` — 부르는 쪽이 "동의 화면으로"로 처리한다.
 */
export async function readMyConsent(
  client: SupabaseClient,
): Promise<ConsentRead> {
  try {
    const { data, error } = await client
      .from("members")
      .select("terms_version, privacy_version")
      .maybeSingle();
    if (error) {
      logAuthError("consent/read", error.code);
      return { ok: false };
    }
    const row = (data ?? {}) as Record<string, unknown>;
    return {
      ok: true,
      termsVersion:
        typeof row.terms_version === "string" ? row.terms_version : null,
      privacyVersion:
        typeof row.privacy_version === "string" ? row.privacy_version : null,
    };
  } catch {
    logAuthError("consent/read");
    return { ok: false };
  }
}

/**
 * `public.record_my_consent` 를 부른다. 다섯 열과 시각은 DB 가 `now()` 로 쓴다.
 * 판 값은 부르는 쪽(서버)이 `legal.ts` 에서 넣는다. 성공이면 true, 오류 · 던짐이면 false.
 */
export async function recordMyConsent(
  client: SupabaseClient,
  termsVersion: string,
  privacyVersion: string,
): Promise<boolean> {
  try {
    const { error } = await client.rpc("record_my_consent", {
      p_terms_version: termsVersion,
      p_privacy_version: privacyVersion,
    });
    if (error) {
      logAuthError("consent/record", error.code);
      return false;
    }
    return true;
  } catch {
    logAuthError("consent/record");
    return false;
  }
}
