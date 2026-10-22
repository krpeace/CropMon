import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "cropwater — 노지 작물 물수지",
  description:
    "노지 작물이 쓰는 물과 토양에 남은 물(FAO-56 물수지)을 농업인이 쉽게 볼 수 있게 보여 주는 서비스입니다.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
