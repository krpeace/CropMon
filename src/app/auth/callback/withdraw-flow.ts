import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";
import { whoOf } from "@/app/_lib/who";
import {
  withdrawOutcomeFor,
  type AccountProvider,
  type KakaoUnlinkResult,
} from "@/domain/account-info";
import { classifyOAuthCallbackError } from "@/domain/auth";
import {
  cookieValue,
  readIntent,
  WITHDRAW_INTENT_COOKIE,
  WITHDRAW_INTENT_PATH,
} from "@/domain/withdraw-intent";
import { revokeGoogle } from "@/infra/google/revoke";
import { unlinkKakao } from "@/infra/kakao/unlink";
import { revokeNaver } from "@/infra/naver/revoke";
import { logAuthError } from "@/infra/supabase/auth-log";
import { deleteMyAccount, readIdentity } from "@/infra/supabase/member-profile";

const WITHDRAW_SCREEN = "/account/withdraw";
const FAILED = `${WITHDRAW_SCREEN}?withdraw=failed`;
const EXPIRED = `${WITHDRAW_SCREEN}?withdraw=expired`;

/** 응답에서 탈퇴 의도 쿠키를 지운다 — 어느 갈래든(성공 · 실패 · 취소 · 만료) 마지막에 지운다. */
export function clearIntentCookie(res: NextResponse, origin: string): void {
  res.cookies.set({
    name: WITHDRAW_INTENT_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: origin.startsWith("https:"),
    path: WITHDRAW_INTENT_PATH,
    maxAge: 0,
    // Max-Age=0 만으로는 Next 가 다른 쿠키(로그아웃의 세션 쿠키)와 합치는 과정에서 만료가 빠져 빈 값의 세션 쿠키로 남는 일이 e2e 로 확인되었다 —
    // 과거 날짜(Expires)를 함께 둔다.
    expires: new Date(0),
  });
}

/**
 * 탈퇴 재인증 콜백 `GET /auth/callback?flow=withdraw` (이슈 #197, 결정 0068). `POST /auth/withdraw` 가 재인증을 시작한 사람이
 * 공급자에서 돌아오는 곳이다. **가장 중요한 것은 엉뚱한 계정을 지우지 않는 것.** 일반 로그인 일
 * (`ensure_my_member` · 동의 판단 · `login=ok` · `next`)은 하지 않는다.
 *
 * 1. 공급자 화면에서 취소(`access_denied`) → 말 없이 탈퇴 화면. 그 밖의 오류 → 실패 줄. **코드 교환 전이라 원래 세션은 그대로.**
 * 2. **탈퇴 의도 쿠키가 없음 · 깨짐 · 만료면 코드 교환도 하지 않는다**(누구로 로그인될지 모르므로 원래 세션을 지킨다) → 만료 줄.
 * 3. 코드 교환 → 새 세션의 로그인 정보 읽기. 실패하면 알 수 없는 세션이므로 이 기기 쿠키를 지우고 실패 줄.
 * 4. **새 세션의 회원 번호 해시가 의도의 해시와 다르면(다른 계정) 아무것도 지우지 않고** 이 기기 쿠키만 지운 뒤 알림(`withdraw-other`).
 *    그 다른 계정이 이번 재인증으로 새로 만들어졌다면 동의 전 계정이라 O2(24시간 정리)가 지운다 — 여기서 지우지 않는다.
 * 5. 같으면: `delete_my_account()`(실패하면 아무것도 안 끊음 · 로그아웃도 안 함) → **방금 받은 공급자 토큰으로 끊기**(구글 취소 · 네이버 삭제,
 *    토큰이 없으면 실패 취급) → 카카오 identity 도 있으면 어드민 키로 끊기 → 이 기기 쿠키 지움 → 종합으로 + 알림.
 *    끊기가 하나라도 안 되면 알림에 안내 한 줄(`withdrawOutcomeFor`).
 *
 * **공급자 토큰은 이 요청 안에서만** 쓴다(쿠키 · DB · 기록 · 주소에 남기지 않음). 기록에는 단계와 오류 코드만.
 */
