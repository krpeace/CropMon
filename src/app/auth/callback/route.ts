import { NextResponse } from "next/server";

import { membersEnabledNow } from "@/app/_lib/members";
import {
  classifyOAuthCallbackError,
  validateRedirectPath,
  withLoginNotice,
} from "@/domain/auth";
import { postLoginDestination } from "@/domain/consent";
import { logAuthError } from "@/infra/supabase/auth-log";
import { readMyConsent } from "@/infra/supabase/member-consent";
import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";

/**
 * 공급자(카카오 · 구글 · 네이버)에서 돌아오는 곳 `GET /auth/callback` (이슈 #182, 결정 0061).
 * Supabase 가 넘겨준 `code` 를 세션으로 바꾸고(PKCE), 로그인 직후 `public.ensure_my_member()` 를 한 번 부른 뒤
 * 검사한 `next`(누르기 전에 보던 화면, 검색어 포함)로 돌려보낸다. `next` 가 없거나 위험하면 `/`. 성공이면 `login=ok` 를 붙인다.
 *
 * - 스위치를 끄면 404 (코드가 와도 교환하지 않고 쿠키도 안 심는다).
 * - **동의 전이면 `next` 대신 `/consent?next=<next>`** 로 보낸다(결정 0065) — 자기 `members` 줄의 동의 판 두 열만 읽고,
 *   비었거나 받아 주지 않는 판이거나 읽기에 실패하면 동의 화면. 동의가 끝난 사람은 지금처럼 `next` + `login=ok`.
 * - `ensure_my_member` 는 가입 트리거가 오류를 삼켜 `members` 줄이 빠진 경우를 메운다. **이 호출이 실패해도 로그인은 계속한다.**
 * - 실패 · 취소: 돌아갈 화면 주소에 `login=cancelled`(사용자가 공급자 화면에서 취소) 또는 `login=failed` 하나만 붙인다.
 *   코드도 오류도 없이 돌아오면(오류가 주소의 `#` 뒤로 온 것 — 서버는 `#` 뒤를 못 본다) `login=failed`.
 * - **원문 오류 · 이메일 · 이름 · 사용자 ID · `code` · 토큰은 화면 · 주소 · 응답 · 서버 기록 어디에도 넣지 않는다.**
 *   서버 기록에는 단계와 오류 코드만(`logAuthError`).
 */
export async function GET(request: Request) {
  // 요청 때 읽는다
  if (!(await membersEnabledNow()))
    return new NextResponse(null, { status: 404 });

  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = validateRedirectPath(searchParams.get("next"));
  const error = searchParams.get("error");
  const errorCode = searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");

  const back = (path: string) =>
    NextResponse.redirect(new URL(path, origin), { status: 302 });
  const failure = (notice: "cancelled" | "failed") =>
    back(withLoginNotice(next, notice));

  if (error || errorCode || errorDescription) {
    const notice = classifyOAuthCallbackError(
      error,
      errorCode,
      errorDescription,
    );
    // 취소는 오류가 아니라 사용자의 선택이므로 기록하지 않는다. 그 밖의 오류만 단계를 남긴다(원문은 남기지 않음).
    if (notice === "failed") logAuthError("callback/provider-error");
    return failure(notice);
  }

  if (!code) {
    logAuthError("callback/no-code");
    return failure("failed");
  }

  try {
    // 코드를 세션으로 바꾸는 것은 서버가 하므로, Supabase 가 남기는 기기 정보가 사람의 브라우저가 되게 User-Agent 를 넘긴다
    const supabase = await createSupabaseServerClient({
      userAgent: request.headers.get("user-agent"),
    });
    const { error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      logAuthError("callback/exchange", exchangeError.code);
      return failure("failed");
    }

    // 가입 트리거가 오류를 삼켜 줄이 빠졌을 수 있으니 한 번 확인한다. 실패해도 로그인은 계속한다.
    try {
      const { error: ensureError } = await supabase.rpc("ensure_my_member");
      if (ensureError) logAuthError("callback/ensure-member", ensureError.code);
    } catch {
      logAuthError("callback/ensure-member");
    }

    // 동의가 필요하면(첫 로그인 · 모르는 판 · 읽기 실패) 동의 화면으로, 아니면 성공 표시(login=ok)를 붙여 next 로 (결정 0064 · 0065).
    // 읽기에 실패해도 로그인은 막지 않고 동의 화면이 다시 확인한다.
    return back(postLoginDestination(await readMyConsent(supabase), next));
  } catch {
    logAuthError("callback/exchange");
    return failure("failed");
  }
}
