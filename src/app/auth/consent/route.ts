import { NextResponse } from "next/server";

import { membersEnabledNow } from "@/app/_lib/members";
import { consentHref, readConsentNext } from "@/domain/consent";
import { withLoginNotice } from "@/domain/auth";
import { LEGAL_DOCS } from "@/domain/legal";
import { recordMyConsent } from "@/infra/supabase/member-consent";
import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";

/**
 * 동의 기록 `POST /auth/consent?next=<돌아갈 주소>` (이슈 #191, 결정 0065). "동의하고 시작하기" 폼이 보낸다.
 * 자바스크립트 없이도 되도록 폼 `POST` 이고, 체크 칸 상태(폼 값)와 상관없이 **셋 모두로 기록**한다.
 *
 * - **판 값은 서버가 `legal.ts` 에서 넣는다.** 폼 · 주소로 온 판 값은 읽지도 않는다(위조해도 무시).
 * - `public.record_my_consent` 가 다섯 열(`terms_version` · `terms_agreed_at` · `privacy_version` · `privacy_confirmed_at` ·
 *   `age14_confirmed_at`)을 DB 시각 `now()` 로 한 번에 쓴다. 회원은 이 열을 직접 못 고친다(v2.3).
 * - 성공 → `next` + `login=ok` 로 303(첫 로그인의 "로그인했어요"는 동의 뒤 한 번). 실패 → 동의 화면으로 `consent=failed`.
 * - **`POST` 만**(링크 미리 불러오기가 동의를 기록하지 않게 `GET` 은 405). **`Origin` 이 있고 이 사이트가 아니면 403**, 없으면 통과 —
 *   로그아웃과 같은 규칙이다. 근거: 로그인 쿠키가 `SameSite=Lax` 라 다른 사이트에서 보낸 `POST` 에는 세션이 실리지 않는다.
 * - 스위치를 끄면 POST · GET 모두 404 (쿠키도 안 건드림).
 * - 서버 기록에는 단계와 오류 코드만(원문 · 개인 값 없음).
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

  const next = readConsentNext(searchParams.get("next"));
  const see = (path: string) =>
    NextResponse.redirect(new URL(path, origin), { status: 303 });

  let recorded = false;
  try {
    const supabase = await createSupabaseServerClient();
    recorded = await recordMyConsent(
      supabase,
      LEGAL_DOCS.terms.version,
      LEGAL_DOCS.privacy.version,
    );
  } catch {
    recorded = false;
  }

  // POST 뒤에는 303 이라야 브라우저가 GET 으로 돌아갈 화면을 연다
  return recorded
    ? see(withLoginNotice(next, "ok"))
    : see(consentHref(next, true));
}

/** GET 등은 기록하지 않는다: 스위치를 끄면 404, 켜면 405. */
export async function GET() {
  if (!(await membersEnabledNow()))
    return new NextResponse(null, { status: 404 });
  return new NextResponse(null, { status: 405, headers: { Allow: "POST" } });
}
