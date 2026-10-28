import { describe, expect, it } from "vitest";

import {
  isWinterDate,
  soilBasisText,
  soilDaysToDryText,
  soilLegendStatuses,
  soilWaterStatusInfo,
  SOIL_WATER_DESC,
  SOIL_WATER_LABEL,
  SOIL_WATER_STATUSES,
} from "./soil-water";

describe("soilWaterStatusInfo (상태 이름·설명 7종)", () => {
  it("6개 상태 코드와 줄 없음(null)에 맞는 이름과 한 줄 설명을 돌려준다", () => {
    expect(SOIL_WATER_STATUSES).toEqual([
      "pool",
      "ample",
      "fair",
      "dry",
      "very_dry",
      "winter",
    ]);

    expect(soilWaterStatusInfo("pool")).toEqual({
      status: "pool",
      label: "물 고임",
      description:
        "비가 토양이 담을 수 있는 양을 넘었어요. 배수가 나쁜 밭은 물이 고일 수 있어요.",
    });
    expect(soilWaterStatusInfo("ample")).toEqual({
      status: "ample",
      label: "충분",
      description: "토양에 물이 넉넉해요.",
    });
    expect(soilWaterStatusInfo("fair")).toEqual({
      status: "fair",
      label: "보통",
      description: "물이 줄고 있지만 아직 부족하지 않아요.",
    });
    expect(soilWaterStatusInfo("dry")).toEqual({
      status: "dry",
      label: "건조",
      description: "토양이 말라 식물이 물을 쓰기 어려워지기 시작했어요.",
    });
    expect(soilWaterStatusInfo("very_dry")).toEqual({
      status: "very_dry",
      label: "매우 건조",
      description: "식물이 쓸 수 있는 물이 거의 남지 않았어요.",
    });
    expect(soilWaterStatusInfo("winter")).toEqual({
      status: "winter",
      label: "겨울철",
      description: "12~2월은 판정하지 않아요.",
    });
    expect(soilWaterStatusInfo(null)).toEqual({
      status: null,
      label: "자료 없음",
      description: "이 날짜의 기상 관측 자료가 없어요.",
    });

    for (const s of SOIL_WATER_STATUSES) {
      expect(SOIL_WATER_LABEL[s]).toBeTruthy();
      expect(SOIL_WATER_DESC[s]).toBeTruthy();
    }
  });
});

describe("soilDaysToDryText", () => {
  it("fair 이고 days_to_dry 가 있을 때만 건조 단계 안내 문구를 돌려준다", () => {
    expect(soilDaysToDryText("fair", 4)).toBe(
      "비가 오지 않으면 약 4일 뒤 건조 단계에 들어가요.",
    );
    expect(soilDaysToDryText("fair", null)).toBeNull();
    expect(soilDaysToDryText("ample", 4)).toBeNull();
    expect(soilDaysToDryText("dry", 2)).toBeNull();
    expect(soilDaysToDryText(null, 3)).toBeNull();
  });
});

describe("soilBasisText", () => {
  it("표준 토성은 기본 계산근거를, 추정 3종은 Saxton & Rawls 문구를 더한다", () => {
    const standard = soilBasisText(false);
    expect(standard).toContain("토양 깊이 50 cm");
    expect(standard).toContain("FAO-56 식(84)~(88)·Table 19.");
    expect(standard).not.toContain("Saxton & Rawls");

    const estimated = soilBasisText(true);
    expect(estimated).toContain("FAO-56 식(84)~(88)·Table 19.");
    expect(estimated).toContain(
      "Saxton & Rawls (2006) 식으로 추정한 값이에요.",
    );
  });
});

describe("isWinterDate · soilLegendStatuses", () => {
  it("12~2월만 겨울철로 판별하고, 범례는 평소 5단계·겨울이면 겨울철을 포함한다", () => {
    expect(isWinterDate("2026-01-15")).toBe(true);
    expect(isWinterDate("2026-02-28")).toBe(true);
    expect(isWinterDate("2026-12-01")).toBe(true);
    expect(isWinterDate("2026-03-01")).toBe(false);
    expect(isWinterDate("2026-10-28")).toBe(false);

    expect(soilLegendStatuses(false)).toEqual([
      "pool",
      "ample",
      "fair",
      "dry",
      "very_dry",
    ]);
    expect(soilLegendStatuses(true)).toEqual([
      "pool",
      "ample",
      "fair",
      "dry",
      "very_dry",
      "winter",
    ]);
  });
});
