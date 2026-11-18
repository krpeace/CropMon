"use client";

import Link from "next/link";

import { withSelection, type Selection } from "@/domain/selection";

import { Badge } from "../ui/Badge";
import { Icon } from "../ui/Icon";
import { useMenus } from "./menu-store";
import { MENU_ICON } from "./pages";

const ROW =
  "text-17 border-ink-2/14 flex min-h-13.5 items-center gap-3 border-t-(length:--hairline) font-semibold first:border-t-0";

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
          className="text-15 text-ink-2/85 rounded-box flex min-h-12 flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 px-3 py-1 font-semibold"
        >
          <span>숨긴 메뉴 {hiddenCount}개</span>
          <span aria-hidden="true">·</span>
          <span className="text-brand-ink font-bold underline">
            화면 구성에서 다시 켜기
          </span>
        </button>
      )}
    </div>
  );
}
