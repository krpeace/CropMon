"use client";

import Image from "next/image";
import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  CONSENT_COPY,
  CONSENT_SAVE_FAILED_TEXT,
  type ConsentChecks,
  consentButtonLabel,
  consentDeclineAction,
  consentPostAction,
} from "@/domain/consent";
import { tieMiddleDot } from "@/domain/display";

type DocId = "terms" | "privacy";

/** "수집·이용" 같은 가운뎃점 낱말은 가운데서 끊기지 않게 한 덩어리로 (P2 줄바꿈 금지, 결정 0048). 글자는 그대로다. */
const tie = (text: string) => tieMiddleDot(text);

/**
 * 동의 화면 (이슈 #191, 결정 0065). 첫 로그인 뒤 한 장, 동의 전에는 회원 기능을 막는다. **문구는 확정 문구(`CONSENT_COPY`) 그대로.**
 * 위에서 아래로: 도깨비 · 제목 · 큰 버튼 · 체크 셋(+ 요약 셋) · 안내 · 안내(24시간) · 나가기 버튼 (시안 v0.4.6 순서).
 *
 * - **전체를 덮는 겹침**이다: 머리글 · 탭바 · 바닥글은 루트 `layout` 에 있어 그대로 두고(정적 화면을 동적으로 바꾸지 않으려), 이 화면이
 *   그 위(z-50)를 덮는다. 열려 있는 동안 덮인 것들에 `inert` 를 걸어 Tab · 화면 읽기가 새지 않게 한다.
 * - 휴대폰은 꽉 찬 화면(뒤로 화살표 · 탭바 · 도깨비 없음 = 덮여 보이지 않음), 데스크톱은 뒤판 위 가운데 창(폭 520).
 *   **× · 뒤판 누르기 · Esc 로 닫히지 않는다** — 출구는 "동의하지 않고 나가기" 하나(전문가 2차 확인).
 * - 폼 `POST` 라서 자바스크립트가 없어도 동의된다. "모두 동의하고 시작하기"는 체크 칸과 상관없이 셋 모두로 기록하고, 체크 칸은 글자만 바꾼다.
 * - [보기]는 화면을 떠나지 않고 같은 겹침 안에서 본문 패널을 연다(서버가 만든 `views` 를 받는다).
 * - 저장에 실패해 돌아오면(`failed`) 맨 위에 한 줄을 띄운다(확정 문구 밖, 검토 채팅 승인 11/20).
 */
