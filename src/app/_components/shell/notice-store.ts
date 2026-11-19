"use client";

import { useMemo, useSyncExternalStore } from "react";

import {
  addClosedNotice,
  NOTICE_CLOSED_KEY,
  type NoticeId,
  parseClosedNotices,
  serializeClosedNotices,
} from "@/domain/notice";

/**
 * 닫은 알리기 카드 기억 (이슈 #168, 결정 0055). 비회원은 기기(localStorage). 저장소가 막혀 있으면 이번 화면 동안만 메모리에 둔다.
 * 머리 스크립트(`buildNoticeScript`)가 처음 그리기 전에 `<html data-notice-closed>` 를 달아 CSS 가 닫은 카드를 숨기고,
 * 여기서 닫으면 같은 표시를 바로 달아 CSS 가 즉시 숨긴다. F1 · W4 의 카드도 같은 자리(같은 저장 값)를 쓴다.
 */

const EVENT = "cropmon-notice-closed-change";
let memoryRaw: string | null = null;

function readRaw(): string | null {
  if (memoryRaw !== null) return memoryRaw;
  try {
    return localStorage.getItem(NOTICE_CLOSED_KEY);
  } catch {
    return null;
  }
}

/** 카드를 닫은 것으로 기억한다(× 를 눌렀거나 그 카드가 알리는 화면에 들어간 경우). */
export function closeNotice(id: NoticeId) {
  const next = addClosedNotice(parseClosedNotices(readRaw()), id);
  const raw = serializeClosedNotices(next);
  try {
    localStorage.setItem(NOTICE_CLOSED_KEY, raw);
    memoryRaw = null;
  } catch {
    memoryRaw = raw;
  }
  document.documentElement.setAttribute("data-notice-closed", next.join(" "));
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** 닫은 카드. 서버 · 첫 그리기는 "아무것도 안 닫음"(서버가 카드를 그려 두면 CSS 가 숨긴다), 브라우저에서 읽은 뒤 따라간다. */
export function useClosedNotices(): NoticeId[] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => parseClosedNotices(raw), [raw]);
}
