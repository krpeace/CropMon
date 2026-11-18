"use client";

import {
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import {
  dragOffset,
  dragOutcome,
  sheetLayout,
  type SheetLayout,
} from "@/domain/sheet";

const DESKTOP_QUERY = "(min-width: 1024px)";

/** 보이는 화면(visualViewport) 기준 시트 위치 · 최대 높이. 계산은 src/domain/sheet.ts. */
function readLayout(): SheetLayout {
  const vv = window.visualViewport;
  return sheetLayout({
    innerHeight: window.innerHeight,
    vvHeight: vv?.height ?? window.innerHeight,
    vvOffsetTop: vv?.offsetTop ?? 0,
  });
}

/**
 * 휴대폰(폭 1024 미만)의 아래에서 올라오는 시트 (이슈 #157, 결정 0050, 디자인 규칙 v0.4.6 12절).
 * 작물·지역 고르기가 쓰고, 앞으로 로그인 · 관수 기록 · 내 계정 시트도 이 부품을 쓴다.
 * - 뒤 화면은 화면 전체 덮개(z-40)로 덮는다: 탭바(z-30) · 맥락 바(z-20)까지. 덮개를 누르면 닫힌다.
 * - 시트는 `fixed bottom` 에 붙고 위 모서리만 둥글다. 키보드가 올라오면 보이는 화면(visualViewport) 위로 올라오고,
 *   최대 높이도 보이는 화면 기준이다 — 넘치면 시트 안(내용)에서 스크롤한다.
 * - **손잡이와 시트 머리(제목 줄)를 아래로 80px 넘게 끌고 놓으면 닫힌다.** 끌기는 이 영역에서만 시작하고
 *   (목록 안에서 스크롤하는 손가락을 닫기로 오해하지 않게), 머리 안의 "닫기" 버튼 위에서는 시작하지 않는다.
 * - 올라오는 움직임은 motion-safe 에서만(움직임 줄이기를 켠 기기는 바로 나타남). 닫을 때는 바로 사라진다.
 * - 아래 안전 영역(아이폰 홈 막대)은 `--sheet-safe-bottom`(tokens.css)만큼 띄운다. 키보드가 올라와 있으면 0.
 * 머리말에는 backdrop-filter 가 있어 안에 그리면 fixed 가 머리말 기준이 되므로 document.body 에 포털로 그린다.
 */
export function BottomSheet({
  title,
  triggerRef,
  onClose,
  children,
}: {
  title: string;
  /** 시트를 연 버튼. 닫히면 포커스를 돌려준다. */
  triggerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ pointerId: number; startY: number } | null>(null);
  const [layout, setLayout] = useState<SheetLayout>(readLayout);
  const [offset, setOffset] = useState(0); // 끄는 동안 따라 내려간 거리(px)
  const [dragging, setDragging] = useState(false);

  // 키보드가 뜨거나 화면이 돌아가면 보이는 화면이 바뀐다.
  useEffect(() => {
    const update = () => setLayout(readLayout());
    const vv = window.visualViewport;
    window.addEventListener("resize", update);
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    return () => {
      window.removeEventListener("resize", update);
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
    };
  }, []);

  // 뒤 화면 스크롤 잠금: 아이폰 사파리는 body 만 막으면 끌어서 스크롤이 될 때가 있어 html 도 막는다.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prev = [html.style.overflow, body.style.overflow];
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = prev[0];
      body.style.overflow = prev[1];
    };
  }, []);

  // 열리면 포커스를 시트 안("닫기")으로, 닫히면 연 버튼으로 돌려준다.
  useEffect(() => {
    const trigger = triggerRef.current;
    closeRef.current?.focus();
    return () => trigger?.focus();
  }, [triggerRef]);

  // Esc 로 닫는다 · 폭이 1024 이상이 되면(데스크톱 배치) 닫는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const media = window.matchMedia(DESKTOP_QUERY);
    const onMedia = () => media.matches && onClose();
    window.addEventListener("keydown", onKey);
    media.addEventListener("change", onMedia);
    return () => {
      window.removeEventListener("keydown", onKey);
      media.removeEventListener("change", onMedia);
    };
  }, [onClose]);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    // 머리 안의 "닫기" 버튼 위에서는 끌기를 시작하지 않는다 (누르기와 겹치지 않게)
    if ((e.target as HTMLElement).closest("button")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragRef.current = { pointerId: e.pointerId, startY: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setOffset(dragOffset(e.clientY - d.startY));
  };

  const endDrag = (
    e: ReactPointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setDragging(false);
    if (!cancelled && dragOutcome(e.clientY - d.startY) === "close") {
      onClose();
    } else {
      setOffset(0); // 제자리로
    }
  };

  return createPortal(
    <>
      <div
        onClick={onClose}
        className="bg-scrim/28 motion-safe:animate-sheet-fade fixed inset-0 z-40 touch-none"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{
          bottom: layout.bottom,
          maxHeight: layout.maxHeight,
          paddingBottom: layout.keyboardOpen ? 0 : "var(--sheet-safe-bottom)",
          transform: offset > 0 ? `translateY(${offset}px)` : undefined,
          transition: dragging ? "none" : "transform 0.18s ease-out",
        }}
        className="rounded-t-sheet bg-card shadow-panel motion-safe:animate-sheet-up fixed inset-x-0 z-45 flex flex-col overflow-hidden"
      >
        <div
          data-testid="sheet-drag"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endDrag(e, false)}
          onPointerCancel={(e) => endDrag(e, true)}
          className="flex-none cursor-grab touch-none select-none"
        >
          <div className="flex justify-center pt-2">
            <span
              data-testid="sheet-grip"
              className="bg-ink-2/30 h-1.25 w-9 rounded-full"
            />
          </div>
          <div className="flex items-center justify-between pr-2 pl-4">
            <span className="text-17 font-bold">{title}</span>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              className="text-16 text-brand-ink fh-44 cursor-pointer px-2 font-semibold"
            >
              닫기
            </button>
          </div>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}
