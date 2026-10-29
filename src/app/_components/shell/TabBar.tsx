"use client";

import Link from "next/link";

import { withSelection, type Selection } from "@/domain/selection";

import { Icon } from "../ui/Icon";
import { TABS } from "./pages";

/**
 * 휴대폰(폭 1024 미만) 하단 메뉴. 화면 아래 떠 있는 유리 캡슐 (시안 v0.3.0).
 * 위 머리말의 메뉴와 같은 항목·순서·주소를 쓰며, 둘 중 하나만 보이므로 aria-label 도 같게 둔다.
 * 아이폰 안전 영역(홈 인디케이터)은 env(safe-area-inset-*) 로 피한다 (layout.tsx 의 viewportFit: cover).
 */
export function TabBar({
  pathname,
  selection,
}: {
  pathname: string;
  selection: Selection | null;
}) {
  return (
    <nav
      aria-label="메뉴"
      className="glass-strong bg-card/80 shadow-tabbar desktop:hidden dark:bg-tile/82 fixed right-[calc(10px+env(safe-area-inset-right))] bottom-[calc(12px+env(safe-area-inset-bottom))] left-[calc(10px+env(safe-area-inset-left))] z-30 flex h-(--tabbar-h) gap-0 rounded-[33px] p-1"
    >
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.key}
            href={withSelection(tab.href, selection)}
            aria-current={active ? "page" : undefined}
            className={`text-12 flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[29px] leading-3.5 font-bold whitespace-nowrap ${
              active ? "bg-emerald/16 text-brand-ink" : "text-ink-2/80"
            }`}
          >
            <Icon name={tab.key} size={24} />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
