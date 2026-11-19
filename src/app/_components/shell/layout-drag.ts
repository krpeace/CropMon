"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  LONG_PRESS_MS,
  longPressDecision,
  nearestIndex,
} from "@/domain/menus-layout";

/**
 * 화면 구성 목록의 끌기 (이슈 #176 · #180, 결정 0058 · 0060). 의존성 없이 포인터 이벤트로 직접 만든다 — 줄이 10개로 고정이고,
 * 놓을 자리 계산은 순수 함수(`nearestIndex`)라서다. 마우스 · 터치 · 펜이 모두 포인터 이벤트로 온다.
 *
 * **시작 방식 (결정 0060)**
 * - 마우스: **손잡이**를 누르면 바로 끌기가 시작된다(스크롤과 다투지 않는다). 아이콘 · 이름 칸에서는 시작하지 않는다.
 * - 터치 · 펜: 아이콘 · 이름 칸이나 손잡이에 손가락을 댄 채 **0.45초** 버텨야 시작한다. 그 사이 8px 넘게 움직이면 취소(= 브라우저가
 *   화면을 스크롤), 그 전에 떼면 아무 일 없다. 판단은 순수 함수 `longPressDecision`. 기다리는 동안엔 포인터를 잡지도,
 *   스크롤을 막지도 않는다(잡는 곳은 `touch-action: pan-y`).
 * - 시작하면 줄이 들리고(`data-dragging`) 짧게 진동한다(`navigator.vibrate` 가 없거나 막힌 브라우저는 조용히 넘어간다).
 *
 * **끄는 동안**
 * - 시작한 뒤에만 `window` 에 `touchmove` 를 `{ passive: false }` 로 달아 `preventDefault()` — 화면이 같이 스크롤되지 않게 한다.
 *   `touch-action` 은 손가락을 댄 뒤에 바꿔도 그 손짓에 안 먹기 때문이다. 끝날 때(놓기 · 취소 · Esc · 캡처 잃음 · 화면을 떠남)
 *   반드시 뗀다(`stop`).
 * - **포인터 캡처**를 잡아 손가락이 줄 밖(화면 위아래 끝 포함)으로 나가도 끌기가 끊기지 않는다.
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

/** 어느 곳을 눌렀나: 손잡이(≡) 또는 아이콘 · 이름 칸. */
export type GrabPart = "handle" | "grab";

type Session = {
  id: string;
  from: number;
  pointerId: number;
  startY: number;
  centers: number[];
  height: number;
  target: number;
};

/** 길게 누르는 중(아직 끌기가 아님). */
type Pending = {
  id: string;
  index: number;
  pointerId: number;
  el: HTMLElement;
  x0: number;
  y0: number;
  x: number;
  y: number;
  t0: number;
  timer: ReturnType<typeof setTimeout> | null;
};

