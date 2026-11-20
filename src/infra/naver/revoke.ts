import type { KakaoUnlinkResult } from "@/domain/account-info";
import { loopbackBase } from "@/infra/loopback-base";
import { postForm } from "@/infra/post-form";
import { logAuthError } from "@/infra/supabase/auth-log";

/**
 * 네이버 연결 끊기 = 방금 받은 공급자 토큰 삭제 (이슈 #197, 결정 0068). 탈퇴 재인증 콜백이 부른다. Next.js 를 모른다(결정 0033).
 * 요청: `POST https://nid.naver.com/oauth2.0/token`, form 본문 `grant_type=delete` · `client_id` · `client_secret` · `access_token` ·
 * `service_provider=NAVER`. 응답 `{ "result": "success", … }` 이어야 성공으로 본다(HTTP 200 안에 오류가 올 수 있어 본문의 `result` 도 본다).
 * ⚠ **네이버 공식 문서(`developers.naver.com`)를 이 환경에서 읽지 못했다.** 위 모양은 문서를 옮긴 글들이 일치하는 것을 따랐고
 * (검토 채팅 확인 11/20) 미리보기 실제 탈퇴로 확인해야 한다(결정 0068 · docs/SOCIAL_LOGIN.md).
 *
 * - **비밀(`client_secret`)과 토큰은 본문으로만** 보낸다. 주소 · 기록에 남기지 않는다. 클라이언트 아이디 · 시크릿은 서버 변수
 *   (`NAVER_CLIENT_ID` · `NAVER_CLIENT_SECRET`)이고 하나라도 없으면 부르지 않고 `skipped`.
 * - 던지지 않고 `ok · failed · skipped`. `NAVER_API_BASE`(시험 전용)는 고리 주소만 받는다.
 */
export const NAVER_DEFAULT_BASE = "https://nid.naver.com";

export function naverBase(raw: string | undefined | null): string {
  return loopbackBase(raw, NAVER_DEFAULT_BASE);
}

const clean = (v: string | undefined | null) =>
  typeof v === "string" ? v.trim() : "";

export async function revokeNaver(input: {
  token: string | undefined | null;
  clientId: string | undefined | null;
  clientSecret: string | undefined | null;
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<KakaoUnlinkResult> {
  const token = clean(input.token);
  const clientId = clean(input.clientId);
  const clientSecret = clean(input.clientSecret);
  if (token === "" || clientId === "" || clientSecret === "") return "skipped";
  const result = await postForm(
    "withdraw/naver-revoke",
    `${naverBase(input.baseUrl)}/oauth2.0/token`,
    new URLSearchParams({
      grant_type: "delete",
      client_id: clientId,
      client_secret: clientSecret,
      access_token: token,
      service_provider: "NAVER",
    }),
    { fetchImpl: input.fetchImpl, timeoutMs: input.timeoutMs, readJson: true },
  );
  if (!result.ok) return "failed";
  const body = result.json;
  const success =
    typeof body === "object" &&
    body !== null &&
    (body as Record<string, unknown>).result === "success";
  if (!success) {
    logAuthError("withdraw/naver-revoke", "bad_result");
    return "failed";
  }
  return "ok";
}
