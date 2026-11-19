import { NextResponse, type NextRequest } from "next/server";

import {
  hasAuthCookie,
  loginRequiredRedirect,
  requiresLogin,
} from "@/domain/auth";
import { membersEnabled } from "@/domain/members-switch";
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
 * 3. 켜져 있으면(결정 0061): 로그인 쿠키가 없는 요청은 Supabase 를 부르지 않는다(방문자 대부분).
 *    로그인 필요 주소(`LOGIN_REQUIRED_PATHS`)를 비로그인으로 열면 `/?login=1&next=<그 주소>` 로 보낸다(L3 의 로그인 시트가 읽는다).
 *    로그인 쿠키가 있으면 세션을 갱신한다.
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
  if (!membersEnabled(process.env)) return NextResponse.next();

  const loginUrl = () =>
    new URL(loginRequiredRedirect(pathname, search), request.url);

  if (!hasAuthCookie(request.cookies.getAll().map((c) => c.name))) {
    return requiresLogin(pathname)
      ? NextResponse.redirect(loginUrl())
      : NextResponse.next();
  }

  const { response, signedIn } = await updateProxySession(request);
  if (signedIn || !requiresLogin(pathname)) return response;

  // 갱신된(또는 지워진) 세션 쿠키를 돌려보내는 응답에도 싣는다
  const redirect = NextResponse.redirect(loginUrl());
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  matcher: [
    /*
     * 정적 파일과 API를 제외한 모든 화면 주소에 적용한다.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|api/).*)",
  ],
};
