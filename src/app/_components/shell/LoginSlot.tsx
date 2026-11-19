"use client";

import { Icon } from "../ui/Icon";
import { useSheet } from "./sheet-context";

/**
 * 상단 오른쪽 "로그인" 자리 (이슈 #189, 결정 0064). **세 모양을 모두 HTML 에 넣고 CSS 가 하나만 보이게 한다**
 * (`globals.css` 의 `data-members-show`). `<html data-members>` 는 머리 스크립트가 첫 그리기 전에 쿠키를 읽어 다는 값이라
 * 공개 화면은 정적인 채로 처음 그리는 순간부터 맞는 모양이 나온다(깜박임 없음). 숨긴 모양은 `display:none` 이라 화면 읽기에서도 빠진다.
 *
 * - `off`  : 속성 없음 = 지금 알파 — "로그인"(데스크톱은 "곧 열려요" 배지), 누르면 "2027년 1월 1일부터 열려요" 안내 창
 * - `anon` : 회원제 켬 · 비로그인 — "로그인", 누르면 로그인 시트
 * - `in`   : 로그인함 — 프로필 아이콘, 누르면 내 계정 시트
 * 시트가 열린 동안 휴대폰의 이 버튼은 숨긴다(자리는 유지).
 */
export function LoginSlot({ variant }: { variant: "desktop" | "mobile" }) {
  const { open, sheet } = useSheet();
  const loginOpen = sheet === "login";
  const accountOpen = sheet === "account";
  const mobile = variant === "mobile";

  const hideWhile = (isOpen: boolean) =>
    mobile && isOpen
      ? ({ "aria-hidden": true, tabIndex: -1 } as const)
      : ({} as const);
  const invisible = (isOpen: boolean) => (mobile && isOpen ? "invisible" : "");

  const loginClass = mobile
    ? "bg-fill/12 text-15 text-ink h-11 flex-none cursor-pointer rounded-full px-3.25 font-semibold whitespace-nowrap"
    : "bg-fill/12 text-16 text-ink-2/90 desktop:pr-2.5 flex h-11 flex-none cursor-pointer items-center gap-2 rounded-full px-4 font-semibold";

  return (
    <>
      <button
        type="button"
        data-members-show="off"
        onClick={() => open("login")}
        {...hideWhile(loginOpen)}
        className={`${loginClass} ${invisible(loginOpen)}`}
      >
        로그인
        {!mobile && (
          <span className="bg-lime/50 text-13 text-brand-ink desktop:inline hidden rounded-full px-2.25 py-1 font-bold">
            곧 열려요
          </span>
        )}
      </button>
      <button
        type="button"
        data-members-show="anon"
        onClick={() => open("login")}
        {...hideWhile(loginOpen)}
        className={`${loginClass} ${invisible(loginOpen)}`}
      >
        로그인
      </button>
      <button
        type="button"
        data-members-show="in"
        aria-label="내 계정"
        aria-haspopup="dialog"
        onClick={() => open("account")}
        {...hideWhile(accountOpen)}
        className={`bg-fill/12 text-ink flex size-11 flex-none cursor-pointer items-center justify-center rounded-full ${invisible(accountOpen)}`}
      >
        <Icon name="user" size={22} />
      </button>
    </>
  );
}
