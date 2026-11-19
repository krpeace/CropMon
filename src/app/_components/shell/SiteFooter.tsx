import Link from "next/link";

import { legalHref } from "@/domain/legal";

import packageJson from "../../../../package.json";
import { OperatorLine } from "./OperatorLine";
import { AboutButton } from "./Sheets";

/**
 * 데스크톱 바닥글 링크 줄 (이슈 #161 · #173). 약관 · 개인정보처리방침은 /terms · /privacy 링크(색은 회색 그대로),
 * 공지 · 문의 · FAQ 는 아직 화면이 없어 글자만.
 */
const NOTICES: readonly { label: string; href?: string }[] = [
  { label: "공지" },
  { label: "문의" },
  { label: "FAQ" },
  { label: "약관", href: legalHref("terms") },
  { label: "개인정보처리방침", href: legalHref("privacy") },
];

export function SiteFooter() {
  return (
    <footer className="border-ink-2/20 text-14 text-ink-2/85 desktop:pb-6 mx-auto mt-7 flex max-w-(--page-max) flex-wrap items-center gap-x-5 gap-y-2 border-t-(length:--hairline) px-(--page-gutter) pt-4.5 pb-[calc(var(--tabbar-h)+24px+var(--tabbar-safe-bottom))]">
      <span>자료 출처: 기상청 (ASOS 종관기상관측 · 단기예보)</span>
      <span>CropMon v{packageJson.version}</span>
      <AboutButton />

      {/* 데스크톱(폭 1024 이상)만: 링크 줄과 운영자 표기. 휴대폰 바닥글은 그대로. */}
      <div className="max-desktop:hidden flex basis-full flex-col gap-2 pt-1">
        <ul
          data-testid="footer-notices"
          aria-label="안내 항목"
          className="text-gray-ink m-0 flex list-none flex-wrap items-center gap-x-2 p-0"
        >
          {NOTICES.map(({ label, href }) => (
            <li
              key={label}
              className={`not-last:after:ml-2 not-last:after:content-['·'] ${
                label === "개인정보처리방침" ? "font-bold" : ""
              }`}
            >
              {href ? (
                <Link href={href} className="text-gray-ink hover:underline">
                  {label}
                </Link>
              ) : (
                label
              )}
            </li>
          ))}
        </ul>
        {/* 운영자 표기: 글자는 domain/operator.ts 한 곳, 마디마다 줄바꿈 금지(OperatorLine — 약관 · 개인정보처리방침 화면과 같은 부품). */}
        <OperatorLine testId="operator" />
      </div>
    </footer>
  );
}
