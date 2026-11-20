"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

import {
  MENU_DEFS,
  MENU_IDS,
  resolveMenus,
  type MenuId,
  type SavedMenus,
} from "@/domain/menus";
import {
  announceMoved,
  announceToggled,
  layoutModel,
  moveBy,
  moveMenu,
  toggleMenu,
} from "@/domain/menus-layout";

import { Icon } from "../ui/Icon";
import { useMembersState } from "./members-state";
import { rowShift, useRowDrag } from "./layout-drag";
import {
  resetMenus,
  saveMenus,
  useMenusReady,
  useSavedMenus,
} from "./menu-store";
import { MENU_ICON } from "./pages";

/** 눌러서 옮긴 뒤 같은 단추에 초점을 되돌린다(줄이 옮겨지면서 초점을 잃지 않게). */
type FocusTarget = { id: MenuId; part: "handle" | "up" | "down" | "switch" };

const ROW_BORDER = "border-ink-2/14 border-t-(length:--hairline)";

/**
 * 끌기를 시작할 수 있는 곳(아이콘 · 이름 칸, 손잡이)의 공통 클래스 (결정 0060).
 * `touch-pan-y`: 길게 누르기를 기다리는 동안 세로로 쓸면 화면이 스크롤된다(끌기가 시작된 뒤에만 훅이 터치 스크롤을 막는다).
 * 글자 선택 · 길게 누르기 메뉴(복사 · 링크 미리보기)는 이 자리에서만 막는다.
 */
const GRAB_CLASS =
  "touch-pan-y select-none [-webkit-touch-callout:none] [-webkit-tap-highlight-color:transparent]";
/** 길게 누르는 곳에서 브라우저의 우클릭 · 길게 누르기 메뉴를 막는다. */
const noContextMenu = (e: React.MouseEvent) => e.preventDefault();

/**
 * 화면 구성 화면 `/layout` (이슈 #176 · #180, 결정 0058 · 0060, 시안 v0.4.3 "탭 순서 — 화면 구성"). 위에서 아래로:
 * 하단 탭 미리 보기 → 서비스 메뉴 10줄(끈 메뉴도 남음, 켠 메뉴 넷째 줄 아래 구분선) → "기본값" + 저장 위치 안내.
 * **저장 버튼 없이 바로 적용** — 스위치 · 순서를 바꾸면 그 자리에서 `cropmon-menus` 에 쓰고, 하단 탭 · 더보기 · 데스크톱 메뉴 줄이
 * 새로고침 없이 따라간다(`menu-store.ts`). 순서 바꾸기는 끌기(휴대폰은 아이콘 · 이름 칸이나 손잡이를 **길게 눌러서**, 마우스는
 * 손잡이를 바로) + 끌기 없는 길(손잡이 키보드 · ▲▼ 단추).
 * 저장값을 읽은 뒤에야 목록을 그려, 저장값이 있는 기기에서 기본 순서로 잠깐 보였다 바뀌지 않게 한다(자리 높이는 미리 잡는다).
 */
