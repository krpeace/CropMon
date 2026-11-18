"use client";

import Link from "next/link";

import { withSelection, type Selection } from "@/domain/selection";

import { Badge } from "../ui/Badge";
import { Icon } from "../ui/Icon";
import { useMenus } from "./menu-store";
import { MENU_ICON } from "./pages";
import { useThemeToggle } from "./ThemeToggle";

const ROW =
  "text-17 border-ink-2/14 flex fh-54 items-center gap-3 border-t-(length:--hairline) font-semibold first:border-t-0";

/**
 * 더보기 화면의 서비스 메뉴 (시안 v0.4.6 더보기 1단계). 맨 위 종합, 그 아래 켠 메뉴(준비 중은 꼬리표),
 * 끈 메뉴가 있으면 맨 아래에 "숨긴 메뉴 n개" 한 줄. 화면 구성 화면이 생기기 전이라 그 줄은 이동하지 않는다.
 * 공지·문의·FAQ·약관과 화면 구성·글씨 크기·다크 모드는 이번 범위 밖 (#145).
 */
export function MoreList({ selection }: { selection: Selection | null }) {
  const { more, hiddenCount } = useMenus();
  const [home, ...rest] = more;
  const groups = [[home], rest].filter((rows) => rows.length > 0);

  return (
    <div className="flex flex-col gap-3">
      {groups.map((rows) => (
        <ul
          key={rows[0].id}
          className="rounded-card bg-card m-0 flex list-none flex-col px-4 py-0.5"
        >
          {rows.map((menu) => (
            <li key={menu.id} className="contents">
              <Link href={withSelection(menu.href, selection)} className={ROW}>
                <Icon
                  name={MENU_ICON[menu.id]}
                  size={24}
                  className="text-brand-ink flex-none"
                />
                <span className="flex-1">{menu.label}</span>
                {menu.ready ? (
                  <span aria-hidden="true" className="text-20 text-ink-2/60">
                    ›
                  </span>
                ) : (
                  <Badge>준비 중</Badge>
                )}
              </Link>
            </li>
          ))}
        </ul>
      ))}

      {hiddenCount > 0 && (
        <button
          type="button"
          aria-disabled="true"
          className="text-15 text-ink-2/85 rounded-box fh-48 flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 px-3 py-1 font-semibold"
        >
          <span>숨긴 메뉴 {hiddenCount}개</span>
          <span aria-hidden="true">·</span>
          <span className="text-brand-ink font-bold underline">
            화면 구성에서 다시 켜기
          </span>
        </button>
      )}

      <ThemeRow />
    </div>
  );
}

/**
 * 맨 아래 "다크 모드" 한 줄. 휴대폰 맥락 바에는 해/달 버튼이 없어서(비회원은 더보기 맨 아래) 여기서 바꾼다.
 * 동작은 데스크톱 해/달 버튼과 같다(useThemeToggle). 모양 정리는 S4.
 */
function ThemeRow() {
  const { dark, label, toggle } = useThemeToggle();
  return (
    <div className="rounded-card bg-card px-4 py-0.5">
      <button
        type="button"
        aria-label={label}
        onClick={toggle}
        className={`${ROW} w-full cursor-pointer text-left`}
      >
        <Icon
          name={dark ? "sun" : "moon"}
          size={24}
          className="text-brand-ink flex-none"
        />
        <span className="flex-1">다크 모드</span>
        <span
          aria-hidden="true"
          className={`relative h-7.75 w-12.75 flex-none rounded-full transition-colors ${
            dark ? "bg-brand" : "bg-fill/30"
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 size-6.75 rounded-full bg-white shadow-[0_2px_6px_rgb(0_0_0/0.25)] transition-transform ${
              dark ? "translate-x-5" : ""
            }`}
          />
        </span>
      </button>
    </div>
  );
}
