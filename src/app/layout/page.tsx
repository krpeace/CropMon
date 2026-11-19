import type { Metadata } from "next";

import { LayoutScreen } from "../_components/shell/LayoutScreen";

export const metadata: Metadata = { title: "화면 구성" };

/**
 * 화면 구성 (2단계 화면, 이슈 #176). 하단 탭 · 더보기에 나올 메뉴를 켜고 끄고 순서를 바꾼다 — 고르는 즉시 적용 · 저장.
 * 데스크톱에서는 주소로만 열린다(들어가는 길은 로그인 이슈의 "내 계정").
 */
export default function Page() {
  return <LayoutScreen />;
}
