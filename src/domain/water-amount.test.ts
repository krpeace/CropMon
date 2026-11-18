import { describe, expect, it } from "vitest";

import {
  convertWater,
  formatApproxTons,
  formatWaterAmount,
  roundMm1,
  toTons,
} from "./water-amount";

const N = " "; // 줄바꿈 금지 공백

describe("roundMm1 — 화면에 보이는 mm (소수 한 자리)", () => {
  it("반올림 (절반은 올림, 부동소수 오차에 흔들리지 않는다)", () => {
    expect(roundMm1(1.25)).toBe(1.3);
    expect(roundMm1(1.24)).toBe(1.2);
    expect(roundMm1(0.05)).toBe(0.1);
    expect(roundMm1(0.04)).toBe(0);
    expect(roundMm1(2.675)).toBe(2.7);
    expect(roundMm1(1.005)).toBe(1);
    expect(roundMm1(35)).toBe(35);
    expect(roundMm1(0)).toBe(0);
  });
});

describe("toTons — 보이는 mm × 면적(m²) ÷ 1,000 (1 mm × 1,000 m² = 1톤)", () => {
  it("0 mm 는 0톤", () => {
    expect(toTons(0, 2000)).toBe(0);
  });

  it("1.25 mm → 화면 1.3 → × 2,000 m² → 2.6톤 / 1.24 → 1.2 → 2.4톤", () => {
    expect(toTons(1.25, 2000)).toBeCloseTo(2.6, 10);
    expect(toTons(1.24, 2000)).toBeCloseTo(2.4, 10);
  });

  it("면적 1,000 · 2,000 · 3,305(1,000평) m²", () => {
    expect(toTons(35, 1000)).toBeCloseTo(35, 10);
    expect(toTons(2.5, 1000)).toBeCloseTo(2.5, 10);
    expect(toTons(2.5, 2000)).toBeCloseTo(5, 10);
    expect(toTons(51, 3305)).toBeCloseTo(168.555, 10);
  });

  it("반올림 전 값으로 곱하지 않는다 — 곱하면 다른 값이 나오는 경우", () => {
    // 1.25 × 3,305 ÷ 1,000 = 4.13125 (반올림 전). 규칙대로는 1.3 × 3,305 ÷ 1,000 = 4.2965
    expect(toTons(1.25, 3305)).toBeCloseTo(4.2965, 10);
    expect(toTons(1.25, 3305)).not.toBeCloseTo(4.13125, 3);
    // 농가가 화면의 mm 로 곱해 봐도 같은 톤: 1.3 × 3305 / 1000
    expect(toTons(1.25, 3305)).toBeCloseTo((1.3 * 3305) / 1000, 10);
  });

  it("값이 없거나 이상하면 null (문구는 화면이 정한다)", () => {
    expect(toTons(null, 2000)).toBeNull();
    expect(toTons(undefined, 2000)).toBeNull();
    expect(toTons(Number.NaN, 2000)).toBeNull();
    expect(toTons(Number.POSITIVE_INFINITY, 2000)).toBeNull();
    expect(toTons(-1, 2000)).toBeNull();
    expect(toTons(1.2, null)).toBeNull();
    expect(toTons(1.2, undefined)).toBeNull();
    expect(toTons(1.2, 0)).toBeNull();
    expect(toTons(1.2, -5)).toBeNull();
    expect(toTons(1.2, Number.NaN)).toBeNull();
  });
});

