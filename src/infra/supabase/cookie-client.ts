import { createServerClient, type CookieMethodsServer } from "@supabase/ssr";

import { requireSupabaseEnv } from "./client";

/**
 * 로그인한 사람의 **쿠키 세션**으로 읽고 쓰는 Supabase 클라이언트를 만든다 (이슈 #182, 결정 0061).
 * 쿠키를 읽고 쓰는 방법(`cookies`)은 부르는 쪽이 넘긴다 — 이 파일은 Next.js 를 모른다(결정 0033).
 * Next.js 의 `cookies()` · `connection()` · `NextRequest` 를 쓰는 어댑터는 `src/app/_lib/supabase/` 에 있다
 * (`server-client.ts` = 경로 처리기용, `proxy-client.ts` = 프록시용).
 *
 * **공개 자료 읽기는 이것이 아니라 세션 없는 `getSupabaseClient()` 를 그대로 쓴다**(`use cache` 가 사람마다 달라지지 않게).
 */
export function createCookieSupabaseClient(options: {
  cookies: CookieMethodsServer;
  /**
   * 요청을 보낸 사람의 브라우저 정보. 로그인 콜백처럼 서버가 대신 코드를 세션으로 바꾸는 곳에서만 넘긴다.
   * 안 넘기면 Supabase 는 서버(node)를 기기로 적는다.
   */
  userAgent?: string | null;
}) {
  const { url, anonKey } = requireSupabaseEnv();
  const userAgent = options.userAgent?.trim();
  return createServerClient(url, anonKey, {
    ...(userAgent ? { global: { headers: { "User-Agent": userAgent } } } : {}),
    cookies: options.cookies,
  });
}
