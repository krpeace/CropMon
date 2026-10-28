import { describe, expect, it } from "vitest";

import type { HomeGrowth } from "./growth-latest";
import { getHomeView } from "./home";
import type { StationBoard, StationWater } from "./station-status";

/** 가짜 판정 표. 값은 지어낸 것이다. 오늘 = 2026-10-25. */
const base: Omit<StationWater, "status" | "drMm" | "forecast"> = {
  rawMm: 65,
  tawMm: 130,
  seasonStart: "2026-04-01",
  seasonEnd: "2026-11-15",
  observedDate: "2026-10-24",
};
const chuncheon: StationWater = {
  ...base,
  status: "caution",
  drMm: 52.4,
  forecast: {
    needIn: 1,
    days: [
      { date: "2026-10-26", status: "need" },
      { date: "2026-10-27", status: "need" },
      { date: "2026-10-28", status: "caution" },
    ],
  },
};
const andong: StationWater = {
  ...base,
  status: "caution",
  drMm: 40.2,
  forecast: null,
};
const blank = () =>
  Object.fromEntries(
    [101, 216, 119, 131, 129, 146, 156, 136, 192, 189].map((id) => [id, null]),
  );
const BOARD: StationBoard = {
  ok: true,
  water: {
    apple: { ...blank(), 101: chuncheon, 136: andong },
    cabbage: {
      ...blank(),
      101: {
        ...base,
        status: "dormant",
        drMm: null,
        forecast: null,
        seasonStart: "2026-06-01",
        seasonEnd: "2026-09-08",
      },
    },
  },
  updated: {
    ...blank(),
    101: { at: "2026-10-25T08:42:00+00:00", runHour: "17" },
    136: { at: "2026-10-24T17:20:00+00:00", runHour: null },
  },
};
const NOW = () => new Date("2026-10-25T18:00:00+09:00");
/** 가짜 적산온도·적산일사 (마지막 관측일). 수원(119)은 둘 다 없고, 진주(192)는 일사가 없다. */
const GROWTH: HomeGrowth = {
  heatOk: true,
  sunOk: true,
  heat: {
    101: { lead: 20, cum: 4165, normal: 3973, annualNormal: 4100 },
    216: { lead: null, cum: 2700, normal: 2650, annualNormal: 2600 },
    136: { lead: -2, cum: 2140, normal: 2190, annualNormal: 2300 },
  },
  sun: {
    101: { cum: 3218, normal: 3352 },
    216: { cum: 3500, normal: 3333 },
  },
};
const view = (
  stationId: number,
  crop: "apple" | "cabbage" = "apple",
  board = BOARD,
  growth = GROWTH,
) => getHomeView({ stationId, crop }, board, growth, NOW);