describe("formatApproxTons — 늘 '약', 10톤 미만 소수 한 자리, 10톤 이상 정수", () => {
  it("시안 예: 약 2.5톤 · 약 0.9톤 · 약 3.9톤", () => {
    expect(formatApproxTons(2.5, 1000)).toBe(`약${N}2.5톤`);
    expect(formatApproxTons(0.9, 1000)).toBe(`약${N}0.9톤`);
    expect(formatApproxTons(3.9, 1000)).toBe(`약${N}3.9톤`);
  });

  it("1.25 mm × 2,000 m² → 약 2.6톤, 1.24 mm → 약 2.4톤", () => {
    expect(formatApproxTons(1.25, 2000)).toBe(`약${N}2.6톤`);
    expect(formatApproxTons(1.24, 2000)).toBe(`약${N}2.4톤`);
  });

  it("반올림 전 값으로 곱하면 약 4.1톤인데, 규칙대로 약 4.3톤", () => {
    expect(formatApproxTons(1.25, 3305)).toBe(`약${N}4.3톤`);
  });

  it("10톤 미만은 0도 소수 한 자리로: 약 2.0톤", () => {
    expect(formatApproxTons(1, 2000)).toBe(`약${N}2.0톤`);
  });

  it("10톤 이상은 정수 + 천 단위 쉼표: 약 116톤 · 약 169톤 · 약 1,653톤", () => {
    expect(formatApproxTons(35, 3305)).toBe(`약${N}116톤`); // 115.675
    expect(formatApproxTons(51, 3305)).toBe(`약${N}169톤`); // 168.555
    expect(formatApproxTons(500, 3305)).toBe(`약${N}1,653톤`); // 1652.5
    expect(formatApproxTons(10, 10000)).toBe(`약${N}100톤`);
  });

  it("자리수는 반올림한 뒤의 값으로 정한다: 9.95톤은 소수 한 자리로 10.0 이므로 '약 10톤'", () => {
    expect(formatApproxTons(19.9, 500)).toBe(`약${N}10톤`); // 9.95
    expect(formatApproxTons(19.9, 500)).not.toContain("10.0");
    // 바로 아래는 소수 한 자리 그대로
    expect(formatApproxTons(10, 994)).toBe(`약${N}9.9톤`); // 9.94
    // 10톤을 막 넘는 값도 정수로
    expect(formatApproxTons(20.8, 500)).toBe(`약${N}10톤`); // 10.4
    // 99.5톤 → 약 100톤
    expect(formatApproxTons(199, 500)).toBe(`약${N}100톤`);
  });

  it("0 mm 는 정확히 0이라 '약' 없이 '0톤'", () => {
    expect(formatApproxTons(0, 2000)).toBe("0톤");
    expect(formatApproxTons(0.04, 2000)).toBe("0톤"); // 보이는 mm 가 0.0
  });

  it("0보다 크지만 소수 한 자리로 0.0 이 되는 아주 작은 양은 '0.1톤 미만'", () => {
    expect(formatApproxTons(0.1, 100)).toBe(`0.1톤${N}미만`); // 0.01톤
    expect(formatApproxTons(0.2, 200)).toBe(`0.1톤${N}미만`); // 0.04톤
    // 0.05톤은 소수 한 자리로 0.1
    expect(formatApproxTons(0.1, 500)).toBe(`약${N}0.1톤`);
  });

  it("값이 없으면 null", () => {
    expect(formatApproxTons(null, 2000)).toBeNull();
    expect(formatApproxTons(1.2, null)).toBeNull();
    expect(formatApproxTons(-1, 2000)).toBeNull();
    expect(formatApproxTons(1.2, 0)).toBeNull();
  });

  it("일반 공백이 하나도 남지 않는다", () => {
    for (const out of [
      formatApproxTons(1.25, 2000),
      formatApproxTons(51, 3305),
      formatApproxTons(0, 2000),
      formatApproxTons(0.1, 100),
    ]) {
      expect(out).not.toMatch(/ /);
    }
  });
});

describe("convertWater — 1톤 = 1,000 L", () => {
  it("0", () => {
    expect(convertWater(0, "L", "ton")).toBe(0);
    expect(convertWater(0, "ton", "L")).toBe(0);
  });

  it("1,000 L = 1톤, 1톤 = 1,000 L", () => {
    expect(convertWater(1000, "L", "ton")).toBe(1);
    expect(convertWater(1, "ton", "L")).toBe(1000);
  });

  it("소수: 300 L = 0.3톤, 0.3톤 = 300 L, 250 L = 0.25톤, 1 L = 0.001톤", () => {
    expect(convertWater(300, "L", "ton")).toBe(0.3);
    expect(convertWater(0.3, "ton", "L")).toBe(300);
    expect(convertWater(250, "L", "ton")).toBe(0.25);
    expect(convertWater(1, "L", "ton")).toBe(0.001);
  });

  it("부동소수 찌꺼기가 없다: 1.1톤 = 1,100 L", () => {
    expect(convertWater(1.1, "ton", "L")).toBe(1100);
    expect(convertWater(2.3, "ton", "L")).toBe(2300);
  });

  it("같은 단위는 그대로", () => {
    expect(convertWater(12.5, "L", "L")).toBe(12.5);
    expect(convertWater(0.4, "ton", "ton")).toBe(0.4);
  });

  it("값이 이상하면 null", () => {
    expect(convertWater(-1, "L", "ton")).toBeNull();
    expect(convertWater(Number.NaN, "L", "ton")).toBeNull();
    expect(convertWater(Number.POSITIVE_INFINITY, "ton", "L")).toBeNull();
  });
});

describe("formatWaterAmount — 사용자가 넣은 단위 그대로 (약 없음)", () => {
  it("'300 L', '1,000 L' — 숫자와 L 사이 줄바꿈 금지", () => {
    expect(formatWaterAmount(300, "L")).toBe(`300${N}L`);
    expect(formatWaterAmount(1000, "L")).toBe(`1,000${N}L`);
    expect(formatWaterAmount(0, "L")).toBe(`0${N}L`);
  });

  it("'0.3톤' — 톤은 붙여 쓰고, 소수는 뒤쪽 0 없이 최대 세 자리", () => {
    expect(formatWaterAmount(0.3, "ton")).toBe("0.3톤");
    expect(formatWaterAmount(0.25, "ton")).toBe("0.25톤");
    expect(formatWaterAmount(0.001, "ton")).toBe("0.001톤");
    expect(formatWaterAmount(1, "ton")).toBe("1톤");
    expect(formatWaterAmount(0, "ton")).toBe("0톤");
  });

  it("L ↔ 톤 변환 뒤에도 같은 모양: 300 L → 0.3톤", () => {
    expect(formatWaterAmount(convertWater(300, "L", "ton")!, "ton")).toBe(
      "0.3톤",
    );
  });

  it("값이 이상하면 null, 일반 공백이 남지 않는다", () => {
    expect(formatWaterAmount(-1, "L")).toBeNull();
    expect(formatWaterAmount(Number.NaN, "ton")).toBeNull();
    expect(formatWaterAmount(300, "L")).not.toMatch(/ /);
  });
});
