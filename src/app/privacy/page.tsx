import type { Metadata } from "next";

import { LEGAL_DOCS } from "@/domain/legal";

import { LegalScreen } from "../_components/legal/LegalScreen";

export const metadata: Metadata = { title: LEGAL_DOCS.privacy.title };

/** 개인정보처리방침 공개 주소 (이슈 #173). 로그인 없이 열리는 정적 화면 — 본문은 content/legal 의 글 파일. */
export default function Page() {
  return <LegalScreen id="privacy" />;
}
