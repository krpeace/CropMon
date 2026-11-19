"use client";

import Link from "next/link";

import { MORE_HREF } from "@/domain/menus";
import { withSelection, type Selection } from "@/domain/selection";

import { Icon } from "../ui/Icon";
import { useMenus } from "./menu-store";
import { MENU_ICON } from "./pages";

/**
 * 휴대폰(폭 1024 미만) 하단 메뉴. 화면 아래 끝에 붙은 전체 폭 유리 막대 (결정 0054, 사용자 실기 확인 — 시안 v0.4.6의 떠 있는 캡슐과 다름).
 * 켠 메뉴 가운데 위에서 4개 + 더보기(맨 오른쪽 고정). 어떤 메뉴가 탭이 되는지는 domain/menus.ts 가 정한다.
 * 탭에 없는 화면을 보고 있으면 켜진 탭이 없고, 더보기는 /more 에서만 켜진다.
 * 위 머리말의 메뉴와 같은 aria-label 을 쓰며 둘 중 하나만 보인다 (결정 0026).
 * 아래 안전 영역(홈 인디케이터)은 tokens.css 의 --tabbar-safe-bottom 하나를 안쪽 여백으로 더해 탭이 그 위에 오고 막대 바탕은 화면 끝까지 칠해진다.
 * 좌우 안전 영역도 안쪽 여백이다 (layout.tsx 의 viewportFit: cover).
 */
export function TabBar({
  pathname,
  selection,
  folded,
  onReveal,
}: {
  pathname: string;
  selection: Selection | null;
  /** 오토 하이드로 숨겨져 있다 (아래로 내려감). 숨어도 aria-hidden · inert 는 아니다. */
  folded: boolean;
  /** 숨은 탭바 안으로 포커스가 들어오면 다시 펼친다 (화면 읽기 · 키보드 사용자가 메뉴를 잃지 않게). */
  onReveal: () => void;
}) {
  const { tabs } = useMenus();
  const items = [
    ...tabs.map((m) => ({
      key: m.id,
      href: m.href,
      label: m.label,
      icon: MENU_ICON[m.id],
    })),
    { key: "more", href: MORE_HREF, label: "더보기", icon: "more" as const },
  ];

  return (
    <nav
      aria-label="메뉴"
      onFocus={() => {
        if (folded) onReveal();
      }}
      className={`fz-cap glass-strong bg-card/80 border-ink-2/20 desktop:hidden dark:bg-tile/82 fixed right-0 bottom-0 left-0 z-30 flex h-[calc(var(--tabbar-h)+var(--tabbar-safe-bottom))] gap-0 border-t-(length:--hairline) pt-1 pr-[calc(4px+env(safe-area-inset-right))] pb-[calc(4px+var(--tabbar-safe-bottom))] pl-[calc(4px+env(safe-area-inset-left))] motion-safe:transition-transform motion-safe:duration-(--fold-duration) ${
        folded ? "translate-y-full" : ""
      }`}
    >
      {items.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.key}
            href={withSelection(item.href, selection)}
            aria-current={active ? "page" : undefined}
            className={`text-12 rounded-tab leading-title flex min-w-0 flex-1 flex-col items-center justify-center gap-px font-bold whitespace-nowrap ${
              active ? "bg-emerald/16 text-brand-ink" : "text-ink-2/80"
            }`}
          >
            <Icon name={item.icon} size={22} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
