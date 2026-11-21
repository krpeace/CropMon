import type { Metadata } from "next";
import { Suspense } from "react";

import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";
import { naverLoginEnabled } from "@/domain/members-switch";
import { reauthTarget } from "@/domain/withdraw-intent";
import { readIdentity } from "@/infra/supabase/member-profile";

import { WithdrawScreen } from "../../_components/account/WithdrawScreen";

export const metadata: Metadata = {
  title: "회원탈퇴",
  robots: { index: false, follow: false },
};

/**
 * 회원탈퇴 확인 `/account/withdraw` (이슈 #195, 결정 0067). 로그인한 동의 회원만(`account/layout.tsx`), 스위치 끔 → 404.
 * 서버가 `POST /auth/withdraw` · 재인증 콜백의 결과를 `?withdraw=failed | confirm | expired` 로 알려 준다(주소 검색어는 요청 때 읽으므로 `<Suspense>` 안).
 */
export default function Page({ searchParams }: PageProps<"/account/withdraw">) {
  return (
    <Suspense fallback={null}>
      <Withdraw searchParams={searchParams} />
    </Suspense>
  );
}

async function Withdraw({
  searchParams,
}: {
  searchParams: PageProps<"/account/withdraw">["searchParams"];
}) {
  const params = await searchParams;
  const value = typeof params.withdraw === "string" ? params.withdraw : null;

  // 네이버 로그인이 열렸는지는 한 번만 읽어 재인증 대상과 연결 줄 문구(#205, "네이버"를 뺄지)에 같이 쓴다 — 판단이 하나다.
  const naverOn = naverLoginEnabled(process.env);
  // 구글 · 네이버 회원은 탈퇴하기를 누르면 재인증을 한다(이슈 #197) — 안내 줄을 보이려고 서버가 대상 여부를 안다. 못 읽으면 줄만 뺀다.
  const identity = await readIdentity(await createSupabaseServerClient());
  const reauth = identity
    ? reauthTarget({
        providers: identity.providers,
        signupProvider: identity.signupProvider,
        naverEnabled: naverOn,
      })
    : null;

  return (
    <WithdrawScreen
      notice={
        value === "failed" || value === "confirm" || value === "expired"
          ? value
          : null
      }
      reauth={reauth}
      naverOn={naverOn}
    />
  );
}
