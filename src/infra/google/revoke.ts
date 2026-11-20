import type { KakaoUnlinkResult } from "@/domain/account-info";
import { loopbackBase } from "@/infra/loopback-base";
import { postForm } from "@/infra/post-form";

/**
 * 구글 연결 끊기 = 방금 받은 공급자 토큰 취소 (이슈 #197, 결정 0068). 탈퇴 재인증 콜백이 부른다. Next.js 를 모른다(결정 0033).
 * 근거: 구글 공식 문서(`developers.google.com/identity/protocols/oauth2/web-server` "토큰 취소", 2026-11-20 읽음) —
 * `POST https://oauth2.googleapis.com/revoke`, `Content-Type: application/x-www-form-urlencoded`, 본문 `token=<토큰>`.
 * 토큰은 접근 토큰 · 새로고침 토큰 모두 되고, 성공은 200 · 실패는 400. 자세한 내용은 docs/SOCIAL_LOGIN.md.
 *
 * - **토큰은 그 요청 안에서만** 쓴다(쿠키 · DB · 기록 · 주소에 남기지 않음). 본문으로만 보낸다.
 * - 던지지 않고 `ok · failed · skipped` — 토큰이 없으면 부르지 않고 `skipped`(끊기 실패로 다루고 탈퇴는 진행).
 * - `GOOGLE_API_BASE`(시험 전용)는 고리 주소만 받는다.
 */
export const GOOGLE_DEFAULT_BASE = "https://oauth2.googleapis.com";

export function googleBase(raw: string | undefined | null): string {
  return loopbackBase(raw, GOOGLE_DEFAULT_BASE);
}

export async function revokeGoogle(input: {
  token: string | undefined | null;
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<KakaoUnlinkResult> {
  const token = typeof input.token === "string" ? input.token.trim() : "";
  if (token === "") return "skipped";
  const result = await postForm(
    "withdraw/google-revoke",
    `${googleBase(input.baseUrl)}/revoke`,
    new URLSearchParams({ token }),
    { fetchImpl: input.fetchImpl, timeoutMs: input.timeoutMs },
  );
  return result.ok ? "ok" : "failed";
}
