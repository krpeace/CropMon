import { NextResponse, type NextRequest } from "next/server";

import { STATIONS } from "@/infra/stations";

/**
 * 폐지·휴지 지점(isActive=false) 번호 목록.
 * 사전에 등록되어 있지만 관측이 중단된 지점들이다 (결정 0037).
 */
const INACTIVE_STATION_IDS = new Set(
  STATIONS.filter((s) => !s.isActive).map((s) => s.id),
);

const DEFAULT_STATION_ID = 101;

export function middleware(request: NextRequest) {
  const { searchParams } = request.nextUrl;
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
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * 정적 파일과 API를 제외한 모든 화면 주소에 적용한다.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|api/).*)",
  ],
};
