"use client";

import { pickNotice } from "@/domain/notice";

import { closeNotice, useClosedNotices } from "../shell/notice-store";
import { NoticeCard } from "./NoticeCard";

/**
 * 종합 맨 위 알리기 카드 (이슈 #168, 결정 0055). 카드는 한 번에 하나 — 고르는 규칙은 `domain/notice.ts` 의 `pickNotice`.
 * ①(농장 등록 권하기) ②(가온 시작일)는 F1 · W4 에서 만들고, 지금은 ③ 글씨 크기만 실제로 나온다.
 * 서버가 카드를 그려 두고, 이미 닫은 사람에게는 CSS 가 첫 그리기부터 숨긴다(밀림 · 깜박임 없음).
 * 브라우저에서 닫은 기록을 읽은 뒤에는 이 부품이 카드를 거둔다(F1 · W4 카드가 있으면 다음 카드로 바뀐다).
 */
export function HomeNotice({ fontSizeHref }: { fontSizeHref: string }) {
  const closed = useClosedNotices();
  const id = pickNotice({ fontSize: !closed.includes("fontSize") });
  if (id !== "fontSize") return null;
  return (
    <NoticeCard
      id="fontSize"
      text="글씨가 작으면 크게 볼 수 있어요"
      buttonLabel="글씨 크기"
      href={fontSizeHref}
      onClose={() => closeNotice("fontSize")}
    />
  );
}
