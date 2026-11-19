"use client";

import { useSyncExternalStore } from "react";

import {
  parseMembersFromCookieHeader,
  parseMembersState,
  type MembersState,
} from "@/domain/members-state";

/**
 * 회원제 표시 (이슈 #189, 결정 0064). 머리 스크립트가 쿠키(`cm_m`)를 읽어 `<html data-members data-naver>` 에 단 값을 읽는다.
 * 속성이 없으면 끔(지금 알파 모양). 서버에서 그릴 때는 항상 끔이라 서버 HTML 과 어긋나지 않는다.
 */
const KEY_SEP = "|";

function readKey(): string {
  const { members, naver } = document.documentElement.dataset;
  return `${members ?? "off"}${KEY_SEP}${naver ?? ""}`;
}

function toState(key: string): MembersState {
  const [mode, naver] = key.split(KEY_SEP);
  // 쿠키 값과 같은 모양으로 합쳐 같은 판단(parseMembersState)을 쓴다
  if (mode === "in" || mode === "anon") {
    return parseMembersState(`${mode === "in" ? "i" : "a"}${naver ? "n" : ""}`);
  }
  return parseMembersState(null);
}

/** 뒤로 가기(bfcache)로 되살아난 화면은 쿠키가 그새 바뀌었을 수 있다. 쿠키를 다시 읽어 속성을 맞춘다. */
function syncFromCookie() {
  try {
    const state = parseMembersFromCookieHeader(document.cookie);
    const { dataset } = document.documentElement;
    if (state.mode === "off") {
      delete dataset.members;
      delete dataset.naver;
    } else {
      dataset.members = state.mode;
      if (state.naver) dataset.naver = "1";
      else delete dataset.naver;
    }
  } catch {
    // 쿠키를 못 읽어도 지금 모양을 그대로 둔다
  }
}

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-members", "data-naver"],
  });
  const onPageShow = (e: PageTransitionEvent) => {
    if (e.persisted) syncFromCookie();
  };
  window.addEventListener("pageshow", onPageShow);
  return () => {
    observer.disconnect();
    window.removeEventListener("pageshow", onPageShow);
  };
}

const getServerKey = () => `off${KEY_SEP}`;

/** 회원제가 켜져 있는지(`mode`) · 로그인했는지 · 네이버가 켜져 있는지. */
export function useMembersState(): MembersState {
  const key = useSyncExternalStore(subscribe, readKey, getServerKey);
  return toState(key);
}
