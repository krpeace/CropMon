import {
  draftNotice,
  effectiveLine,
  LEGAL_DOCS,
  type LegalId,
} from "@/domain/legal";

import { Badge } from "../ui/Badge";
import { LegalBody } from "./LegalBody";
import { loadLegalBlocks } from "./load-legal";

/**
 * 약관 · 개인정보처리방침 **본문만** (이슈 #191, 결정 0065). 동의 화면의 [보기]가 화면을 떠나지 않고 보여 주려고
 * `LegalScreen`(문서 바꾸기 링크 · 운영자 표기 · 쪽 제목 포함)에서 본문 부분만 떼어 쓴다 — "예시 글" 배지 · 시행일 줄 · 본문.
 * 서버 부품이다(글 파일을 읽는다). 클라이언트의 동의 화면에는 만들어진 모양을 넘긴다.
 */
export function LegalView({ id }: { id: LegalId }) {
  const doc = LEGAL_DOCS[id];
  const blocks = loadLegalBlocks(doc);
  const notice = draftNotice(doc);

  return (
    <div className="flex flex-col gap-4 pb-4">
      {notice && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <Badge>{notice.badge}</Badge>
          <span className="text-14 text-ink-2/85 min-w-0 flex-1 leading-snug">
            {notice.text}
          </span>
        </div>
      )}
      <p className="text-14 text-ink-2/85 m-0 font-semibold">
        {effectiveLine(doc)}
      </p>
      <LegalBody blocks={blocks} />
    </div>
  );
}
