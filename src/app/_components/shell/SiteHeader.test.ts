import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SheetProvider } from "./sheet-context";
import { SiteHeader, SiteHeaderFallback } from "./SiteHeader";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

describe("SiteHeader / SiteHeaderFallback", () => {
  it("SiteHeaderFallback을 그리면 '자료 없음'이 없고 '판정 불러오는 중' 안내가 있다", () => {
    const html = renderToString(
      React.createElement(
        SheetProvider,
        null,
        React.createElement(SiteHeaderFallback, null),
      ),
    );

    // 칩 묶음에 aria-busy="true"가 있어야 한다
    expect(html).toContain('aria-busy="true"');
    // 점에 motion-safe:animate-pulse 클래스가 적용되어야 한다
    expect(html).toContain("motion-safe:animate-pulse");
    // "판정 불러오는 중" 안내가 존재해야 한다
    expect(html).toContain("판정 불러오는 중");
    // "자료 없음"은 렌더링되지 않아야 한다
    expect(html).not.toContain("자료 없음");
  });

  it("statuses가 있고 특정 지점의 값이 null이면 '자료 없음'으로 표시된다", () => {
    const html = renderToString(
      React.createElement(
        SheetProvider,
        null,
        React.createElement(SiteHeader, {
          statuses: {
            apple: { 101: null },
            cabbage: { 101: null },
            soil: {
              loam: { 101: null, 119: "fair" },
              sand: {},
              clay: {},
              silt_loam: {},
              sandy_loam: {},
              loamy_sand: {},
              clay_loam: {},
              silty_clay_loam: {},
              sandy_clay_loam: {},
              silty_clay: {},
              sandy_clay: {},
              silt: {},
            },
          },
        }),
      ),
    );

    // 로딩이 완료되었으므로 aria-busy="true"는 없어야 한다
    expect(html).not.toContain('aria-busy="true"');
    // 점에 motion-safe:animate-pulse가 없어야 한다
    expect(html).not.toContain("motion-safe:animate-pulse");
    // "판정 불러오는 중" 안내는 없어야 한다
    expect(html).not.toContain("판정 불러오는 중");
    // 결측 지점(101 등)은 "자료 없음"이 표시되어야 한다
    expect(html).toContain("자료 없음");
  });
});
