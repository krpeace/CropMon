import { Fragment } from "react";

import { operatorSegments } from "@/domain/operator";

import packageJson from "../../../../package.json";
import { AboutButton } from "./Sheets";

/** 데스크톱 바닥글 링크 줄 (이슈 #161). 아직 화면이 없어 글자만 — L1 이 약관 · 개인정보처리방침을 /terms · /privacy 링크로 바꾼다. */
const NOTICES = ["공지", "문의", "FAQ", "약관", "개인정보처리방침"] as const;

export function SiteFooter() {
  return (
    <footer className="border-ink-2/20 text-14 text-ink-2/85 desktop:pb-6 mx-auto mt-7 flex max-w-(--page-max) flex-wrap items-center gap-x-5 gap-y-2 border-t-(length:--hairline) px-(--page-gutter) pt-4.5 pb-[calc(var(--tabbar-h)+12px+24px+env(safe-area-inset-bottom))]">
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
          {NOTICES.map((label) => (
            <li
              key={label}
              className={`not-last:after:ml-2 not-last:after:content-['·'] ${
                label === "개인정보처리방침" ? "font-bold" : ""
              }`}
            >
              {label}
            </li>
          ))}
        </ul>
        {/* 운영자 표기: 글자는 domain/operator.ts 한 곳(약관 초안과 같은 글자). 마디마다 줄바꿈 금지로 묶고
            점(·)은 앞 마디 끝에 붙여, 하이픈 숫자(281-87-02364 · 031-360-4152)가 쪼개지거나 줄 처음에 점이 오지 않게 한다. */}
        <p
          data-testid="operator"
          className="text-12 text-gray-ink leading-body m-0"
        >
          {operatorSegments().map((segment, i, all) => (
            <Fragment key={segment}>
              {i > 0 && " "}
              <span className="whitespace-nowrap">
                {i < all.length - 1 ? `${segment} ·` : segment}
              </span>
            </Fragment>
          ))}
        </p>
      </div>
    </footer>
  );
}
