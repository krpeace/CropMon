"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { INITIAL_FOLD, nextFold, type FoldState } from "@/domain/autohide";

/**
 * 휴대폰 오토 하이드 상태 (이슈 #159, 결정 0051). 판단은 src/domain/autohide.ts 의 순수 함수가 하고,
 * 여기서는 스크롤 위치 · 화면 크기를 읽어 넘기고 결과(`folded`)를 화면에 내려준다.
 * - 스크롤(passive)은 requestAnimationFrame 으로 묶어 프레임당 한 번만 계산한다.
 * - 누적 거리(travel)는 ref 에 두고, **접힘/펼침이 실제로 바뀔 때만** 다시 그린다.
 * - `paused`(시트가 열려 있는 동안)에는 위치만 따라가고 상태는 안 바꾼다 — 닫은 뒤 한꺼번에 반영되지 않게.
 * - 경로가 바뀌면 펼친 상태로 시작한다. 창 크기 · 방향이 바뀌면 다시 판단한다(가로 · 데스크톱 폭 → 펼침).
 */
export function useAutoFold(paused: boolean) {
  const pathname = usePathname();
  const [state, setState] = useState({ path: pathname, folded: false });
  const memory = useRef<FoldState>(INITIAL_FOLD);
  const lastY = useRef(0);
  const pausedRef = useRef(paused);
  const pathRef = useRef(pathname);

  useEffect(() => {
    pausedRef.current = paused;
    if (!paused) lastY.current = window.scrollY;
  }, [paused]);

  // 경로가 바뀌면 누적을 지우고 지금 위치부터 다시 센다 (화면 쪽은 path 가 달라 접힘이 무시된다).
  useEffect(() => {
    pathRef.current = pathname;
    memory.current = INITIAL_FOLD;
    lastY.current = window.scrollY;
  }, [pathname]);

  useEffect(() => {
    let raf = 0;
    lastY.current = window.scrollY;

    const evaluate = () => {
      raf = 0;
      const y = window.scrollY;
      const delta = y - lastY.current;
      lastY.current = y;
      if (pausedRef.current) return;
      const next = nextFold(memory.current, {
        y,
        delta,
        viewportHeight: window.innerHeight,
        docHeight: document.documentElement.scrollHeight,
        width: window.innerWidth,
        height: window.innerHeight,
      });
      memory.current = next;
      setState((prev) =>
        prev.folded === next.folded && prev.path === pathRef.current
          ? prev
          : { path: pathRef.current, folded: next.folded },
      );
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(evaluate);
    };

    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /** 펼친다 (접힌 줄을 눌렀거나, 숨은 탭바에 포커스가 들어왔을 때). 거리는 새로 센다. */
  const unfold = useCallback(() => {
    memory.current = INITIAL_FOLD;
    setState({ path: pathRef.current, folded: false });
  }, []);

  return { folded: state.path === pathname && state.folded, unfold };
}
