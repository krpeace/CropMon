"use client";

import { usePathname } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/**
 * "앱 안에서 쪽을 옮긴 적이 있는가" (이슈 #155, 결정 0049). 휴대폰 맥락 바의 뒤로 화살표가
 * 이전 화면으로 갈지(있음), 종합으로 갈지(없음: 주소로 바로 들어옴)를 가르는 데 쓴다.
 * history.length 로는 외부 사이트에서 들어온 경우를 가리지 못해서, 이 문서가 열린 뒤 pathname 이
 * 한 번이라도 바뀌었는지를 기억한다. 새로고침하면 사라져 "없음"으로 돌아간다(한계, 결정 0049).
 */
let firstPath: string | null = null;
let moved = false;
const listeners = new Set<() => void>();

function record(pathname: string) {
  if (firstPath === null) {
    firstPath = pathname;
    return;
  }
  if (!moved && pathname !== firstPath) {
    moved = true;
    for (const notify of listeners) notify();
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** layout 에 한 번 둔다. 화면에 그리는 것은 없다. */
export function NavHistory() {
  const pathname = usePathname();
  useEffect(() => record(pathname), [pathname]);
  return null;
}

/** 앱 안에서 쪽을 옮긴 적이 있으면 true (서버 · 첫 그리기에는 false). */
export function useCanGoBack(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => moved,
    () => false,
  );
}