describe("종합 화면 물 카드 (DB)", () => {
  it("예보 지점: 판정 문구·배지·숫자·게이지, 첫 줄 갱신은 회차", () => {
    const v = view(101);
    expect(v.water).toEqual({
      verdict: "오늘은 괜찮아요, 내일 물 주세요",
      tone: "need",
      badge: { status: "need", label: "내일 관수 필요" },
      grayBadge: null,
      numbers: "부족한 물 52 mm / 관수 시작점 65 mm",
      gauge: { status: "caution", fillPct: (52.4 / 130) * 100, rawPct: 50 },
    });
    expect(v.meta).toBe(
      "10월 25일 17:42 갱신 · 기상청 ASOS 춘천(101) · 17시 단기예보",
    );
  });

  it("예보가 없는 지점: 앞날을 말하지 않고 '어제까지 관측 기준'", () => {
    const v = view(136);
    expect(v.water).toMatchObject({
      verdict: "아직 여유 있어요",
      badge: { status: "caution", label: "주의" },
      numbers: "부족한 물 40 mm / 관수 시작점 65 mm · 어제까지 관측 기준",
    });
    expect(v.meta).toBe(
      "10월 25일 02:20 갱신 · 기상청 ASOS 안동(136) · 어제까지 관측",
    );
  });

  it("휴면기·자료 없음", () => {
    expect(view(101, "cabbage").water).toMatchObject({
      verdict: "지금은 배추 작기가 아니에요",
      tone: "dormant",
      numbers: "내년 6월 1일 정식부터 물을 계산해요.",
      gauge: null,
    });
    expect(view(119).water).toMatchObject({
      verdict: "자료 없음",
      badge: null,
      grayBadge: "자료 없음",
      numbers: "이 지역의 물 판정 자료가 아직 없어요",
      gauge: null,
    });
    expect(view(119).meta).toBe("자료 없음 · 기상청 ASOS 수원(119)");
  });

  it("대표 밖 지점(홍천 212)을 고르면 물·온도 카드에 '자료 없음'과 한 줄 안내, 일사는 확인 안 됨", () => {
    const v = view(212);
    expect(v.meta).toBe("자료 없음 · 기상청 ASOS 홍천(212)");
    expect(v.water).toMatchObject({
      verdict: "자료 없음",
      badge: null,
      grayBadge: "자료 없음",
      numbers:
        "이 지점은 아직 물 계산을 하지 않아요. 가까운 대표 지점을 골라 보세요",
      gauge: null,
    });
    expect(v.growth).toEqual({
      verdict: "자료 없음",
      numbers:
        "이 지점은 아직 물 계산을 하지 않아요. 가까운 대표 지점을 골라 보세요",
      missing: true,
    });
    expect(v.sunlight).toEqual({
      verdict: "자료 없음",
      numbers: "홍천 관측소의 햇빛 자료가 없어요 (확인 안 됨)",
      missing: true,
    });
  });

  it("DB 를 읽지 못했으면 그 사실을 적는다", () => {
    const v = view(101, "apple", {
      ...BOARD,
      ok: false,
      water: { apple: blank(), cabbage: blank() },
    });
    expect(v.water.numbers).toBe(
      "DB에서 자료를 읽지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    );
  });
});

describe("온도·햇빛 카드 (DB)", () => {
  it("온도: 평년보다 며칠 빠른가와 적산온도 (온도 화면과 같은 문구)", () => {
    expect(view(101).growth).toEqual({
      verdict: "평년보다 생육 20일 빠름",
      numbers: "적산온도 4,165 / 평년 3,973 ℃·일",
      missing: false,
    });
    expect(view(136).growth.verdict).toBe("평년보다 생육 2일 늦음");
  });

  it("온도 태백형: 며칠 빠른가가 비었고 평년 한 해 치를 넘었으면", () => {
    expect(view(216).growth).toMatchObject({
      verdict: "평년 한 해 치를 넘었어요",
      missing: false,
    });
  });

  it("햇빛: 평년 대비 %와 적산일사", () => {
    expect(view(101).sunlight).toEqual({
      verdict: "올해 햇빛은 평년의 96%",
      numbers: "적산일사 3,218 / 평년 3,352 MJ/m²",
      missing: false,
    });
    // 태백도 DB 에 일사 자료가 있으면 보인다
    expect(view(216).sunlight.verdict).toBe("올해 햇빛은 평년의 105%");
  });

  it("자료가 없으면 회색 '자료 없음'과 이유", () => {
    expect(view(119).growth).toEqual({
      verdict: "자료 없음",
      numbers: "이 지역의 적산온도 자료가 아직 없어요",
      missing: true,
    });
    expect(view(192).sunlight).toEqual({
      verdict: "자료 없음",
      numbers: "진주 관측소의 햇빛 자료가 없어요",
      missing: true,
    });
  });

  it("DB 를 읽지 못했으면 그 사실을 적는다", () => {
    const v = view(101, "apple", BOARD, {
      heatOk: false,
      sunOk: false,
      heat: {},
      sun: {},
    });
    const failed = "DB에서 자료를 읽지 못했어요. 잠시 뒤 다시 확인해 주세요.";
    expect(v.growth).toEqual({
      verdict: "자료 없음",
      numbers: failed,
      missing: true,
    });
    expect(v.sunlight).toEqual({
      verdict: "자료 없음",
      numbers: failed,
      missing: true,
    });
  });
});

describe("전국 표", () => {
  const rows = view(136).rows;

  it("지점 10곳, 고른 지점 표시", () => {
    expect(rows).toHaveLength(10);
    expect(rows.filter((r) => r.selected).map((r) => r.name)).toEqual(["안동"]);
  });

  it("춘천 줄: 내일 관수, 52 / 65 mm, 앞으로 3일", () => {
    expect(rows[0]).toMatchObject({
      id: 101,
      badge: { status: "need", label: "내일 관수" },
      drText: "52 / 65 mm",
      days: [
        { label: "10/26", status: "need" },
        { label: "10/27", status: "need" },
        { label: "10/28", status: "caution" },
      ],
      lead: "20일 빠름",
      sunlight: "96%",
    });
  });

  it("예보 없는 줄은 앞으로 3일 null, 자료 없는 줄은 배지 null", () => {
    const andongRow = rows.find((r) => r.id === 136)!;
    expect(andongRow).toMatchObject({
      badge: { status: "caution", label: "주의" },
      drText: "40 / 65 mm",
      days: null,
    });
    expect(rows.find((r) => r.id === 119)).toMatchObject({
      badge: null,
      gauge: null,
      drText: "—",
      days: null,
      lead: null,
      sunlight: null,
    });
  });
});

describe("전국 표 생육 칸 (DB)", () => {
  const rows = view(136).rows;

  it("적산온도는 며칠 빠른가, 적산일사는 평년 대비 %", () => {
    expect(rows.find((r) => r.id === 136)).toMatchObject({
      lead: "2일 늦음",
      sunlight: null,
    });
    expect(rows.find((r) => r.id === 216)).toMatchObject({
      lead: "한 해 치 넘음",
      sunlight: "105%",
    });
  });
});
