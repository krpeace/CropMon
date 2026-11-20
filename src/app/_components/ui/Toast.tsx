"use client";

import { useSyncExternalStore } from "react";

import { TOAST_MS } from "@/domain/toast";

import { useSheet } from "../shell/sheet-context";

/**
 * 공통 알림(토스트, 이슈 #189, 결정 0064). `showToast("문장")` 을 부르면 몇 초 뒤 사라진다. 로그인 알림이 처음 쓰고,
 * 앞으로 "탈퇴했어요" · "기록을 지웠어요"도 같은 부품을 쓴다.
 * - 화면 읽기 프로그램이 읽게 `role="status"`. 알림 자리(`ToastHost`)는 항상 그려 두고 안에 문장만 넣고 뺀다
 *   (자리가 새로 생기면서 문장이 들어오면 안 읽히는 기기가 있다).
 * - 탭바 · 아래 안전 영역 위에 뜬다. 한 번에 하나(새 알림이 오면 바꿔 끼운다).
 */
let current: { id: number; text: string } | null = null;
let counter = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

/** `ms` 를 안 주면 4초. 안내가 붙은 긴 알림(탈퇴 뒤, 이슈 #195)은 더 오래 띄운다. 글 안의 줄바꿈(`
`)은 그대로 두 줄로 그린다. */
export function showToast(text: string, ms: number = TOAST_MS) {
  counter += 1;
  current = { id: counter, text };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    current = null;
    timer = null;
    emit();
  }, ms);
  emit();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getSnapshot = () => current;
const getServerSnapshot = () => null;

export function ToastHost() {
  const toast = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // 휴대폰의 아래 시트가 열려 있으면(`holds`) 알림이 시트의 단추를 가리지 않게 위쪽에 띄운다 (이슈 #193 — 로그인 직후 시트와 알림이 겹침)
  const { holds } = useSheet();
  const position =
    holds > 0
      ? "top-[calc(env(safe-area-inset-top)+12px)]"
      : "bottom-[calc(var(--tabbar-h)+var(--tabbar-safe-bottom)+12px)] desktop:bottom-6";
  return (
    <div
      role="status"
      aria-live="polite"
      className={`pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4 ${position}`}
    >
      {toast && (
        <div
          key={toast.id}
          data-testid="toast"
          className="bg-ink text-card text-15 rounded-row shadow-panel motion-safe:animate-sheet-fade max-w-130 px-4 py-3 text-center leading-snug font-semibold whitespace-pre-line"
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}
