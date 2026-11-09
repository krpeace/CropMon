import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import { SheetProvider } from "./sheet-context";
import { SiteHeader, SiteHeaderFallback } from "./SiteHeader";

let mockSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => mockSearchParams,
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
    // 대기 화면에서는 실패 안내 줄이 보이지 않아야 한다
    expect(html).not.toContain("판정 자료를 불러오지 못했어요");
  });

  it("statuses가 있고 특정 지점의 값이 null이면 '자료 없음'으로 표시되고 실패 안내는 없다", () => {
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
    // 정상 결측 상태에서는 실패 안내 줄이 없어야 한다
    expect(html).not.toContain("판정 자료를 불러오지 못했어요");
    // 결측 지점(101 등)은 "자료 없음"이 표시되어야 한다
    expect(html).toContain("자료 없음");
  });

  it("DB 읽기 실패(failed: true) 시 헤더 notice에 실패 안내가 보이고 칩에는 '자료 없음'이 반복되지 않는다", () => {
    const html = renderToString(
      React.createElement(
        SheetProvider,
        null,
        React.createElement(SiteHeader, {
          statuses: {
            apple: { 101: null },
            cabbage: { 101: null },
            soil: {
              loam: { 101: null },
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
            failed: true,
          },
        }),
      ),
    );

    // 실패 안내 줄이 헤더 상단 notice 자리에 보여야 한다
    expect(html).toContain(
      "판정 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    );
    // 점에 펄스 애니메이션은 없어야 한다 (정적 회색)
    expect(html).not.toContain("motion-safe:animate-pulse");
    // "판정 불러오는 중"은 없어야 한다
    expect(html).not.toContain("판정 불러오는 중");
    // 칩 내부에서 "자료 없음"이 반복되지 않아야 한다
    expect(html).not.toContain("자료 없음");
    // 선택 지역 버튼에 "불러오지 못함" 문구가 들어가야 한다
    expect(html).toContain("불러오지 못함");
  });

  it("폐지 지점 안내(notice)와 DB 읽기 실패 안내가 함께 있으면 둘 다 표시된다", () => {
    // searchParams에 from=116 (관악산 폐지 지점)을 주어 notice 유발
    mockSearchParams = new URLSearchParams("from=116");
    const html = renderToString(
      React.createElement(
        SheetProvider,
        null,
        React.createElement(SiteHeader, {
          statuses: {
            apple: {},
            cabbage: {},
            soil: {
              loam: {},
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
            failed: true,
          },
        }),
      ),
    );
    mockSearchParams = new URLSearchParams();

    // 폐지 지점 안내가 포함되어 있어야 한다
    expect(html).toContain("관악산(116)은 관측이 중단된 지점이라");
    // 실패 안내도 포함되어 있어야 한다
    expect(html).toContain(
      "판정 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    );
  });
});
