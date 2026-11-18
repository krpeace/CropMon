import { describe, expect, it } from "vitest";

import { contrastRatio, parseColor, relativeLuminance } from "./contrast";

describe("parseColor — CSS 색 글자를 [r, g, b] 로", () => {
  it("rgb(r g b) 공백 형식", () => {
    expect(parseColor("rgb(196 43 28)")).toEqual([196, 43, 28]);
  });

  it("rgb(r, g, b) 쉼표 형식, 앞뒤 공백", () => {
    expect(parseColor("  rgb(196, 43, 28) ")).toEqual([196, 43, 28]);
  });

  it("#rrggbb 와 #rgb", () => {
    expect(parseColor("#fff")).toEqual([255, 255, 255]);
    expect(parseColor("#000")).toEqual([0, 0, 0]);
    expect(parseColor("#144C33")).toEqual([20, 76, 51]);
  });

  it("알아볼 수 없으면 null (var(…) · 이름 · 투명도 있는 색은 대비를 잴 수 없다)", () => {
    expect(parseColor("var(--color-card)")).toBeNull();
    expect(parseColor("transparent")).toBeNull();
    expect(parseColor("rgb(0 0 0 / 0.5)")).toBeNull();
    expect(parseColor("")).toBeNull();
  });
});

describe("relativeLuminance — WCAG 상대 휘도", () => {
  it("검정 0, 흰색 1", () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
  });

  it("중간 회색은 그 사이", () => {
    const l = relativeLuminance([128, 128, 128]);
    expect(l).toBeGreaterThan(0.2);
    expect(l).toBeLessThan(0.25);
  });
});

describe("contrastRatio — WCAG 대비비 (글자 4.5:1 이상이 기준)", () => {
  it("검정 · 흰색은 21:1, 같은 색은 1:1", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([10, 20, 30], [10, 20, 30])).toBe(1);
  });

  it("순서를 바꿔도 같다", () => {
    const a = contrastRatio([196, 43, 28], [255, 255, 255]);
    const b = contrastRatio([255, 255, 255], [196, 43, 28]);
    expect(a).toBeCloseTo(b, 10);
  });

  it("알려진 쌍: 위험 색 라이트 rgb(196 43 28) 은 흰 바탕에서 약 5.7:1", () => {
    expect(contrastRatio([196, 43, 28], [255, 255, 255])).toBeCloseTo(5.66, 1);
  });

  it("알려진 쌍: 위험 색 다크 rgb(255 105 97) 은 검정 바탕에서 약 7.4:1, 흰 글자는 약 2.8:1", () => {
    expect(contrastRatio([255, 105, 97], [0, 0, 0])).toBeCloseTo(7.45, 1);
    expect(contrastRatio([255, 105, 97], [255, 255, 255])).toBeCloseTo(2.82, 1);
  });
});
