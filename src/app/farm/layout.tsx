import type { ReactNode } from "react";

import { MemberGate } from "../_components/shell/MemberGate";

/**
 * 농장 설정 · 작물 설정 쪽(`/farm/*`)은 로그인한 동의 회원만 (이슈 #191, 결정 0065).
 * 화면(F1 · F2)이 아직 없어 지금은 404 지만, 들어오면 이 관문이 자동으로 막는다.
 */
export default function Layout({ children }: { children: ReactNode }) {
  return <MemberGate>{children}</MemberGate>;
}
