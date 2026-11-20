import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { membersEnabledNow } from "@/app/_lib/members";
import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";
import {
  CURRENT_PATH_HEADER,
  consentGate,
  consentHref,
  loginHrefFor,
  readConsentNext,
  type ConsentRead,
} from "@/domain/consent";
import { readUserFromClaims } from "@/infra/supabase/current-user";
import { readMyConsent } from "@/infra/supabase/member-consent";

/**
 * 로그인 필요 쪽(농장 설정 · 작물 설정 · 회원 정보)의 **공통 관문** (이슈 #191, 결정 0065). 서버 전용 · 요청 때 그린다.
 * 로그인 필요 화면의 레이아웃(`farm/layout.tsx` · `account/layout.tsx`)이 부르므로 F1 · F2 · L6 화면이 들어오면 자동으로 막힌다.
 *
 * - 스위치 끔 → 404 (알파와 같다)
 * - 로그인하지 않음 → 로그인 시트(`/?login=1&next=…`, 프록시가 먼저 보내지만 한 번 더 확인)
 * - **동의 전 · 읽기 실패 → `/consent?next=<지금 주소>`** (동의 전에는 회원 기능을 막는다)
 * - 통과하면 사용자 id 를 돌려준다.
 * 이것은 "동의 화면으로 보내 주는 편의"이고 진짜 막이는 DB 의 RLS 다(결정 0061 · 0065). **`/consent` 는 이 관문을 지나지 않는다**(자기 자신으로 돌고 도는 일 방지).
 */
export async function requireMemberConsent(): Promise<{ userId: string }> {
  const switchOn = await membersEnabledNow();
  if (!switchOn) notFound();

  const next = readConsentNext((await headers()).get(CURRENT_PATH_HEADER));
  const supabase = await createSupabaseServerClient();
  const user = await readUserFromClaims(supabase);
  const read: ConsentRead | null = user ? await readMyConsent(supabase) : null;

  const decision = consentGate({
    switchOn,
    signedIn: user !== null,
    read,
    onConsentPage: false,
  });
  if (decision === "login") redirect(loginHrefFor(next));
  if (decision === "consent") redirect(consentHref(next));
  // 여기까지 오면 로그인한 동의 회원이다
  return { userId: user!.id };
}
