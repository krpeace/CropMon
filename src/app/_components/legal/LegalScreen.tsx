import Link from "next/link";

import {
  draftNotice,
  effectiveLine,
  LEGAL_DOCS,
  LEGAL_IDS,
  legalHref,
  type LegalId,
} from "@/domain/legal";

import { OperatorLine } from "../shell/OperatorLine";
import { Badge } from "../ui/Badge";
import { LegalBody } from "./LegalBody";
import { loadLegalBlocks } from "./load-legal";

/**
 * 약관 · 개인정보처리방침 화면 (이슈 #173, 결정 0057, 디자인 규칙 v0.4.6 12절 "약관"). 위에서 아래로:
 * 두 문서 바꾸기(링크 두 칸) → "예시 글" 배지 + 안내(`draft` 일 때만) → 시행일 줄 → 본문 → 운영자 표기.
 * 로그인 없이 열리는 공개 주소의 **정적 화면**이다(DB 를 읽지 않음). 데스크톱은 본문 폭을 720px 안팎으로 제한한다.
 * 쪽 큰 제목 h1 은 화면 읽기용으로만 두고(`sr-only`) 본문 첫 제목(`##`)을 문서 제목으로 보인다.
 */
export function LegalScreen({ id }: { id: LegalId }) {
  const doc = LEGAL_DOCS[id];
  const blocks = loadLegalBlocks(doc);
  const notice = draftNotice(doc);

  return (
    <div className="mx-auto flex w-full max-w-180 flex-col gap-4 pb-4">
      <h1 className="sr-only">{doc.title}</h1>

      <nav
        aria-label="문서 바꾸기"
        className="bg-fill/14 grid grid-cols-2 gap-1 rounded-full p-1"
      >
        {LEGAL_IDS.map((other) => {
          const current = other === id;
          return (
            <Link
              key={other}
              href={legalHref(other)}
              aria-current={current ? "page" : undefined}
              className={`text-15 fh-44 flex items-center justify-center rounded-full px-2 text-center leading-tight font-bold ${
                current ? "bg-brand text-white" : "text-ink"
              }`}
            >
              {LEGAL_DOCS[other].title}
            </Link>
          );
        })}
      </nav>

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

      <OperatorLine
        testId="legal-operator"
        wrapAddress
        className="border-ink-2/20 mt-2 border-t-(length:--hairline) pt-4"
      />
    </div>
  );
}