export function LayoutScreen() {
  // 로그인한 회원이면 저장 위치 안내 줄이 "계정에 저장돼요"로 바뀐다 (이슈 #193, 결정 0066)
  const member = useMembersState().mode === "in";
  const ready = useMenusReady();
  const saved = useSavedMenus();
  const model = layoutModel(saved);
  const listRef = useRef<HTMLUListElement>(null);
  const [live, setLive] = useState("");
  const focusAfter = useRef<FocusTarget | null>(null);

  // 줄이 옮겨진 뒤 눌렀던 단추에 초점 되돌리기
  useLayoutEffect(() => {
    const t = focusAfter.current;
    if (!t) return;
    focusAfter.current = null;
    listRef.current
      ?.querySelector<HTMLElement>(
        `[data-menu="${t.id}"] [data-part="${t.part}"]`,
      )
      ?.focus();
  });

  const positionOf = (next: SavedMenus, id: MenuId) =>
    layoutModel(next).rows.findIndex((r) => r.id === id) + 1;

  const applyMove = (next: SavedMenus, id: MenuId, focus?: FocusTarget) => {
    if (focus) focusAfter.current = focus;
    saveMenus(next);
    setLive(announceMoved(MENU_DEFS[id].label, positionOf(next, id)));
  };

  const dragApi = useRowDrag({
    getRows: useCallback(
      () =>
        Array.from(
          listRef.current?.querySelectorAll<HTMLElement>(
            '[data-testid="layout-row"]',
          ) ?? [],
        ),
      [],
    ),
    onDrop: (id, to) => {
      applyMove(moveMenu(saved, id as MenuId, to), id as MenuId);
    },
  });
  const { drag, handlers } = dragApi;

  const tabs = resolveMenus(saved).tabs;
  const lastIndex = model.rows.length - 1;

  return (
    <div
      data-testid="layout-body"
      className="mx-auto flex w-full max-w-180 flex-col gap-4 pb-4"
    >
      <h1 className="text-title leading-title tracking-title max-desktop:sr-only m-0 pt-1.5 font-bold">
        화면 구성
      </h1>

      <p className="text-17 text-ink-2/90 m-0 leading-snug text-pretty">
        켜 둔 메뉴 가운데 <b className="text-ink">위에서 4개</b>가 하단 탭이
        돼요. 줄을 <b className="text-ink">길게 눌러 끌거나</b> ▲ ▼ 를 눌러
        순서를 바꿔요. 종합은 첫 화면이라 끄지 못해요.
      </p>

      <div className="rounded-card bg-card flex flex-col gap-2.5 px-3 pt-3.5 pb-3">
        <span className="text-15 text-ink-2/85 px-1 font-bold">
          하단 탭 미리 보기
        </span>
        {ready ? (
          <div
            data-testid="tab-preview"
            aria-hidden="true"
            className="fz-cap bg-tile text-12 flex h-13.5 gap-0 rounded-full p-1 font-bold"
          >
            {[
              ...tabs.map((m) => ({
                key: m.id,
                label: m.label,
                icon: MENU_ICON[m.id],
              })),
              { key: "more", label: "더보기", icon: "more" as const },
            ].map((t) => (
              <span
                key={t.key}
                className="text-ink-2/80 leading-title flex min-w-0 flex-1 flex-col items-center justify-center gap-px rounded-full whitespace-nowrap"
              >
                <Icon name={t.icon} size={22} />
                {t.label}
              </span>
            ))}
          </div>
        ) : (
          <div aria-hidden="true" className="bg-tile h-13.5 rounded-full" />
        )}
        <span className="text-13 text-ink-2/85 px-1">
          더보기는 항상 맨 오른쪽에 있어요
        </span>
      </div>

      {ready ? (
        <div className="rounded-card bg-card py-0.5 pr-1.5 pl-4">
          <p id="layout-hint" className="sr-only">
            줄을 길게 눌러 끌거나 손잡이에서 위·아래 화살표 키로 순서를 바꿔요.
            Home 은 맨 위, End 는 맨 아래로 옮겨요. 위로·아래로 단추로도 바꿀 수
            있어요.
          </p>
          <ul ref={listRef} className="m-0 flex list-none flex-col p-0">
            {model.rows.flatMap((r, i) => {
              const def = MENU_DEFS[r.id];
              const atTop = i === 0;
              const atBottom = i === lastIndex;
              const dragging = drag?.id === r.id;
              const shift = rowShift(drag, i);
              const afterCut = model.cutBefore === i;
              const items = [];
              if (afterCut) {
                items.push(
                  <li
                    key="cut"
                    data-testid="layout-cut"
                    className={`text-brand-ink text-13 fz-cap flex h-7.5 items-center gap-2 font-bold whitespace-nowrap motion-safe:transition-opacity ${
                      drag ? "opacity-0" : ""
                    }`}
                  >
                    <span className="bg-brand-ink h-0.5 flex-1 rounded-full" />
                    ↑ 여기까지 하단 탭 · 아래는 더보기
                    <span className="bg-brand-ink h-0.5 flex-1 rounded-full" />
                  </li>,
                );
              }
              items.push(
                <li
                  key={r.id}
                  data-testid="layout-row"
                  data-menu={r.id}
                  data-dragging={dragging ? "true" : undefined}
                  style={
                    shift ? { transform: `translateY(${shift}px)` } : undefined
                  }
                  className={`fh-56 relative flex items-center gap-1 ${
                    i > 0 && !afterCut ? ROW_BORDER : ""
                  } ${
                    dragging
                      ? "bg-lime/35 rounded-row z-10 shadow-[0_4px_16px_rgb(0_0_0/0.12)] motion-safe:scale-[1.03]"
                      : drag
                        ? "motion-safe:transition-transform motion-safe:duration-150"
                        : ""
                  }`}
                >
                  {/* 잡는 곳 ①: 아이콘 · 이름(+ 탭 배지) 칸 — 터치 · 펜은 길게 누르면 줄이 들린다(마우스는 여기서 끌지 않는다) */}
                  <div
                    data-part="grab"
                    {...handlers(r.id, i, "grab")}
                    onContextMenu={noContextMenu}
                    className={`${GRAB_CLASS} flex min-w-0 flex-1 items-center gap-1 self-stretch`}
                  >
                    <span
                      data-part="icon"
                      className={`flex flex-none pr-1.5 ${r.on ? "" : "opacity-40"}`}
                    >
                      <Icon
                        name={MENU_ICON[r.id]}
                        size={24}
                        className="text-brand-ink"
                      />
                    </span>
                    <span
                      className={`flex min-w-0 flex-1 flex-col items-start gap-0.5 py-1.5 ${
                        r.on ? "" : "opacity-40"
                      }`}
                    >
                      <span
                        data-part="name"
                        className="text-17 leading-tight font-semibold"
                      >
                        {def.label}
                      </span>
                      {r.tabNo !== null && (
                        <span
                          data-part="badge"
                          className="fz-cap bg-lime/35 text-13 text-brand-ink rounded-[11px] px-2.25 py-0.5 font-bold whitespace-nowrap"
                        >
                          탭 {r.tabNo}
                        </span>
                      )}
                    </span>
                  </div>

                  <button
                    type="button"
                    data-part="up"
                    aria-label={`${def.label} 위로`}
                    aria-disabled={atTop ? "true" : undefined}
                    onClick={() => {
                      if (atTop) return;
                      applyMove(moveBy(saved, r.id, -1), r.id, {
                        id: r.id,
                        part: "up",
                      });
                    }}
                    className={`fh-44 text-ink-2/60 flex w-9 flex-none cursor-pointer items-center justify-center ${
                      atTop ? "cursor-default opacity-30" : ""
                    }`}
                  >
                    <Icon
                      name="chevron"
                      size={18}
                      strokeWidth={2.4}
                      className="-rotate-90"
                    />
                  </button>
                  <button
                    type="button"
                    data-part="down"
                    aria-label={`${def.label} 아래로`}
                    aria-disabled={atBottom ? "true" : undefined}
                    onClick={() => {
                      if (atBottom) return;
                      applyMove(moveBy(saved, r.id, 1), r.id, {
                        id: r.id,
                        part: "down",
                      });
                    }}
                    className={`fh-44 text-ink-2/60 flex w-9 flex-none cursor-pointer items-center justify-center ${
                      atBottom ? "cursor-default opacity-30" : ""
                    }`}
                  >
                    <Icon
                      name="chevron"
                      size={18}
                      strokeWidth={2.4}
                      className="rotate-90"
                    />
                  </button>

                  {/* 스위치 칸: 종합의 "항상 사용" 배지도 같은 폭 칸에 넣어(두 줄로 접힘) 10줄의 ▲ · ▼ · 손잡이가 세로로 맞는다 */}
                  <span
                    data-part="toggle-slot"
                    className="flex w-14 flex-none items-center justify-center"
                  >
                    {r.fixed ? (
                      <span
                        data-part="fixed"
                        className="fz-cap bg-fill/14 text-13 text-gray-ink leading-title rounded-[10px] px-1.5 py-1 text-center font-bold"
                      >
                        항상 사용
                      </span>
                    ) : (
                      <button
                        type="button"
                        data-part="switch"
                        role="switch"
                        aria-checked={r.on}
                        aria-label={`${def.label} 사용`}
                        onClick={() => {
                          const next = toggleMenu(saved, r.id);
                          saveMenus(next);
                          setLive(announceToggled(def.label, !r.on));
                        }}
                        className="fh-44 flex flex-none cursor-pointer items-center px-0.5"
                      >
                        <span
                          aria-hidden="true"
                          className={`relative block h-7.75 w-12.75 flex-none rounded-full transition-colors ${
                            r.on ? "bg-brand" : "bg-fill/30"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 size-6.75 rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.25)] transition-transform ${
                              r.on ? "translate-x-5" : ""
                            }`}
                          />
                        </span>
                      </button>
                    )}
                  </span>

                  {/* 잡는 곳 ②: 손잡이 — 마우스는 누르고 바로 끌기, 터치 · 펜은 길게 누르기 */}
                  <button
                    type="button"
                    data-part="handle"
                    aria-label={`${def.label} 순서 바꾸기`}
                    aria-describedby="layout-hint"
                    {...handlers(r.id, i, "handle")}
                    onContextMenu={noContextMenu}
                    onKeyDown={(e) => {
                      let next: SavedMenus | null = null;
                      if (e.key === "ArrowUp") next = moveBy(saved, r.id, -1);
                      else if (e.key === "ArrowDown")
                        next = moveBy(saved, r.id, 1);
                      else if (e.key === "Home")
                        next = moveMenu(saved, r.id, 0);
                      else if (e.key === "End")
                        next = moveMenu(saved, r.id, MENU_IDS.length - 1);
                      if (!next) return;
                      e.preventDefault();
                      applyMove(next, r.id, { id: r.id, part: "handle" });
                    }}
                    className={`${GRAB_CLASS} text-ink-2/60 flex size-11 flex-none cursor-grab items-center justify-center active:cursor-grabbing`}
                  >
                    <svg
                      width="22"
                      height="22"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      aria-hidden="true"
                      style={{ strokeWidth: 2.2, strokeLinecap: "round" }}
                    >
                      <path d="M5 8h14M5 12h14M5 16h14" />
                    </svg>
                  </button>
                </li>,
              );
              return items;
            })}
          </ul>
        </div>
      ) : (
        // 저장값을 읽기 전: 목록 자리만 잡아 아래 "기본값" · 안내가 밀리지 않게 한다
        <div
          aria-hidden="true"
          className="rounded-card bg-card min-h-[calc(var(--fh)*560px+34px)]"
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            resetMenus();
            setLive("기본값으로 되돌렸어요");
          }}
          className="fh-48 bg-fill/14 text-17 text-ink cursor-pointer rounded-full px-5 font-semibold"
        >
          기본값
        </button>
        <span className="text-14 text-ink-2/85 min-w-45 flex-1 leading-snug">
          {member
            ? "내 계정에 저장돼요. 다른 기기에서도 같은 구성으로 보여요."
            : "이 기기에 저장돼요. 로그인하면 계정에 저장돼요."}
        </span>
      </div>

      <p
        data-testid="layout-live"
        role="status"
        aria-live="polite"
        className="sr-only"
      >
        {live}
      </p>
    </div>
  );
}
