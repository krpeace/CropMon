import { type NextRequest, NextResponse } from "next/server";

import { createCookieSupabaseClient } from "@/infra/supabase/cookie-client";
import { readUserFromClaims } from "@/infra/supabase/current-user";

export type ProxySessionResult = {
  /** 갱신된 세션 쿠키가 실린 응답. 다른 곳으로 보낼 때도 이 쿠키를 옮겨 싣는다 */
  response: NextResponse;
  /** 로그인한 사람이 있는지 */
  signedIn: boolean;
};

/**
 * `src/proxy.ts` 전용 (이슈 #182, 결정 0061). **로그인 쿠키가 있는 요청에서만** 부른다 — 쿠키가 없으면 프록시가 여기까지
 * 오지 않으므로 방문자 대부분은 Supabase 를 부르지 않는다.
 * 쿠키 세션을 갱신하고(서버 컴포넌트는 쿠키를 쓸 수 없으므로 갱신은 여기서 한다 — Supabase 공식 Next.js 방식),
 * 로그인한 사람이 있는지 알려 준다. 연결 정보가 비었거나 Supabase 에 닿지 않으면 로그인하지 않은 것으로 본다.
 * `NextRequest` · `NextResponse` 를 쓰는 어댑터라서 `src/app` 에 둔다(결정 0033).
 */
export async function updateProxySession(
  request: NextRequest,
): Promise<ProxySessionResult> {
  let response = NextResponse.next({ request });

  let supabase;
  try {
    supabase = createCookieSupabaseClient({
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
  } catch {
    // 연결 정보가 비었으면 로그인하지 않은 것으로 본다
    return { response, signedIn: false };
  }

  // 토큰에서 로그인 여부를 확인한다(getClaims). 확인하다 던져도 readUserFromClaims 가 null 로 돌려준다.
  const user = await readUserFromClaims(supabase);
  return { response, signedIn: Boolean(user) };
}
