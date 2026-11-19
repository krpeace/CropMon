import type { Metadata } from "next";

import { FontSizeScreen } from "../_components/shell/FontSizeScreen";

export const metadata: Metadata = { title: "글씨 크기" };

/** 글씨 크기 고르기 (2단계 화면, 이슈 #168). 데스크톱에서는 주소로만 열린다(들어가는 길은 로그인 이슈의 "내 계정"). */
export default function Page() {
  return <FontSizeScreen />;
}
