import { describe, expect, it } from "vitest";

import { leftText, monthlySummary, waterVerdict } from "./water-verdict";

const base = {
  crop: "apple" as const,
  past: false,
  seasonStart: "2026-04-01",
  seasonEnd: "2026-11-15",
  date: "2026-10-25",
};

describe("waterVerdict (시안 판정 문구)", () => {
  it("오늘 판정과 관수 필요까지 남은 날로 문구를 고른다", () => {
    const v = (
      status: Parameters<typeof waterVerdict>[0]["status"],
      needIn: number | null,
    ) => waterVerdict({ ...base, status, needIn });
    expect(v("wet", null)).toMatchObject({
      text: "물 주지 마세요, 땅이 너무 젖었어요",
      tone: "wet",
    });
    expect(v("need", 0)).toMatchObject({
      text: "오늘 물 주세요",
      tone: "need",
    });
    expect(v("caution", 1)).toMatchObject({
      text: "오늘은 괜찮아요, 내일 물 주세요",
      tone: "need",
      extra: "내일 관수 필요",
    });
    expect(v("caution", 2)).toMatchObject({
      text: "오늘은 괜찮아요, 모레 물 주세요",
      tone: "caution",
      extra: null,
    });
    expect(v("normal", 3)).toMatchObject({
      text: "오늘은 괜찮아요, 사흘 뒤 물 주세요",
      tone: "caution",
    });
    expect(v("normal", null)).toMatchObject({
      text: "흙이 촉촉해요, 물 주지 않아도 돼요",
      tone: "normal",
    });
    expect(v("caution", null)).toMatchObject({
      text: "아직 여유 있어요, 3일 동안 괜찮아요",
      tone: "caution",
    });
  });

  it("지난 날은 지난 말로", () => {
    const v = (
      status: Parameters<typeof waterVerdict>[0]["status"],
      needIn: number | null,
    ) => waterVerdict({ ...base, past: true, status, needIn });
    expect(v("need", 0).text).toBe("이날 물을 줘야 했어요");
    expect(v("caution", 1)).toMatchObject({
      text: "이날은 괜찮았어요, 다음날 물을 줘야 했어요",
      extra: "다음날 관수 필요",
    });
    expect(v("caution", 2).text).toBe(
      "이날은 괜찮았어요, 이틀 뒤 물을 줘야 했어요",
    );
    expect(v("normal", null).text).toBe(
      "흙이 촉촉했어요, 물 주지 않아도 됐어요",
    );
    expect(v("caution", null).text).toBe(
      "여유가 있었어요, 3일 동안 괜찮았어요",
    );
  });

  it("휴면기·작기 아님은 다음 작기 시작일을 알려 준다", () => {
    expect(
      waterVerdict({
        ...base,
        status: "dormant",
        needIn: null,
        date: "2026-03-10",
      }),
    ).toEqual({
      text: "지금은 휴면기예요",
      sub: "사과나무가 겨울잠을 자는 중이에요. 4월 1일부터 다시 물을 계산해요.",
      tone: "dormant",
      extra: null,
    });
    expect(
      waterVerdict({
        ...base,
        status: "dormant",
        needIn: null,
        date: "2026-11-20",
      }).sub,
    ).toBe(
      "사과나무가 겨울잠을 자는 중이에요. 내년 4월 1일부터 다시 물을 계산해요.",
    );
    expect(
      waterVerdict({
        ...base,
        crop: "cabbage",
        status: "dormant",
        needIn: null,
        seasonStart: "2026-06-01",
        seasonEnd: "2026-09-08",
        date: "2026-10-25",
      }),
    ).toMatchObject({
      text: "지금은 배추 작기가 아니에요",
      sub: "내년 6월 1일 정식부터 물을 계산해요.",
    });
    expect(
      waterVerdict({
        ...base,
        past: true,
        status: "dormant",
        needIn: null,
        date: "2026-03-10",
      }).text,
    ).toBe("이날은 휴면기였어요");
  });
});

describe("leftText", () => {
  it("관수 시작점까지 남은 양, 넘었으면 넘은 양", () => {
    expect(leftText(31, 35)).toBe("관수 시작점까지 4 mm 남았어요");
    expect(leftText(70.6, 65)).toBe("관수 시작점을 6 mm 넘었어요");
    expect(leftText(65.2, 65)).toBe("관수 시작점을 1 mm 넘었어요");
  });
});

describe("monthlySummary (표시용 합계)", () => {
  const row = (
    date: string,
    status: string,
    eto: number | null,
    etc: number | null,
    rain: number | null,
  ) => ({
    date,
    status: status as "need",
    etoMm: eto,
    etcMm: etc,
    rainMm: rain,
  });

  it("달마다 더하고, 작물이 쓴 물이 없는 달은 휴면기, 마지막 달은 '~며칠'", () => {
    const rows = [
      row("2026-03-30", "dormant", 2, null, 1),
      row("2026-03-31", "dormant", 2.4, null, 0),
      row("2026-04-01", "normal", 3, 1.5, 10.4),
      row("2026-04-30", "need", 3.6, 1.8, null),
      row("2026-05-12", "need", 4, 4, 0),
    ];
    expect(monthlySummary(rows)).toEqual([
      { month: "3월", eto: 4, etc: null, rain: 1, needDays: null },
      { month: "4월", eto: 7, etc: 3, rain: 10, needDays: 1 },
      { month: "5월 ~12일", eto: 4, etc: 4, rain: 0, needDays: 1 },
    ]);
  });
});
