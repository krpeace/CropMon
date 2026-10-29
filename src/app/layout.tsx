import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import { THEME_COLOR, THEME_STORAGE_KEY } from "@/domain/theme";

import { Sheets } from "./_components/shell/Sheets";
import { SheetProvider } from "./_components/shell/sheet-context";
import { SiteFooter } from "./_components/shell/SiteFooter";
import { SiteHeaderFallback } from "./_components/shell/SiteHeader";
import { SiteHeaderWithStatus } from "./_components/shell/SiteHeaderWithStatus";
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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <link rel="stylesheet" href={PRETENDARD_CSS} crossOrigin="anonymous" />
      </head>
      <body>
        <SheetProvider>
          <Suspense fallback={<SiteHeaderFallback />}>
            <SiteHeaderWithStatus />
          </Suspense>
          <main className="mx-auto flex max-w-(--page-max) flex-col gap-4 px-(--page-gutter) pt-3">
            {children}
          </main>
          <SiteFooter />
          <Suspense fallback={null}>
            <Sheets />
          </Suspense>
        </SheetProvider>
      </body>
    </html>
  );
}
