"use client";

import { useMemo, useSyncExternalStore } from "react";

import {
  MENU_STORAGE_KEY,
  parseSavedMenus,
  resolveMenus,
  type ResolvedMenus,
  type SavedMenus,
} from "@/domain/menus";
import { canonicalMenus, savedOrNull } from "@/domain/menus-layout";

import { pushAccount } from "./account-settings-store";

/**
 * 메뉴 설정값(순서 + 끈 메뉴) 읽기 · 쓰기 (이슈 #145 읽기, 이슈 #176 쓰기, 결정 0046 · 0058). **저장은 이 파일 한곳**이다 —
 * 비회원은 기기(localStorage). 로그인한 회원은 기기에 쓴 뒤 `pushAccount` 로 계정에도 쓴다(이슈 #193, 결정 0066 — `sync:false` 는 계정 값을 기기에 쓰는 갈래).
 * 저장소가 막혀 있으면(사생활 보호 모드) 쓰기는 조용히 실패하고 이번 화면 동안만 메모리 값으로 계속 동작한다.
 * 같은 탭의 구독자(하단 탭 · 더보기 · 데스크톱 메뉴 줄 · 화면 구성)는 `storage` 이벤트가 안 오므로(다른 탭에서만 온다)
 * 쓸 때 직접 알린다 — 글씨 크기(`font-scale-store.ts`)와 같은 방식이다.
 */

const EVENT = "cropmon-menus-change";

/** `sync: false` 면 계정에 쓰지 않는다(계정 값을 기기에 쓰는 갈래). */
export type SaveOptions = { sync?: boolean };

/** 저장이 막혔을 때만 채운다. `{ raw: null }` 은 "지움"(기본값)이다. */
let memory: { raw: string | null } | null = null;

/** 사생활 보호 모드 등에서 저장소가 막혀 있어도 화면은 돌아가야 한다 (기본값으로 동작). */
function readRaw(): string | null {
  if (memory) return memory.raw;
  try {
    return localStorage.getItem(MENU_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** `raw` 가 null 이면 저장값을 지운다(기본값). */
function writeRaw(raw: string | null) {
  try {
    if (raw === null) localStorage.removeItem(MENU_STORAGE_KEY);
    else localStorage.setItem(MENU_STORAGE_KEY, raw);
    memory = null;
  } catch {
    memory = { raw }; // 저장이 안 돼도 이번 화면은 바뀐다.
  }
  window.dispatchEvent(new Event(EVENT));
}

/**
 * 설정값을 저장한다 — 고르는 즉시 탭바 · 더보기 · 데스크톱 메뉴 줄이 새로고침 없이 따라간다.
 * 기본 순서 · 모두 켬이면 저장값을 지운다(앞으로 기본 순서가 바뀌면 따라가게, `savedOrNull`).
 */
export function saveMenus(saved: SavedMenus, opts: SaveOptions = {}) {
  const next = savedOrNull(saved);
  writeRaw(next === null ? null : JSON.stringify(next));
  // 로그인한 회원이면 계정에도 쓴다(모아서 마지막 값만, 결정 0066). 계정 값을 기기에 쓰는 갈래는 `sync:false` 로 되보내지 않는다.
  if (opts.sync !== false) pushAccount({ layout: canonicalMenus(saved) });
}

/** "기본값": 저장값을 지운다. 계정에는 `null` 이 아니라 "기본값 값"을 쓴다(다른 기기가 초기화를 따라오게). */
export function resetMenus(opts: SaveOptions = {}) {
  writeRaw(null);
  if (opts.sync !== false) pushAccount({ layout: canonicalMenus(null) });
}

/** 기기에 저장된 값 그대로(없거나 깨졌으면 null = 기본값). 계정과 견줄 때 쓴다. */
export function readDeviceMenus(): SavedMenus | null {
  return parseSavedMenus(readRaw());
}

/** 다른 탭·창에서 바뀐 값(`storage`)과 이 탭에서 쓴 값(`EVENT`)을 따라간다. */
function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === MENU_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onChange);
  };
}

/** 서버와 첫 그리기는 기본값(저장값 없음). 기기 저장값은 화면이 뜬 뒤 적용된다 (결정 0046). */
const getServerRaw = (): string | null => null;

/** 탭·더보기·데스크톱 메뉴 줄이 함께 쓰는 "지금 보여 줄 메뉴". */
export function useMenus(): ResolvedMenus {
  const raw = useSyncExternalStore(subscribe, readRaw, getServerRaw);
  return useMemo(() => resolveMenus(parseSavedMenus(raw)), [raw]);
}

/** 저장된 설정값 그대로(없거나 깨졌으면 null = 기본값). 화면 구성 화면이 목록을 만들 때 쓴다. */
export function useSavedMenus(): SavedMenus | null {
  const raw = useSyncExternalStore(subscribe, readRaw, getServerRaw);
  return useMemo(() => parseSavedMenus(raw), [raw]);
}

const subscribeNone = () => () => {};

/**
 * 브라우저에서 저장값을 읽을 수 있는 때부터 true (서버 · 첫 그리기는 false).
 * 화면 구성 화면은 저장값을 읽은 뒤에야 목록을 그려, 저장값이 있는 기기에서 목록이 기본 순서로 잠깐 보였다 바뀌지 않게 한다.
 */
export function useMenusReady(): boolean {
  return useSyncExternalStore(
    subscribeNone,
    () => true,
    () => false,
  );
}