const preventTouchScroll = (e: TouchEvent) => {
  if (e.cancelable) e.preventDefault();
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
  const pending = useRef<Pending | null>(null);
  const blocking = useRef(false);
  const judgeRef = useRef<() => void>(() => {});
  const dropRef = useRef(onDrop);
  useEffect(() => {
    dropRef.current = onDrop;
  });

  /** 길게 누르는 중이던 것을 지운다(타이머도). */
  const clearPending = useCallback(() => {
    const p = pending.current;
    if (p?.timer) clearTimeout(p.timer);
    pending.current = null;
  }, []);

  /** 끌기가 끝났을 때 화면 터치 스크롤 막기를 푼다. */
  const unblockScroll = useCallback(() => {
    if (!blocking.current) return;
    blocking.current = false;
    window.removeEventListener("touchmove", preventTouchScroll);
  }, []);

  /** 모든 상태를 처음으로(타이머 · touchmove 막기 · 끌기). */
  const stop = useCallback(() => {
    clearPending();
    unblockScroll();
    session.current = null;
    setDrag(null);
  }, [clearPending, unblockScroll]);

  // 화면을 떠날 때(컴포넌트가 사라질 때)도 남기지 않는다
  useEffect(
    () => () => {
      clearPending();
      unblockScroll();
    },
    [clearPending, unblockScroll],
  );

  // 끄는 동안 Esc 로 취소
  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag, stop]);

  /** 끌기를 시작한다: 줄 자리를 재고, 포인터를 잡고, 줄을 들고, 화면 스크롤을 막는다. */
  const begin = useCallback(
    (
      el: HTMLElement,
      id: string,
      index: number,
      pointerId: number,
      startY: number,
      haptic: boolean,
    ) => {
      const rows = getRows();
      const mine = rows[index];
      if (!mine) return;
      const rects = rows.map((r) => r?.getBoundingClientRect() ?? null);
      const centers = rects.map((r) => (r ? r.top + r.height / 2 : 0));
      try {
        el.setPointerCapture(pointerId);
      } catch {
        // 포인터를 못 잡는 환경(합성 이벤트 등)도 끌기는 계속된다
      }
      const height = rects[index]?.height ?? 0;
      session.current = {
        id,
        from: index,
        pointerId,
        startY,
        centers,
        height,
        target: index,
      };
      setDrag({ id, from: index, target: index, dy: 0, height });
      if (haptic) {
        try {
          // 없는 브라우저(아이폰 사파리 등) · 사용자가 이 문서를 아직 안 눌러 막힌 크롬은 조용히 넘어간다
          navigator.vibrate?.(15);
        } catch {
          // 진동 실패는 끌기에 영향 없음
        }
      }
      // 터치는 끌기가 시작된 뒤에만 화면 스크롤을 막는다. passive:false 를 꼭 밝혀야 preventDefault 가 듣는다.
      if (!blocking.current) {
        blocking.current = true;
        window.addEventListener("touchmove", preventTouchScroll, {
          passive: false,
        });
      }
    },
    [getRows],
  );

  /** 길게 누르는 중의 판단: 시작 / 취소 / 계속 기다림. */
  const judge = useCallback(() => {
    const p = pending.current;
    if (!p) return;
    const elapsed = performance.now() - p.t0;
    const moved = Math.hypot(p.x - p.x0, p.y - p.y0);
    const decision = longPressDecision(elapsed, moved);
    if (decision === "cancel") {
      clearPending();
    } else if (decision === "start") {
      const { el, id, index, pointerId, y } = p;
      clearPending();
      begin(el, id, index, pointerId, y, true);
    } else {
      // 타이머가 아주 조금 일찍 깨어난 경우: 남은 만큼만 더 기다린다
      if (p.timer) clearTimeout(p.timer);
      p.timer = setTimeout(
        () => judgeRef.current(),
        Math.max(1, LONG_PRESS_MS - elapsed),
      );
    }
  }, [begin, clearPending]);
  // 다시 기다릴 때 자기 자신을 부르지 않고 ref 를 거친다(항상 최신 판단 함수)
  useEffect(() => {
    judgeRef.current = judge;
  });

  const handlers = useCallback(
    (id: string, index: number, part: GrabPart = "handle") => ({
      onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
        if (session.current || pending.current) return; // 이미 하나를 잡고 있으면 다른 손가락은 무시
        if (e.pointerType === "mouse") {
          // 마우스는 왼쪽 단추로 손잡이만 — 바로 끌기. 아이콘 · 이름 칸은 글자 긁기와 겹치지 않게 비워 둔다.
          if (e.button !== 0 || part !== "handle") return;
          begin(e.currentTarget, id, index, e.pointerId, e.clientY, false);
          return;
        }
        // 터치 · 펜: 길게 눌러야 시작
        const p: Pending = {
          id,
          index,
          pointerId: e.pointerId,
          el: e.currentTarget,
          x0: e.clientX,
          y0: e.clientY,
          x: e.clientX,
          y: e.clientY,
          t0: performance.now(),
          timer: null,
        };
        p.timer = setTimeout(() => judgeRef.current(), LONG_PRESS_MS);
        pending.current = p;
      },
      onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
        const p = pending.current;
        if (p && e.pointerId === p.pointerId) {
          p.x = e.clientX;
          p.y = e.clientY;
          // 8px 넘게 움직였으면 바로 취소(화면 스크롤). 시간이 찼는지는 타이머가 본다.
          if (
            longPressDecision(0, Math.hypot(p.x - p.x0, p.y - p.y0)) ===
            "cancel"
          ) {
            clearPending();
          }
          return;
        }
        const s = session.current;
        if (!s || e.pointerId !== s.pointerId) return;
        const dy = e.clientY - s.startY;
        const target = nearestIndex(s.centers, s.centers[s.from] + dy);
        s.target = target;
        setDrag({ id: s.id, from: s.from, target, dy, height: s.height });
      },
      onPointerUp: (e: React.PointerEvent<HTMLElement>) => {
        const p = pending.current;
        if (p && e.pointerId === p.pointerId) {
          clearPending(); // 짧게 탭: 아무 일 없다
          return;
        }
        const s = session.current;
        if (!s || e.pointerId !== s.pointerId) return;
        stop();
        if (s.target !== s.from) dropRef.current(s.id, s.target);
      },
      onPointerCancel: (e: React.PointerEvent<HTMLElement>) => {
        if (pending.current?.pointerId === e.pointerId) clearPending();
        if (session.current?.pointerId === e.pointerId) stop();
      },
      onLostPointerCapture: (e: React.PointerEvent<HTMLElement>) => {
        // 놓은 뒤(위에서 이미 끝냄)가 아니라 끌던 도중에 캡처를 잃은 경우는 취소
        if (session.current?.pointerId === e.pointerId) stop();
      },
    }),
    [begin, clearPending, stop],
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
