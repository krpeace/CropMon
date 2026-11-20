import type { Metadata } from "next";
import { Suspense } from "react";

import { createSupabaseServerClient } from "@/app/_lib/supabase/server-client";
import { buildAccountInfo, type AccountInfo } from "@/domain/account-info";
import { readIdentity, readMemberRow } from "@/infra/supabase/member-profile";

import { AccountScreen } from "../_components/account/AccountScreen";

export const metadata: Metadata = {
  title: "회원 정보",
  robots: { index: false, follow: false },
};

const str = (v: unknown): string | null => (typeof v === "string" ? v : null);

/**
 * 회원 정보 `/account` (이슈 #195, 결정 0067). L4(결정 0065)의 임시 쪽을 이어받은 실제 화면이다.
 * 로그인한 동의 회원만 들어오고(`account/layout.tsx` 의 `MemberGate`), 스위치를 끄면 프록시가 없는 주소로 다시 써서 404 다(알파와 같음).
 * 이름 · 공급자 · 가입일 · 동의 열은 `members` 에서, 메일은 로그인 정보에서 **요청 때** 읽는다 — `<Suspense>` 안이라 공개 화면은 정적인 채다.
 * 개인 값은 서버 기록에 남기지 않는다.
 */
export default function Page() {
  return (
    <Suspense fallback={null}>
      <Account />
    </Suspense>
  );
}

async function Account() {
  const supabase = await createSupabaseServerClient();
  const [identity, member] = await Promise.all([
    readIdentity(supabase),
    readMemberRow(supabase),
  ]);

  let info: AccountInfo | null = null;
  if (member.ok && member.row) {
    const row = member.row;
    info = buildAccountInfo({
      provider: str(row.provider) ?? identity?.providers[0] ?? null,
      displayName: str(row.display_name),
      email: identity?.email ?? null,
      createdAt: str(row.created_at),
      termsVersion: str(row.terms_version),
      termsAgreedAt: str(row.terms_agreed_at),
      privacyVersion: str(row.privacy_version),
      privacyConfirmedAt: str(row.privacy_confirmed_at),
    });
  }
  return <AccountScreen info={info} />;
}
