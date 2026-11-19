import { cookies } from "next/headers";
import { connection } from "next/server";

import { createCookieSupabaseClient } from "@/infra/supabase/cookie-client";

/**
 * 서버(`/auth/*` 경로 처리기)용 Supabase 클라이언트. 로그인한 사람의 쿠키 세션으로 읽고 쓴다 (이슈 #182, 결정 0061).
 * Next.js 의 `cookies()` · `connection()` 을 쓰는 어댑터라서 `src/app` 에 둔다(결정 0033). 클라이언트 만들기는 infra 의
 * `createCookieSupabaseClient`.
 *
 * **공개 자료(물 · 온도 · 햇빛 · 헤더 · 판정 표) 읽기는 이것이 아니라 세션 없는 `getSupabaseClient()` 를 그대로 쓴다.**
 * 쿠키 클라이언트로 바꾸면 `use cache` 가 사람마다 달라지거나 화면이 동적이 된다.
 */
export async function createSupabaseServerClient(
  options: {
    /** 코드 교환처럼 서버가 대신 하는 요청에서만, 사람의 브라우저 정보를 넘긴다. */
    userAgent?: string | null;
  } = {},
) {
  // 로그인 세션은 만료 시각을 지금과 견주므로, 요청이 올 때까지 미리 만들기를 멈춘다(cacheComponents).
  // 이것을 빼면 개발 서버에 "Blocking Route" 오류가 뜬다.
  await connection();

  const cookieStore = await cookies();
  return createCookieSupabaseClient({
    userAgent: options.userAgent,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // 서버 컴포넌트를 그리는 중에는 쿠키를 고칠 수 없다. 세션 갱신은 proxy 가 맡는다.
        }
      },
    },
  });
}