export function ConsentScreen({
  next,
  failed,
  views,
}: {
  next: string;
  failed: boolean;
  views: Record<DocId, ReactNode>;
}) {
  const [checks, setChecks] = useState<ConsentChecks>({
    age14: false,
    terms: false,
    privacy: false,
  });
  const [view, setView] = useState<DocId | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // 덮인 화면(머리글 · 탭바 · 바닥글 등 body 의 다른 자식)을 inert 로 — 알림 자리(role=status)와 스크립트는 그대로 둔다.
  useEffect(() => {
    const dialog = dialogRef.current;
    const touched: HTMLElement[] = [];
    for (const el of Array.from(document.body.children)) {
      if (!(el instanceof HTMLElement)) continue;
      if (dialog && el.contains(dialog)) continue;
      if (["SCRIPT", "STYLE", "LINK"].includes(el.tagName)) continue;
      if (el.getAttribute("role") === "status") continue;
      if (el.hasAttribute("inert")) continue;
      el.inert = true;
      touched.push(el);
    }
    dialog?.focus();
    return () => {
      for (const el of touched) el.inert = false;
    };
  }, []);

  const set = (id: keyof ConsentChecks) => (checked: boolean) =>
    setChecks((c) => ({ ...c, [id]: checked }));
  const ids = ["age14", "terms", "privacy"] as const;

  return (
    <div className="bg-scrim/28 desktop:items-center desktop:justify-center desktop:p-10 fixed inset-0 z-50 flex">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="consent-title"
        tabIndex={-1}
        className="bg-card desktop:max-w-130 desktop:rounded-panel desktop:shadow-panel desktop:h-auto desktop:max-h-full relative flex h-full w-full flex-col overflow-hidden outline-none"
      >
        <div
          inert={view !== null}
          className="flex min-h-0 flex-1 [scrollbar-width:none] flex-col gap-3 overflow-y-auto px-5 pt-[max(20px,env(safe-area-inset-top))] pb-[max(20px,env(safe-area-inset-bottom))]"
        >
          {failed && (
            <p
              role="alert"
              className="bg-tile text-14 text-ink rounded-box m-0 px-3.5 py-2.5 font-semibold"
            >
              {CONSENT_SAVE_FAILED_TEXT}
            </p>
          )}

          <div className="flex items-center gap-2.5">
            <Image
              src="/brand/mon.png"
              alt=""
              width={165}
              height={196}
              className="h-12 w-auto flex-none"
            />
            <h1
              id="consent-title"
              className="text-22 m-0 leading-snug font-bold text-pretty"
            >
              {CONSENT_COPY.title}
            </h1>
          </div>

          <form
            method="post"
            action={consentPostAction(next)}
            className="contents"
          >
            <button
              type="submit"
              className="bg-brand text-18 fh-54 w-full cursor-pointer rounded-full px-4 font-bold text-white"
            >
              {consentButtonLabel(checks)}
            </button>

            <div className="rounded-box bg-tile flex flex-col px-4 py-1.5">
              {CONSENT_COPY.checks.map((check, i) => (
                <div
                  key={check.id}
                  className="border-ink-2/14 flex items-center gap-2 border-t-(length:--hairline) first:border-t-0"
                >
                  <label className="text-15 fh-50 flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1.5 font-semibold">
                    <input
                      type="checkbox"
                      name={ids[i]}
                      checked={checks[ids[i]]}
                      onChange={(e) => set(ids[i])(e.target.checked)}
                      className="accent-brand size-6 flex-none cursor-pointer"
                    />
                    <span className="min-w-0">{tie(check.label)}</span>
                  </label>
                  {check.view && (
                    <button
                      type="button"
                      aria-label={`${check.view === "terms" ? "이용약관" : "개인정보처리방침"} ${CONSENT_COPY.viewButton}`}
                      onClick={() => setView(check.view)}
                      className="text-brand-ink text-15 fh-44 flex-none cursor-pointer px-2 font-bold"
                    >
                      {CONSENT_COPY.viewButton}
                    </button>
                  )}
                </div>
              ))}
              <ul className="text-14 text-ink-2/85 m-0 flex list-none flex-col gap-1 pt-2 pb-2 pl-0 leading-snug">
                {CONSENT_COPY.summary.map((line) => (
                  <li key={line} className="text-pretty">
                    {tie(line)}
                  </li>
                ))}
              </ul>
            </div>
          </form>

          <p className="text-14 text-ink-2/85 m-0 leading-snug text-pretty">
            {tie(CONSENT_COPY.notice)}
          </p>
          <p className="text-14 text-ink-2/85 m-0 leading-snug text-pretty">
            {tie(CONSENT_COPY.noticeLeave)}
          </p>

          <form
            method="post"
            action={consentDeclineAction(next)}
            className="contents"
          >
            <button
              type="submit"
              className="bg-fill/12 text-ink text-17 fh-50 w-full cursor-pointer rounded-full px-4 font-semibold"
            >
              {CONSENT_COPY.leave}
            </button>
          </form>
        </div>

        {view && (
          <div
            role="region"
            aria-label={
              view === "terms" ? "이용약관 본문" : "개인정보처리방침 본문"
            }
            className="bg-card absolute inset-0 z-10 flex flex-col"
          >
            <div className="border-ink-2/14 flex flex-none items-center border-b-(length:--hairline) px-3 pt-[max(8px,env(safe-area-inset-top))] pb-2">
              <button
                type="button"
                autoFocus
                onClick={() => setView(null)}
                className="text-brand-ink text-16 fh-44 cursor-pointer px-2 font-bold"
              >
                동의 화면으로 돌아가기
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-3 pb-[max(20px,env(safe-area-inset-bottom))]">
              {views[view]}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
