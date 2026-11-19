import { NextResponse } from "next/server";

import { membersEnabledNow } from "@/app/_lib/members";
import { validateRedirectPath } from "@/domain/auth";
import { logAuthError } from "@/infra/supabase/auth-log";
import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";

/**
 * 로그아웃 `POST /auth/signout?next=<돌아갈 주소>` (이슈 #182, 결정 0061).
 * 경로 처리기라서 세션 쿠키를 완전히 지울 수 있다(서버 컴포넌트는 못 지움). 끝나면 검사한 `next`(없으면 `/`)로 303.
 *
 * - **POST 만**: 링크 미리 불러오기 · 미리보기가 로그아웃시키지 않게 GET 은 405.
 * - **`Origin` 헤더가 있고 이 사이트가 아니면 403**(다른 사이트가 몰래 로그아웃시키는 것을 막음).
 *   `Origin` 이 **없는** 요청은 막지 않는다(오래된 브라우저 · 일부 앱 안 브라우저). 헤더가 `null` 문자열이면 다른 사이트로 본다.
 * - 스위치를 끄면 POST · GET 모두 404 (쿠키도 안 건드림).
 */
export async function POST(request: Request) {
  // 요청 때 읽는다
  if (!(await membersEnabledNow()))
    return new NextResponse(null, { status: 404 });

  const { searchParams, origin } = new URL(request.url);

  const requestOrigin = request.headers.get("origin");
  if (requestOrigin !== null && requestOrigin !== origin) {
    return new NextResponse(null, { status: 403 });
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signOut();
    if (error) logAuthError("signout", error.code);
  } catch {
    logAuthError("signout");
  }

  const next = validateRedirectPath(searchParams.get("next"));
  // POST 뒤에는 303 이라야 브라우저가 GET 으로 돌아갈 화면을 연다
  return NextResponse.redirect(new URL(next, origin), { status: 303 });
}

/** GET 등은 로그아웃하지 않는다: 스위치를 끄면 404, 켜면 405. */
export async function GET() {
  if (!(await membersEnabledNow()))
    return new NextResponse(null, { status: 404 });
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
