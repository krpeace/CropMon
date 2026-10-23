import type { Metadata, Viewport } from "next";
import { Suspense } from "react";

import { Sheets } from "./_components/shell/Sheets";
import { SheetProvider } from "./_components/shell/sheet-context";
import { SiteFooter } from "./_components/shell/SiteFooter";
import { SiteHeader, SiteHeaderFallback } from "./_components/shell/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "CropMon", template: "CropMon · %s" },
  description: "농업 데이터와 내 농장 기록으로 작물 재배 판단을 돕는 서비스",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

/** Pretendard 글꼴 (시안과 같은 CDN 주소). */
const PRETENDARD_CSS =
  "https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css";

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <head>
        <link rel="stylesheet" href={PRETENDARD_CSS} crossOrigin="anonymous" />
      </head>
      <body>
        <SheetProvider>
          <Suspense fallback={<SiteHeaderFallback />}>
            <SiteHeader />
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
