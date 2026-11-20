import { NextResponse } from "next/server";

import { membersEnabledNow } from "@/app/_lib/members";
import { whoOf } from "@/app/_lib/who";
import { withdrawOutcome, type KakaoUnlinkResult } from "@/domain/account-info";
import { naverLoginEnabled } from "@/domain/members-switch";
import {
  encodeIntent,
  reauthLoginProvider,
  reauthTarget,
  WITHDRAW_INTENT_COOKIE,
  WITHDRAW_INTENT_MAX_AGE,
  WITHDRAW_INTENT_PATH,
  type ReauthProvider,
} from "@/domain/withdraw-intent";
import { unlinkKakao } from "@/infra/kakao/unlink";
import { logAuthError } from "@/infra/supabase/auth-log";
import { deleteMyAccount, readIdentity } from "@/infra/supabase/member-profile";
import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";

/**
 * 회원 탈퇴 `POST /auth/withdraw` (이슈 #195, 결정 0067). "탈퇴하기" 폼이 보낸다. 순서가 중요하다:
 *
 * 1. 스위치 끔 404 · `Origin` 이 있고 이 사이트가 아니면 403(로그아웃 · 동의와 같은 규칙) ·
 *    확인 칸(`confirm=on`)이 없으면 아무것도 안 하고 탈퇴 화면으로(`?withdraw=confirm`) — 화면의 막기와 별개로 서버도 본다.
 * 2. **구글 · 네이버 회원은 먼저 재인증한다**(이슈 #197, 결정 0068): 아직 아무것도 지우지 않고 **탈퇴 의도 쿠키**(`cm_wd`)를 심은 뒤 그 공급자로
 *    로그인을 다시 시작한다(`/auth/callback?flow=withdraw`가 이어받음 — 새 공급자 토큰으로 끊기 위해). 카카오만 있으면 바로 아래 3~5.
 * 2'. **지우기 전에** 로그인 정보(공급자 목록 · 카카오 회원번호)를 읽는다(지운 뒤에는 못 읽음). 못 읽으면 아무것도 안 하고 실패 쪽으로 —
 *    카카오 회원번호를 모른 채 지우면 끊을 수 없다.
 * 3. `delete_my_account()` (회원 세션 — 서버 키 안 씀). **실패하면 아무것도 끊지 않고** 탈퇴 화면으로(`?withdraw=failed`).
 * 4. 카카오 identity 가 있으면 카카오 연결 끊기. **실패해도 탈퇴는 이미 끝난 것**이다(안내 한 줄만 더 붙는다).
 * 5. 로그인 쿠키 지우기(이 기기 세션만 — 계정이 이미 없어 서버에 묻지 않는다) → `/?account=withdrawn` 또는 `withdrawn-unlinked` 로 303.
 *
 * - **`POST` 만**(링크 미리 불러오기가 탈퇴시키지 않게 `GET` 은 405). 스위치를 끄면 POST · GET 모두 404.
 * - 서버 기록에는 단계와 오류 코드만(키 · 메일 · 회원번호 · 원문 없음).
 */
export async function POST(request: Request): Promise<Response> {
  // 요청 때 읽는다
  if (!(await membersEnabledNow()))
    return new NextResponse(null, { status: 404 });

  const { origin } = new URL(request.url);

  const requestOrigin = request.headers.get("origin");
  if (requestOrigin !== null && requestOrigin !== origin) {
    return new NextResponse(null, { status: 403 });
  }

  const see = (path: string) =>
    NextResponse.redirect(new URL(path, origin), { status: 303 });

  let confirmed = false;
  try {
    confirmed = (await request.formData()).get("confirm") === "on";
  } catch {
    confirmed = false;
  }
  if (!confirmed) return see("/account/withdraw?withdraw=confirm");

  const failed = () => see("/account/withdraw?withdraw=failed");

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    logAuthError("withdraw/client");
    return failed();
  }

  const identity = await readIdentity(supabase);
  if (!identity) return failed();

  const target = reauthTarget({
    providers: identity.providers,
    signupProvider: identity.signupProvider,
    naverEnabled: naverLoginEnabled(process.env),
  });
  if (target) {
    return startReauth({ supabase, origin, target, userId: identity.userId });
  }

  if (!(await deleteMyAccount(supabase))) return failed();

  // 탈퇴는 끝났다. 여기부터의 실패는 탈퇴를 되돌리지 않는다.
  let kakao: KakaoUnlinkResult = "skipped";
  if (identity.kakaoUserId) {
    kakao = await unlinkKakao({
      userId: identity.kakaoUserId,
      adminKey: process.env.KAKAO_ADMIN_KEY,
      baseUrl: process.env.KAKAO_API_BASE,
    });
  }

  try {
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) logAuthError("withdraw/signout", error.code);
  } catch {
    logAuthError("withdraw/signout");
  }

  // POST 뒤에는 303 이라야 브라우저가 GET 으로 돌아갈 화면을 연다
  return see(`/?account=${withdrawOutcome(identity.providers, kakao)}`);
}

/** GET 등은 탈퇴시키지 않는다: 스위치를 끄면 404, 켜면 405. */
export async function GET(): Promise<Response> {
  if (!(await membersEnabledNow()))
    return new NextResponse(null, { status: 404 });
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}

/**
 * 재인증 시작: 탈퇴 의도 쿠키를 심고 그 공급자 로그인 화면으로 보낸다. 아무것도 지우지 않는다.
 * 구글은 계정 고르기(`prompt=select_account`, 동의 화면을 다시 띄우지 않음), 네이버는 재인증 옵션(`auth_type=reauthenticate`).
 * 시작에 실패하면 쿠키를 심지 않고 탈퇴 화면의 실패 줄로.
 */
async function startReauth(input: {
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  origin: string;
  target: ReauthProvider;
  userId: string;
}): Promise<Response> {
  const { supabase, origin, target, userId } = input;
  const failed = () =>
    NextResponse.redirect(
      new URL("/account/withdraw?withdraw=failed", origin),
      { status: 303 },
    );
  try {
    const redirectTo = new URL("/auth/callback", origin);
    redirectTo.searchParams.set("flow", "withdraw");
    const { data, error } = await supabase.auth.signInWithOAuth({
      // 네이버는 사용자 지정(custom) 공급자라 타입에 없는 이름이다
      provider: reauthLoginProvider(target) as Parameters<
        typeof supabase.auth.signInWithOAuth
      >[0]["provider"],
      options: {
        redirectTo: redirectTo.toString(),
        skipBrowserRedirect: true,
        queryParams:
          target === "google"
            ? { prompt: "select_account" }
            : { auth_type: "reauthenticate" },
      },
    });
    if (error || !data?.url) {
      logAuthError("withdraw/reauth-start", error?.code);
      return failed();
    }
    const res = NextResponse.redirect(data.url, { status: 303 });
    res.cookies.set({
      name: WITHDRAW_INTENT_COOKIE,
      value: encodeIntent({
        who: whoOf(userId),
        provider: target,
        nowMs: Date.now(),
      }),
      httpOnly: true,
      sameSite: "lax",
      // http 주소(내 컴퓨터 시험)에서는 Secure 쿠키가 저장되지 않는다. 운영은 https.
      secure: origin.startsWith("https:"),
      path: WITHDRAW_INTENT_PATH,
      maxAge: WITHDRAW_INTENT_MAX_AGE,
    });
    return res;
  } catch {
    logAuthError("withdraw/reauth-start");
    return failed();
  }
}
