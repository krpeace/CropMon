import { describe, expect, it } from "vitest";

import { getHomeView } from "./home";

describe("getHomeView — 시안과 같은 값", () => {
  it("춘천·사과: 물·온도·햇빛 카드", () => {
    const view = getHomeView({ stationId: 101, crop: "apple" });

    expect(view.water).toEqual({
      verdict: "오늘은 괜찮아요, 내일 물 주세요",
      tone: "need",
      badge: { status: "need", label: "내일 관수 필요" },
      numbers: "부족한 물 31 mm / 관수 시작점 35 mm",
      gauge: { status: "caution", fillPct: (31 / 78) * 100, rawPct: 45 },
    });
    expect(view.growth).toEqual({
      verdict: "평년보다 생육 3일 빠름",
      numbers: "적산온도 1,972 / 평년 1,910 ℃·일",
    });
    expect(view.sunlight).toEqual({
      verdict: "올해 햇빛은 평년의 96%",
      numbers: "적산일사 3,218 / 평년 3,352 MJ/m²",
      missing: false,
    });
  });

  it("안동·사과: 오늘 물 주세요", () => {
    const view = getHomeView({ stationId: 136, crop: "apple" });
    expect(view.water.verdict).toBe("오늘 물 주세요");
    expect(view.water.badge.label).toBe("관수 필요");
    expect(view.water.numbers).toBe("부족한 물 44 mm / 관수 시작점 35 mm");
    expect(view.growth.verdict).toBe("평년보다 생육 5일 빠름");
    expect(view.sunlight.numbers).toBe("적산일사 3,660 / 평년 3,520 MJ/m²");
  });

  it("태백: 햇빛을 재지 않아 '자료 없음', 생육은 늦음", () => {
    const view = getHomeView({ stationId: 216, crop: "apple" });
    expect(view.sunlight).toEqual({
      verdict: "자료 없음",
      numbers: "태백 관측소는 햇빛(일사)을 재지 않아요",
      missing: true,
    });
    expect(view.growth.verdict).toBe("평년보다 생육 2일 늦음");
  });

  it("게이지는 너무 짧아 안 보이지 않게 최소 2%", () => {
    const view = getHomeView({ stationId: 146, crop: "apple" });
    expect(view.water.gauge?.fillPct).toBe(2);
  });
});

describe("getHomeView — 전국 표", () => {
  const rows = getHomeView({ stationId: 136, crop: "apple" }).rows;

  it("지점 10곳, 고른 지점 표시", () => {
    expect(rows).toHaveLength(10);
    expect(rows.filter((r) => r.selected).map((r) => r.name)).toEqual(["안동"]);
  });

  it("춘천 줄: 내일 관수, 31 / 35 mm, 앞으로 3일, 3일 빠름, 96%", () => {
    expect(rows[0]).toMatchObject({
      id: 101,
      name: "춘천",
      badge: { status: "need", label: "내일 관수" },
      drText: "31 / 35 mm",
      days: [
        { label: "8/13", status: "need" },
        { label: "8/14", status: "caution" },
        { label: "8/15", status: "caution" },
      ],
      lead: "3일 빠름",
      sunlight: "96%",
    });
  });

  it("태백 줄: 2일 늦음, 햇빛 자료 없음", () => {
    expect(rows[1]).toMatchObject({
      badge: { status: "normal", label: "보통" },
      drText: "9 / 35 mm",
      lead: "2일 늦음",
      sunlight: null,
    });
  });

  it("배추를 고르면 배추 값으로 바뀐다", () => {
    const cabbage = getHomeView({ stationId: 101, crop: "cabbage" });
    expect(cabbage.rows[0].drText).toBe("23 / 23 mm");
    expect(cabbage.water.numbers).toBe("부족한 물 23 mm / 관수 시작점 23 mm");
  });
});
