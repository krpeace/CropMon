import { NextResponse } from "next/server";

import { membersEnabledNow } from "@/app/_lib/members";
import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";
import { declineAction, readConsentNext } from "@/domain/consent";
import { naverLoginEnabled } from "@/domain/members-switch";
import { reauthTarget } from "@/domain/withdraw-intent";
import { revokeGoogle } from "@/infra/google/revoke";
import { unlinkKakao } from "@/infra/kakao/unlink";
import { revokeNaver } from "@/infra/naver/revoke";
import { logAuthError } from "@/infra/supabase/auth-log";
import { readMyConsent } from "@/infra/supabase/member-consent";
import { deleteMyAccount, readIdentity } from "@/infra/supabase/member-profile";

type Client = Awaited<ReturnType<typeof createSupabaseServerClient>>;

/**
 * "동의하지 않고 나가기" `POST /auth/consent/decline?next=<돌아갈 주소>` (이슈 #199, 결정 0069). 동의 화면의 나가기 폼이 보낸다.
 * 공급자에서 돌아오는 순간 Supabase 가 계정을 먼저 만들기 때문에, **첫 동의 전에 나가는 사람은 그 자리에서 계정을 지운다.**
 * 로그아웃 길(`/auth/signout`)은 그대로 두고(내 계정 시트가 쓴다) 나가기만 이 길로 온다.
 *
 * 1. 스위치 끔 404 · `Origin` 이 있고 이 사이트가 아니면 403 · `next` 검사는 동의 길과 같은 `readConsentNext`.
 * 2. **지우기 전에** 로그인 정보(공급자 · 카카오 회원번호)를 읽는다(지운 뒤에는 못 읽음). 못 읽으면 지우지 않고 로그아웃만.
 * 3. 자기 `members` 줄의 동의 판을 읽어 `declineAction` 으로 정한다: **동의한 적이 없으면 지움**, 예전 판 동의자 · 읽기 실패는 로그아웃만.
 * 4. 지울 때: `delete_my_account()` → 카카오 끊기(어드민 키) · 구글/네이버 끊기(**세션에 공급자 토큰이 있을 때만**, 재인증 없음) →
 *    이 기기 로그인 쿠키 지움. **삭제가 실패해도 로그아웃은 한다**(남은 계정은 정기 정리 O2).
 * 5. 보던 화면(`next`)으로 303. **알림은 없다** — 끊기가 실패 · 건너뛰어도 마찬가지.
 *
 * - **`POST` 만**(링크 미리 불러오기가 지우지 않게 `GET` 은 405). 스위치를 끄면 POST · GET 모두 404.
 * - 서버 기록에는 단계와 오류 코드만(키 · 토큰 · 메일 · 회원번호 · 원문 없음).
 */
export async function POST(request: Request): Promise<Response> {
  // 요청 때 읽는다
  if (!(await membersEnabledNow()))
    return new NextResponse(null, { status: 404 });

  const { searchParams, origin } = new URL(request.url);

  const requestOrigin = request.headers.get("origin");
  if (requestOrigin !== null && requestOrigin !== origin) {
    return new NextResponse(null, { status: 403 });
  }

  const next = readConsentNext(searchParams.get("next"));
  // POST 뒤에는 303 이라야 브라우저가 GET 으로 돌아갈 화면을 연다
  const leave = () =>
    NextResponse.redirect(new URL(next, origin), { status: 303 });

  let supabase: Client;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    logAuthError("decline/client");
    return leave();
  }

  // 지우지 않는 모든 갈래의 끝: 로그아웃만 한다(`/auth/signout` 과 같은 호출).
  const signOutOnly = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) logAuthError("decline/signout", error.code);
    } catch {
      logAuthError("decline/signout");
    }
    return leave();
  };

  const identity = await readIdentity(supabase);
  if (!identity) return signOutOnly();

  if (declineAction(await readMyConsent(supabase)) !== "delete") {
    return signOutOnly();
  }

  // 구글 · 네이버는 로그인 직후 세션에 공급자 토큰이 남아 있을 때만 끊는다. 회원 확인은 위의 getUser() 결과로만 하고,
  // getSession() 은 토큰 한 값만 꺼내 쓴다(세션의 user 는 판단에 쓰지 않는다). 토큰은 이 요청 안에서만 쓴다.
  const target = reauthTarget({
    providers: identity.providers,
    signupProvider: identity.signupProvider,
    naverEnabled: naverLoginEnabled(process.env),
  });
  let providerToken: string | null = null;
  if (target) {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data?.session?.provider_token;
      providerToken = typeof token === "string" ? token : null;
    } catch {
      logAuthError("decline/session");
    }
  }

  // 삭제가 실패하면 아무것도 끊지 않고 로그아웃만 한다
  if (!(await deleteMyAccount(supabase))) return signOutOnly();

  // 삭제는 끝났다. 여기부터의 실패는 되돌리지 않고 알림도 없다.
  if (identity.kakaoUserId && identity.providers.includes("kakao")) {
    await unlinkKakao({
      userId: identity.kakaoUserId,
      adminKey: process.env.KAKAO_ADMIN_KEY,
      baseUrl: process.env.KAKAO_API_BASE,
    });
  }
  if (target === "google") {
    await revokeGoogle({
      token: providerToken,
      baseUrl: process.env.GOOGLE_API_BASE,
    });
  } else if (target === "naver") {
    await revokeNaver({
      token: providerToken,
      clientId: process.env.NAVER_CLIENT_ID,
      clientSecret: process.env.NAVER_CLIENT_SECRET,
      baseUrl: process.env.NAVER_API_BASE,
    });
  }

  try {
    // 계정이 이미 없어 서버에 묻지 않는다 — 이 기기 쿠키만 지운다
    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) logAuthError("decline/signout", error.code);
  } catch {
    logAuthError("decline/signout");
  }
  return leave();
}

/** GET 등은 지우지 않는다: 스위치를 끄면 404, 켜면 405. */
export async function GET(): Promise<Response> {
  if (!(await membersEnabledNow()))
    return new NextResponse(null, { status: 404 });
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
