import type { Metadata } from "next";
import { Suspense } from "react";

import { WithdrawScreen } from "../../_components/account/WithdrawScreen";

export const metadata: Metadata = {
  title: "회원탈퇴",
  robots: { index: false, follow: false },
};

/**
 * 회원탈퇴 확인 `/account/withdraw` (이슈 #195, 결정 0067). 로그인한 동의 회원만(`account/layout.tsx`), 스위치 끔 → 404.
 * 서버가 `POST /auth/withdraw` 의 결과를 `?withdraw=failed | confirm` 으로 알려 준다(주소 검색어는 요청 때 읽으므로 `<Suspense>` 안).
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
  return (
    <WithdrawScreen
      notice={value === "failed" || value === "confirm" ? value : null}
    />
  );
}
