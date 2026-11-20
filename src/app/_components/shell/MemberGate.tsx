import { type ReactNode, Suspense } from "react";

import { requireMemberConsent } from "@/app/_lib/consent-gate";

/**
 * 로그인 필요 쪽(`/farm/*` · `/account/*`)의 레이아웃이 감싸는 **공통 관문** (이슈 #191, 결정 0065).
 * 요청이 올 때 로그인 · 동의를 확인하고(`requireMemberConsent`), 동의 전이면 `/consent?next=<지금 주소>` 로 보낸다.
 * `cacheComponents` 에서는 요청 정보를 읽는 부분이 `<Suspense>` 안에 있어야 해서 여기서 감싼다 — 안쪽 쪽(F1 · F2 · L6)은 정적으로 두어도
 * 이 관문이 요청 때 먼저 확인한다. `/consent` 는 이 관문 밖이다(자기 자신으로 돌고 도는 일 없음).
 * 진짜 막이는 DB 의 RLS 다(이 관문은 동의 화면으로 보내 주는 편의).
 */
export function MemberGate({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <Gated>{children}</Gated>
    </Suspense>
  );
}

async function Gated({ children }: { children: ReactNode }) {
  await requireMemberConsent();
  return children;
}
