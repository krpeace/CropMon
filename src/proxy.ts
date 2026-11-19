import { NextResponse, type NextRequest } from "next/server";

import {
  hasAuthCookie,
  loginRequiredRedirect,
  requiresLogin,
} from "@/domain/auth";
import {
  MEMBERS_STATE_COOKIE,
  membersCookieAction,
  wantedMembersCookie,
} from "@/domain/members-state";
import { membersEnabled, naverLoginEnabled } from "@/domain/members-switch";
import { STATIONS } from "@/infra/stations";
import { updateProxySession } from "@/app/_lib/supabase/proxy-client";

/**
 * 폐지·휴지 지점(isActive=false) 번호 목록.
 * 사전에 등록되어 있지만 관측이 중단된 지점들이다 (결정 0037).
 */
const INACTIVE_STATION_IDS = new Set(
  STATIONS.filter((s) => !s.isActive).map((s) => s.id),
);

const DEFAULT_STATION_ID = 101;

/**
 * 모든 화면 요청 앞에서 도는 관문 (Next.js 16 proxy, 예전 이름 middleware).
 * 1. 폐지·휴지 지점이면 기본 지점으로 돌려보낸다 (결정 0037, 스위치와 상관없음).
 * 2. **회원제 스위치(`MEMBERS_ENABLED`)가 꺼져 있으면 여기서 끝** — 세션도 쿠키도 건드리지 않는다(지금 알파와 똑같다).
 *    단 켰다가 끈 뒤에 남은 표시 쿠키(`cm_m`)가 요청에 **있을 때만** 지운다(없는 방문자에게는 아무것도 안 한다).
 * 3. 켜져 있으면(결정 0061): 로그인 쿠키가 없는 요청은 Supabase 를 부르지 않는다(방문자 대부분).
 *    로그인 필요 주소(`LOGIN_REQUIRED_PATHS`)를 비로그인으로 열면 `/?login=1&next=<그 주소>` 로 보낸다(로그인 시트가 읽는다).
 *    로그인 쿠키가 있으면 세션을 갱신한다.
 * 4. 켜져 있으면 표시 쿠키 `cm_m`(결정 0064)을 **값이 다를 때만** 쓴다 — 헤더가 "스위치 켬 · 로그인함"을 알게 하는 값이고
 *    개인 값은 없다. 로그인함 여부는 위 세션 확인의 결과를 쓰므로 Supabase 호출이 늘지 않는다.
 * 공개가 기본이다 — 목록에 없는 주소는 로그인 여부와 상관없이 그대로 연다.
 */
export async function proxy(request: NextRequest) {
  const { searchParams, pathname, search } = request.nextUrl;

  const st = searchParams.get("st");
  if (st) {
    const id = Number(st);
    if (INACTIVE_STATION_IDS.has(id)) {
      const url = request.nextUrl.clone();
      url.searchParams.set("st", String(DEFAULT_STATION_ID));
      url.searchParams.set("from", String(id));
      return NextResponse.redirect(url);
    }
  }

  // 요청 때 읽는다(빌드 때 굳지 않게 모듈 맨 위에서 읽지 않는다)
  const membersOn = membersEnabled(process.env);
  const naverOn = membersOn && naverLoginEnabled(process.env);
  const currentState = request.cookies.get(MEMBERS_STATE_COOKIE)?.value;
  const https = request.nextUrl.protocol === "https:";

  /** 표시 쿠키를 응답에 싣는다(다를 때만). 어떤 응답에도 같은 규칙. */
  const withState = <R extends NextResponse>(
    response: R,
    signedIn: boolean,
  ): R => {
    const action = membersCookieAction(
      currentState,
      wantedMembersCookie({ membersOn, naverOn, signedIn }),
    );
    if (action.kind === "set") {
      // 자바스크립트가 읽어야 하므로 HttpOnly 아님. 만료를 안 주어 브라우저를 닫으면 사라진다(다음 방문 때 다시 심는다).
      response.cookies.set(MEMBERS_STATE_COOKIE, action.value, {
        path: "/",
        sameSite: "lax",
        secure: https,
      });
    } else if (action.kind === "clear") {
      response.cookies.set(MEMBERS_STATE_COOKIE, "", { path: "/", maxAge: 0 });
    }
    return response;
  };

  if (!membersOn) return withState(NextResponse.next(), false);

  const loginUrl = () =>
    new URL(loginRequiredRedirect(pathname, search), request.url);

  if (!hasAuthCookie(request.cookies.getAll().map((c) => c.name))) {
    return withState(
      requiresLogin(pathname)
        ? NextResponse.redirect(loginUrl())
        : NextResponse.next(),
      false,
    );
  }

  const { response, signedIn } = await updateProxySession(request);
  if (signedIn || !requiresLogin(pathname)) {
    return withState(response, signedIn);
  }

  // 갱신된(또는 지워진) 세션 쿠키를 돌려보내는 응답에도 싣는다
  const redirect = NextResponse.redirect(loginUrl());
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return withState(redirect, false);
}

export const config = {
  matcher: [
    /*
     * 정적 파일과 API를 제외한 모든 화면 주소에 적용한다.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|api/).*)",
  ],
};
