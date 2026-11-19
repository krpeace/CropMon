import type { SupabaseClient } from "@supabase/supabase-js";

import { logAuthError } from "./auth-log";

/**
 * 로그인한 사람을 "토큰에서" 읽는다 (이슈 #182, 결정 0061).
 *
 * `auth.getClaims()` 는 Supabase 가 비대칭 열쇠(ES256)로 서명한 토큰이면 Auth 서버에 가지 않고 그 자리에서 서명과 만료를
 * 확인한다(공개 열쇠 목록 JWKS 를 받아 기억한다). 예전 대칭 열쇠(HS256)로 서명된 토큰이면 안에서 `getUser()` 로 돌아가
 * Auth 서버에 확인한다 — 느리지만 틀리지는 않는다. 만료가 가까우면 여기서 새 토큰을 받아 쿠키를 갱신한다(프록시 쪽).
 *
 * 토큰이 말해 주는 것이므로 다음은 늦게 반영된다: 다른 기기에서 로그아웃하거나 계정을 지운 것(토큰 만료까지, 기본 1시간).
 * 그래서 이것은 "로그인 창으로 보내 주는 편의"이고, 진짜 막이는 DB 의 RLS 다.
 *
 * **id 만 돌려준다.** 이메일 · 전화 · 메타는 이 이슈에서 쓸 일이 없어 옮기지 않았다(개인 값은 필요한 이슈에서 더한다).
 */
export type CurrentUser = { id: string };

/**
 * 로그인한 사람을 토큰에서 읽는다. 세션이 없거나, 토큰이 틀리거나 만료됐거나(새로 받지 못함), 로그인한 사람의 토큰
 * (authenticated)이 아니면 null. 확인하다 던져도 화면이 멈추지 않도록 null 로 보고 서버 기록에는 단계만 남긴다.
 */
export async function readUserFromClaims(
  client: SupabaseClient,
): Promise<CurrentUser | null> {
  try {
    const { data, error } = await client.auth.getClaims();
    if (error || !data) return null;
    const claims = data.claims as Record<string, unknown>;
    const id = typeof claims.sub === "string" ? claims.sub : "";
    if (id === "" || claims.role !== "authenticated") return null;
    return { id };
  } catch {
    logAuthError("claims");
    return null;
  }
}
