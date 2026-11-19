"use client";

import Link from "next/link";

import { stepById } from "@/domain/font-scale";
import { withSelection, type Selection } from "@/domain/selection";

import { Badge } from "../ui/Badge";
import { Icon } from "../ui/Icon";
import { useFontScalePref } from "./font-scale-store";
import { useMenus } from "./menu-store";
import { ICON_PATH, MENU_ICON } from "./pages";
import { useThemeToggle } from "./ThemeToggle";

const ROW =
  "text-17 border-ink-2/14 flex fh-54 items-center gap-3 border-t-(length:--hairline) font-semibold first:border-t-0";

const GROUP = "rounded-card bg-card m-0 flex list-none flex-col px-4 py-0.5";

/**
 * 더보기 화면 (시안 v0.4.6 12절 "더보기", 이슈 #145 · #161). 위에서 아래로:
 * ① 서비스 메뉴 — 맨 위 종합, 켠 메뉴(준비 중은 꼬리표, 설정값 순서)
 * ② 구분선
 * ③ 공지 · 문의 · FAQ · 약관 — 아직 화면이 없어 "준비 중" (약관은 L1 에서 /terms 링크로)
 * ④ (비회원) 화면 구성("준비 중", S5) · 글씨 크기(/font-size 로 가는 줄, 지금 단계 이름) · 다크 모드(스위치 — 휴대폰 맥락 바에는 해/달 버튼이 없다)
 * ⑤ 끈 메뉴가 있으면 맨 아래 "숨긴 메뉴 n개" 한 줄
 * 준비 중 줄은 버튼처럼 보이되 aria-disabled 이고 눌러도 이동하지 않는다.
 */
export function MoreList({ selection }: { selection: Selection | null }) {
  const fontPref = useFontScalePref();
  const { more, hiddenCount } = useMenus();
  const [home, ...rest] = more;
  const groups = [[home], rest].filter((rows) => rows.length > 0);

  return (
    <div className="flex flex-col gap-3">
      {groups.map((rows) => (
        <ul key={rows[0].id} className={GROUP}>
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

      <hr className="border-ink-2/14 mx-1 my-0.5 border-0 border-t-(length:--hairline)" />

      <ul className={GROUP}>
        <SoonRow icon="notice" label="공지" />
        <SoonRow icon="inquiry" label="문의" />
        <SoonRow icon="faq" label="FAQ" />
        <SoonRow icon="doc" label="약관" />
      </ul>

      <ul className={GROUP}>
        <SoonRow icon="layout" label="화면 구성" />
        <li className="contents">
          <Link href={withSelection("/font-size", selection)} className={ROW}>
            <Icon name="text" size={24} className="text-brand-ink flex-none" />
            <span className="flex-1">글씨 크기</span>
            <span className="text-15 text-ink-2/75 font-medium">
              {fontPref.follow ? "휴대폰 설정" : stepById(fontPref.step).label}
            </span>
            <span aria-hidden="true" className="text-20 text-ink-2/60">
              ›
            </span>
          </Link>
        </li>
        <ThemeRow />
      </ul>

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
    </div>
  );
}

/** 아직 화면이 없는 줄: 버튼처럼 보이되 aria-disabled, 회색 "준비 중" 꼬리표, 눌러도 이동 없음. */
function SoonRow({
  icon,
  label,
}: {
  icon: keyof typeof ICON_PATH;
  label: string;
}) {
  return (
    <li className="contents">
      <button
        type="button"
        aria-disabled="true"
        className={`${ROW} w-full cursor-default text-left`}
      >
        <Icon name={icon} size={24} className="text-brand-ink flex-none" />
        <span className="flex-1">{label}</span>
        <Badge>준비 중</Badge>
      </button>
    </li>
  );
}

/**
 * "다크 모드" 스위치 줄. 휴대폰 맥락 바에는 해/달 버튼이 없어서(비회원은 더보기 맨 아래) 여기서 바꾼다.
 * 동작은 데스크톱 해/달 버튼과 같다(useThemeToggle). 버튼 이름("다크 모드로 보기" / "라이트 모드로 보기")은 기존 시험이 쓴다.
 */
function ThemeRow() {
  const { dark, label, toggle } = useThemeToggle();
  return (
    <li className="contents">
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
    </li>
  );
}
