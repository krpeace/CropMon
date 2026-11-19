"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { nearestIndex } from "@/domain/menus-layout";

/**
 * 화면 구성 목록의 손잡이 끌기 (이슈 #176, 결정 0058). 의존성 없이 포인터 이벤트로 직접 만든다 — 줄이 10개로 고정이고
 * 손잡이로만 잡으며, 놓을 자리 계산은 순수 함수(`nearestIndex`)라서다. 마우스 · 터치 · 펜이 모두 포인터 이벤트로 온다.
 *
 * - 손잡이에 `touch-action: none`(클래스 `touch-none`)을 줘 끄는 동안 화면이 같이 스크롤되지 않게 한다.
 * - **포인터 캡처**를 잡아 손가락이 손잡이 줄 밖(화면 위아래 끝 포함)으로 나가도 끌기가 끊기지 않는다.
 * - 끄는 줄은 손가락을 따라가고(`dy`), 사이의 줄은 한 칸씩 비켜 놓을 자리가 분명히 보인다.
 * - `pointercancel` · 포인터 캡처를 잃음 · Esc 는 **취소**(순서 그대로).
 * 끌기를 못 하는 사람을 위한 길(키보드 · ▲▼)은 화면 쪽이 따로 갖는다.
 */

export type DragState = {
  /** 끄는 줄의 메뉴 ID. */
  id: string;
  /** 시작한 번호(0부터). */
  from: number;
  /** 지금 놓으면 가게 될 번호. */
  target: number;
  /** 손가락이 시작한 곳에서 세로로 움직인 거리(px). */
  dy: number;
  /** 끄는 줄 높이(px) — 사이의 줄이 비켜 줄 거리. */
  height: number;
};

type Session = {
  id: string;
  from: number;
  pointerId: number;
  startY: number;
  centers: number[];
  height: number;
  target: number;
};

export function useRowDrag({
  getRows,
  onDrop,
}: {
  /** 줄 요소들(목록 순서대로). 끌기를 시작할 때 한 번 잰다. */
  getRows: () => (HTMLElement | null)[];
  /** 놓았을 때(번호가 바뀐 경우만). */
  onDrop: (id: string, toIndex: number) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const session = useRef<Session | null>(null);
  const dropRef = useRef(onDrop);
  useEffect(() => {
    dropRef.current = onDrop;
  });

  const end = useCallback(() => {
    session.current = null;
    setDrag(null);
  }, []);

  // 끄는 동안 Esc 로 취소
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") end();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag, end]);

  const handlers = useCallback(
    (id: string, index: number) => ({
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        // 마우스는 왼쪽 단추만
        if (e.pointerType === "mouse" && e.button !== 0) return;
        const rows = getRows();
        const mine = rows[index];
        if (!mine) return;
        const rects = rows.map((r) => r?.getBoundingClientRect() ?? null);
        const centers = rects.map((r) => (r ? r.top + r.height / 2 : 0));
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // 포인터를 못 잡는 환경(합성 이벤트 등)도 끌기는 계속된다
        }
        session.current = {
          id,
          from: index,
          pointerId: e.pointerId,
          startY: e.clientY,
          centers,
          height: rects[index]?.height ?? 0,
          target: index,
        };
        setDrag({
          id,
          from: index,
          target: index,
          dy: 0,
          height: rects[index]?.height ?? 0,
        });
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        const s = session.current;
        if (!s || e.pointerId !== s.pointerId) return;
        const dy = e.clientY - s.startY;
        const target = nearestIndex(s.centers, s.centers[s.from] + dy);
        s.target = target;
        setDrag({ id: s.id, from: s.from, target, dy, height: s.height });
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        const s = session.current;
        if (!s || e.pointerId !== s.pointerId) return;
        session.current = null;
        setDrag(null);
        if (s.target !== s.from) dropRef.current(s.id, s.target);
      },
      onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
        if (session.current?.pointerId === e.pointerId) end();
      },
      onLostPointerCapture: (e: React.PointerEvent<HTMLElement>) => {
        // 놓은 뒤(위에서 이미 끝냄)가 아니라 끌던 도중에 캡처를 잃은 경우는 취소
        if (session.current?.pointerId === e.pointerId) end();
      },
    }),
    [getRows, end],
  );

  return { drag, handlers };
}

/** 끄는 중인 줄 번호 `index` 가 화면에서 얼마나 움직여 보일지(px). */
export function rowShift(drag: DragState | null, index: number): number {
  if (!drag) return 0;
  if (index === drag.from) return drag.dy;
  if (drag.from < drag.target && index > drag.from && index <= drag.target) {
    return -drag.height;
  }
  if (drag.from > drag.target && index >= drag.target && index < drag.from) {
    return drag.height;
  }
  return 0;
}
