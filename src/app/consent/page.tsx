import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { membersEnabledNow } from "@/app/_lib/members";
import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";
import {
  consentGate,
  consentHref,
  loginHrefFor,
  readConsentNext,
  type ConsentRead,
} from "@/domain/consent";
import { readUserFromClaims } from "@/infra/supabase/current-user";
import { readMyConsent } from "@/infra/supabase/member-consent";

import { ConsentScreen } from "../_components/consent/ConsentScreen";
import { LegalView } from "../_components/legal/LegalView";

export const metadata: Metadata = {
  title: "동의",
  // 첫 로그인 직후에만 보는 화면이라 검색에 나오지 않게 한다
  robots: { index: false, follow: false },
};

/**
 * 동의 화면 `/consent?next=<동의 뒤 돌아갈 곳>` (이슈 #191, 결정 0065). 로그인 필요 주소다(`LOGIN_REQUIRED_PATHS`).
 * **이 화면은 공통 관문(`requireMemberConsent`)을 지나지 않는다** — 동의 화면이 자기 자신으로 돌고 도는 일이 없게(`consentGate`의 `onConsentPage`).
 * 들어올 때 서버에서 다시 확인한다: 스위치 끔 → 404(프록시가 먼저 막지만 한 번 더) · 로그인 안 함 → 로그인 시트 · 이미 동의함 → `next` ·
 * 동의 전(읽기 실패 포함) → 그린다. 동적 부분은 `<Suspense>` 안에서 요청 때 그린다(공개 화면은 정적인 채).
 */
export default function Page({ searchParams }: PageProps<"/consent">) {
  return (
    <Suspense fallback={null}>
      <Consent searchParams={searchParams} />
    </Suspense>
  );
}

async function Consent({
  searchParams,
}: {
  searchParams: PageProps<"/consent">["searchParams"];
}) {
  const params = await searchParams;
  const one = (v: string | string[] | undefined) =>
    typeof v === "string" ? v : null;
  const next = readConsentNext(one(params.next));
  const failed = one(params.consent) === "failed";

  const switchOn = await membersEnabledNow();
  let signedIn = false;
  let read: ConsentRead | null = null;
  if (switchOn) {
    const supabase = await createSupabaseServerClient();
    const user = await readUserFromClaims(supabase);
    signedIn = user !== null;
    read = user ? await readMyConsent(supabase) : null;
  }

  const decision = consentGate({
    switchOn,
    signedIn,
    read,
    onConsentPage: true,
  });
  if (decision === "not-found") notFound();
  if (decision === "login") redirect(loginHrefFor(consentHref(next)));
  if (decision === "leave") redirect(next);

  return (
    <ConsentScreen
      next={next}
      failed={failed}
      views={{
        terms: <LegalView id="terms" />,
        privacy: <LegalView id="privacy" />,
      }}
    />
  );
}
