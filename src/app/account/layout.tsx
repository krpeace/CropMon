import type { ReactNode } from "react";

import { MemberGate } from "../_components/shell/MemberGate";

/** 회원 정보 쪽(`/account/*`)은 로그인한 동의 회원만 (이슈 #191, 결정 0065). */
export default function Layout({ children }: { children: ReactNode }) {
  return <MemberGate>{children}</MemberGate>;
}
