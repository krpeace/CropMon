"use client";

import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";
import { createPortal } from "react-dom";

const DESKTOP_QUERY = "(min-width: 1024px)";
const GAP = 8; // 선택 줄과 판 사이
const BOTTOM_MARGIN = 12; // 보이는 화면 아래 끝에서 띄우는 간격

/**
 * 휴대폰(폭 1024 미만) 작물·지역 고르기 판. 선택 줄 바로 아래에 펼쳐지고, 아래쪽 화면과 탭바는 덮개로 덮는다.
 * 머리말에는 backdrop-filter 가 있어 안에 그리면 fixed 가 화면이 아니라 머리말 기준이 되고,
 * 머리말(z-20) 안에서는 탭바(z-30)보다 위로 올라갈 수도 없다. 그래서 document.body 에 포털로 그린다.
 * 덮개는 머리말을 덮지 않는다: 누른 버튼과 판이 이어져 보이게 한다.
 */
export function SelectionPanel({
  title,
  anchorRef,
  triggerRef,
  onClose,
  children,
}: {
  title: string;
  /** 선택 줄. 이 아래 끝에 판을 붙인다. */
  anchorRef: RefObject<HTMLElement | null>;
  /** 판을 연 버튼. 닫히면 포커스를 돌려준다. */
  triggerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // 위치·최대 높이. 키보드가 뜨면 보이는 화면(visualViewport)이 줄고 offsetTop 이 생길 수 있다.
  useLayoutEffect(() => {
    const place = () => {
      const panel = panelRef.current;
      const overlay = overlayRef.current;
      const anchor = anchorRef.current;
      if (!panel || !overlay || !anchor) return;
      const bottom = anchor.getBoundingClientRect().bottom;
      const vv = window.visualViewport;
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      const top = bottom + GAP;
      overlay.style.top = `${bottom}px`;
      panel.style.top = `${top}px`;
      panel.style.maxHeight = `${Math.max(0, visibleBottom - BOTTOM_MARGIN - top)}px`;
    };
    place();
    const vv = window.visualViewport;
    window.addEventListener("resize", place);
    vv?.addEventListener("resize", place);
    vv?.addEventListener("scroll", place);
    return () => {
      window.removeEventListener("resize", place);
      vv?.removeEventListener("resize", place);
      vv?.removeEventListener("scroll", place);
    };
  }, [anchorRef]);

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

  // 열리면 포커스를 판 안("닫기")으로, 닫히면 연 버튼으로 돌려준다.
  useEffect(() => {
    const trigger = triggerRef.current;
    closeRef.current?.focus();
    return () => trigger?.focus();
  }, [triggerRef]);

  // Esc · 머리말 등 판 밖을 누르면 먼저 닫는다 · 폭이 1024 이상이 되면 닫는다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        panelRef.current?.contains(target) ||
        overlayRef.current?.contains(target) ||
        triggerRef.current?.contains(target) // 같은 버튼은 그 버튼의 onClick 이 여닫는다
      ) {
        return;
      }
      onClose();
    };
    const media = window.matchMedia(DESKTOP_QUERY);
    const onMedia = () => media.matches && onClose();
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown, true);
    media.addEventListener("change", onMedia);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown, true);
      media.removeEventListener("change", onMedia);
    };
  }, [onClose, triggerRef]);

  return createPortal(
    <>
      <div
        ref={overlayRef}
        onClick={onClose}
        className="bg-scrim/28 fixed inset-x-0 bottom-0 z-40 touch-none"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="rounded-panel bg-card shadow-popover fixed right-(--page-gutter) left-(--page-gutter) z-45 flex flex-col overflow-hidden"
      >
        <div className="flex flex-none items-center justify-between pr-2 pl-4">
          <span className="text-17 font-bold">{title}</span>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="text-16 text-brand-ink min-h-11 cursor-pointer px-2 font-semibold"
          >
            닫기
          </button>
        </div>
        {children}
      </div>
    </>,
    document.body,
  );
}
