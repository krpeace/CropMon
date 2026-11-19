"use client";

import Link from "next/link";

import { useAppliedFz } from "../shell/font-scale-store";

/**
 * 종합 맨 위 알리기 카드 한 장 (문구 · 버튼 · 닫기). 이슈 #168, 결정 0055 — F1 · W4 가 같은 부품으로 자기 카드를 만든다.
 * 모양은 시안 v0.4.6 종합의 알리기 카드(연한 초록 바탕 · 초록 테두리 · 진한 초록 알약 버튼 · 오른쪽 ×).
 * `data-notice` 는 이미 닫은 카드를 첫 그리기부터 숨기는 CSS(globals.css)와 짝이다.
 * **130% 이상에서는 버튼이 글자 아래 줄로 내려간다** — 폭이 아니라 지금 적용된 글씨 크기(--fz)로 정한다
 * ("휴대폰 설정 따르기"로 1.3 이상이 된 경우도 같다).
 */
export function NoticeCard({
  id,
  text,
  buttonLabel,
  href,
  onClose,
}: {
  id: string;
  text: string;
  buttonLabel: string;
  href: string;
  onClose: () => void;
}) {
  const stacked = useAppliedFz() >= 1.3;
  return (
    <div
      data-notice={id}
      className="rounded-card bg-lime/12 ring-lime/50 flex flex-wrap items-center gap-x-2.5 gap-y-1 py-3 pr-1.5 pl-4 ring-1 ring-inset"
    >
      <p
        data-testid="notice-text"
        className="text-17 order-1 m-0 min-w-0 flex-1 leading-snug font-bold text-pretty"
      >
        {text}
      </p>
      {stacked && (
        <span aria-hidden="true" className="order-3 h-0 basis-full" />
      )}
      <Link
        href={href}
        className={`bg-brand text-16 fh-44 flex cursor-pointer items-center rounded-full px-4 font-bold whitespace-nowrap text-white ${
          stacked ? "order-4" : "order-2"
        }`}
      >
        {buttonLabel}
      </Link>
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className={`text-ink-2/85 text-22 flex size-11 flex-none cursor-pointer items-center justify-center rounded-full leading-none ${
          stacked ? "order-2" : "order-3"
        }`}
      >
        ×
      </button>
    </div>
  );
}