export async function handleWithdrawCallback(
  request: Request,
): Promise<Response> {
  const { searchParams, origin } = new URL(request.url);

  const go = (path: string) => {
    const res = NextResponse.redirect(new URL(path, origin), { status: 302 });
    clearIntentCookie(res, origin);
    return res;
  };

  const error = searchParams.get("error");
  const errorCode = searchParams.get("error_code");
  const errorDescription = searchParams.get("error_description");
  if (error || errorCode || errorDescription) {
    const notice = classifyOAuthCallbackError(
      error,
      errorCode,
      errorDescription,
    );
    // 취소는 사용자의 선택이라 기록 · 안내 없음. 그 밖의 오류만 단계를 남긴다(원문은 남기지 않음).
    if (notice === "cancelled") return go(WITHDRAW_SCREEN);
    logAuthError("withdraw/provider-error");
    return go(FAILED);
  }

  const intent = readIntent(
    cookieValue(request.headers.get("cookie"), WITHDRAW_INTENT_COOKIE),
    Date.now(),
  );
  if (!intent.ok) {
    logAuthError("withdraw/intent", intent.reason);
    return go(EXPIRED);
  }

  const code = searchParams.get("code");
  if (!code) {
    logAuthError("withdraw/no-code");
    return go(FAILED);
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>;
  try {
    // 코드를 세션으로 바꾸는 것은 서버가 하므로, Supabase 가 남기는 기기 정보가 사람의 브라우저가 되게 User-Agent 를 넘긴다
    supabase = await createSupabaseServerClient({
      userAgent: request.headers.get("user-agent"),
    });
  } catch {
    logAuthError("withdraw/client");
    return go(FAILED);
  }

  let providerToken: string | null = null;
  try {
    const exchange = await supabase.auth.exchangeCodeForSession(code);
    if (exchange.error) {
      logAuthError("withdraw/exchange", exchange.error.code);
      return go(FAILED);
    }
    const token = exchange.data?.session?.provider_token;
    providerToken = typeof token === "string" ? token : null;
  } catch {
    logAuthError("withdraw/exchange");
    return go(FAILED);
  }

  // 여기부터는 이 기기의 세션이 방금 로그인한 계정으로 바뀌어 있다 — 지우지 않고 돌아갈 때는 이 기기 쿠키를 지워야 한다.
  const signOutLocal = async () => {
    try {
      const { error: outError } = await supabase.auth.signOut({
        scope: "local",
      });
      if (outError) logAuthError("withdraw/signout", outError.code);
    } catch {
      logAuthError("withdraw/signout");
    }
  };

  const identity = await readIdentity(supabase);
  if (!identity) {
    await signOutLocal();
    return go(FAILED);
  }

  if (whoOf(identity.userId) !== intent.who) {
    await signOutLocal();
    return go("/?account=withdraw-other");
  }

  if (!(await deleteMyAccount(supabase))) return go(FAILED);

  // 탈퇴는 끝났다. 여기부터의 실패는 탈퇴를 되돌리지 않는다.
  const results: Partial<Record<AccountProvider, KakaoUnlinkResult>> = {};
  results[intent.provider] =
    intent.provider === "google"
      ? await revokeGoogle({
          token: providerToken,
          baseUrl: process.env.GOOGLE_API_BASE,
        })
      : await revokeNaver({
          token: providerToken,
          clientId: process.env.NAVER_CLIENT_ID,
          clientSecret: process.env.NAVER_CLIENT_SECRET,
          baseUrl: process.env.NAVER_API_BASE,
        });
  if (identity.kakaoUserId && identity.providers.includes("kakao")) {
    results.kakao = await unlinkKakao({
      userId: identity.kakaoUserId,
      adminKey: process.env.KAKAO_ADMIN_KEY,
      baseUrl: process.env.KAKAO_API_BASE,
    });
  }

  await signOutLocal();
  return go(`/?account=${withdrawOutcomeFor(identity.providers, results)}`);
}
