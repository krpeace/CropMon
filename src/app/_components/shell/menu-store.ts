"use client";

import { useMemo, useSyncExternalStore } from "react";

import {
  MENU_STORAGE_KEY,
  parseSavedMenus,
  resolveMenus,
  type ResolvedMenus,
} from "@/domain/menus";

/** 사생활 보호 모드 등에서 저장소가 막혀 있어도 화면은 돌아가야 한다 (기본값으로 동작). */
function readRaw(): string | null {
  try {
    return localStorage.getItem(MENU_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** 다른 탭·창에서 바뀐 값을 따라간다. 이 쪽에서 바꾸는 화면(화면 구성)은 아직 없다. */
function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === MENU_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

/** 서버와 첫 그리기는 기본값(저장값 없음). 기기 저장값은 화면이 뜬 뒤 적용된다 (결정 0046). */
const getServerRaw = (): string | null => null;

/** 탭·더보기·데스크톱 메뉴 줄이 함께 쓰는 "지금 보여 줄 메뉴". */
export function useMenus(): ResolvedMenus {
  const raw = useSyncExternalStore(subscribe, readRaw, getServerRaw);
  return useMemo(() => resolveMenus(parseSavedMenus(raw)), [raw]);
}
