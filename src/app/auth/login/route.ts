import { NextResponse } from "next/server";

import { membersEnabledNow } from "@/app/_lib/members";
import { naverLoginEnabled } from "@/domain/members-switch";
import {
  isAllowedProvider,
  validateRedirectPath,
  withLoginNotice,
} from "@/domain/auth";
import { logAuthError } from "@/infra/supabase/auth-log";
import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";

/**
 * 로그인 시작 `GET /auth/login?provider=kakao|google|custom:naver&next=<돌아갈 주소>` (이슈 #182, 결정 0061).
 * 서버에서 PKCE 를 시작한다: 코드 검증값 쿠키를 심고 공급자 화면으로 보낸다. 공급자에서 돌아오는 곳은 `/auth/callback`.
 * - 스위치를 끄면 404 (쿠키도 안 심는다).
 * - 모르는 공급자는 400. 네이버(`custom:naver`)는 `NAVER_LOGIN_ENABLED=true` 일 때만 허용하고, 끄면 모르는 공급자와 같이 400 (결정 0064). `next` 는 검사해서(`validateRedirectPath`) 콜백 주소에 실어 보낸다 — 나쁜 값이면 `/`.
 * - 공급자 주소를 못 받으면 돌아갈 화면에 `login=failed` 를 붙여 돌려보낸다.
 *
 * ⚠ 시작할 때 쿠키를 심으므로, 화면 쪽 버튼은 **`<a>` 로 걸고 `<Link>`(미리 불러오기)는 쓰지 않는다.**
 */
export async function GET(request: Request) {
  // 요청 때 읽는다
  if (!(await membersEnabledNow()))
    return new NextResponse(null, { status: 404 });

  const { searchParams, origin } = new URL(request.url);
  const provider = searchParams.get("provider");
  // 네이버는 NAVER_LOGIN_ENABLED 를 켠 때만. 끄면 모르는 공급자와 같이 400 (membersEnabledNow 가 요청 때까지 기다렸으니 지금 읽어도 빌드 때 굳지 않는다)
  if (!isAllowedProvider(provider, naverLoginEnabled(process.env))) {
    return new NextResponse(null, { status: 400 });
  }
  const next = validateRedirectPath(searchParams.get("next"));

  const failure = () =>
    NextResponse.redirect(new URL(withLoginNotice(next, "failed"), origin), {
      status: 302,
    });

  try {
    const redirectTo = new URL("/auth/callback", origin);
    redirectTo.searchParams.set("next", next);

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
      // 네이버는 사용자 지정(custom) 공급자라 타입에 없는 이름이다
      provider: provider as Parameters<
        typeof supabase.auth.signInWithOAuth
      >[0]["provider"],
      options: { redirectTo: redirectTo.toString(), skipBrowserRedirect: true },
    });
    if (error || !data?.url) {
      logAuthError("login/start", error?.code);
      return failure();
    }
    return NextResponse.redirect(data.url, { status: 302 });
  } catch {
    logAuthError("login/start");
    return failure();
  }
}
