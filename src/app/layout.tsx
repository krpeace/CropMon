import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Analytics } from "@vercel/analytics/next";

import { buildFontScaleScript } from "@/domain/font-scale";
import { buildMembersScript } from "@/domain/members-state";
import { buildNoticeScript } from "@/domain/notice";
import { THEME_COLOR, THEME_STORAGE_KEY } from "@/domain/theme";

import { AccountSync } from "./_components/shell/AccountSync";
import { FontScaleSync } from "./_components/shell/FontScaleSync";
import { LoginNotice } from "./_components/shell/LoginNotice";
import { NavHistory } from "./_components/shell/nav-history";
import { Sheets } from "./_components/shell/Sheets";
import { SheetProvider } from "./_components/shell/sheet-context";
import { SiteFooter } from "./_components/shell/SiteFooter";
import { SiteHeaderFallback } from "./_components/shell/SiteHeader";
import { SiteHeaderWithStatus } from "./_components/shell/SiteHeaderWithStatus";
import { ToastHost } from "./_components/ui/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CropMon", template: "CropMon · %s" },
  description: "농업 데이터와 내 농장 기록으로 작물 재배 판단을 돕는 서비스",
};

// themeColor 는 여기 넣지 않는다. <head> 의 theme-color meta 하나를 THEME_SCRIPT 와 ThemeToggle 이 화면 테마에 맞춰 바꾼다 (결정 0031). 여기 넣으면 meta 가 두 개가 된다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** Pretendard 글꼴 (시안과 같은 CDN 주소). */
const PRETENDARD_CSS =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";

/**
 * 처음 그리기 전에 테마를 정한다 (하얗게 번쩍이지 않게). domain/theme.ts 의 resolveTheme 와 같은 순서:
 * 저장된 선택 → 휴대폰·PC 설정 → 라이트. 저장소가 막혀도(사생활 보호 모드) 오류 없이 넘어간다.
 * 같은 테마로 주소창 색(theme-color meta)도 정한다. meta 는 React 가 아니라 이 스크립트가 만든다:
 * React 19 는 <meta> 를 직접 관리해서, 스크립트가 값을 바꾼 뒤 화면을 붙일 때 값이 다른 meta 를 하나 더 만들어 버린다.
 */
const THEME_SCRIPT = `(function(){var t=null;try{var v=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(v==="light"||v==="dark")t=v}catch(e){}if(!t)t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(!m){m=document.createElement("meta");m.name="theme-color";document.head.appendChild(m)}m.setAttribute("content",t==="dark"?${JSON.stringify(THEME_COLOR.dark)}:${JSON.stringify(THEME_COLOR.light)})})()`;

/**
 * 처음 그리기 전에 글씨 크기(`--fz`)와 닫은 알리기 카드 표시를 정한다 (이슈 #168, 결정 0055). 둘 다 THEME_SCRIPT 와 같은 방식:
 * 저장 값을 읽어 `<html>` 에 달고, 저장소가 막히거나 오류가 나도 화면을 막지 않는다. 글자는 domain 에서 만든다.
 */
const FONT_SCALE_SCRIPT = buildFontScaleScript();
const NOTICE_SCRIPT = buildNoticeScript();

/**
 * 처음 그리기 전에 회원제 표시 쿠키(cm_m)를 읽어 <html data-members data-naver> 를 단다 (이슈 #189, 결정 0064).
 * 헤더 오른쪽 자리를 CSS 가 이 속성으로 고른다. 쿠키가 없거나 모르는 값이면 아무것도 안 단다(= 지금 알파 모양). 오류가 나도 화면을 막지 않는다.
 */
const MEMBERS_SCRIPT = buildMembersScript();

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: FONT_SCALE_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: NOTICE_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: MEMBERS_SCRIPT }} />
        <link rel="stylesheet" href={PRETENDARD_CSS} crossOrigin="anonymous" />
      </head>
      <body>
        <SheetProvider>
          <NavHistory />
          <FontScaleSync />
          <Suspense fallback={<SiteHeaderFallback />}>
            <SiteHeaderWithStatus />
          </Suspense>
          <main className="mx-auto flex max-w-(--page-max) flex-col gap-4 px-(--page-gutter) pt-3">
            {children}
          </main>
          <SiteFooter />
          <Suspense fallback={null}>
            <Sheets />
            <LoginNotice />
            <AccountSync />
          </Suspense>
          <ToastHost />
          <Analytics />
        </SheetProvider>
      </body>
    </html>
  );
}
