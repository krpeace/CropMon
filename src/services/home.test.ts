import { describe, expect, it } from "vitest";

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
const view = (
  stationId: number,
  crop: "apple" | "cabbage" = "apple",
  board = BOARD,
) => getHomeView({ stationId, crop }, board, NOW);

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

describe("온도·햇빛 카드는 예시 값", () => {
  it("숫자는 시안 예시, '예시' 표시", () => {
    const v = view(101);
    expect(v.growth).toEqual({
      verdict: "평년보다 생육 3일 빠름",
      numbers: "적산온도 1,972 / 평년 1,910 ℃·일",
      example: true,
    });
    expect(v.sunlight).toMatchObject({
      verdict: "올해 햇빛은 평년의 96%",
      missing: false,
      example: true,
    });
    expect(view(216).sunlight).toMatchObject({
      verdict: "자료 없음",
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
      lead: "3일 빠름",
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
    });
  });
});
