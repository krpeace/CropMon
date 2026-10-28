import { describe, expect, it } from "vitest";

import {
  CROP_DB_ID,
  firstMainDate,
  koreanDate,
  markOutlookDays,
  needDay,
  pickKcSet,
} from "./water-outlook";

describe("CROP_DB_ID", () => {
  it("주소창 작물 이름을 DB 작물 번호로 바꾼다", () => {
    expect(CROP_DB_ID).toEqual({
      common: "common",
      apple: "apple",
      cabbage: "kimchi_cabbage",
    });
  });
});

describe("koreanDate", () => {
  it("발표 시각(UTC)을 한국 날짜로 바꾼다", () => {
    expect(koreanDate("2026-10-24T17:00:00+00:00")).toBe("2026-10-25");
    expect(koreanDate("2026-10-25T08:00:00+00:00")).toBe("2026-10-25");
  });
});

describe("firstMainDate", () => {
  it("아침 회차는 그날, 저녁 회차는 다음 날부터 주 지표다", () => {
    expect(firstMainDate("2026-10-24T17:00:00+00:00", "아침")).toBe(
      "2026-10-25",
    );
    expect(firstMainDate("2026-10-25T08:00:00+00:00", "저녁")).toBe(
      "2026-10-26",
    );
    expect(firstMainDate("2026-10-31T08:00:00+00:00", "저녁")).toBe(
      "2026-11-01",
    );
  });
});

describe("needDay", () => {
  const base = { firstDate: "2026-10-25", today: "2026-10-25", horizon: 3 };

  it("0 은 지금 필요", () => {
    expect(needDay({ ...base, center: 0, early: 0, late: 0 })).toEqual({
      date: null,
      text: "지금 관수 필요",
      range: null,
    });
  });

  it("k번째 날을 날짜로 바꾸고 오늘·내일·모레로 부른다", () => {
    expect(needDay({ ...base, center: 1, early: 1, late: 1 }).text).toBe(
      "오늘(10/25 일)",
    );
    expect(needDay({ ...base, center: 2, early: 2, late: 2 })).toEqual({
      date: "2026-10-26",
      text: "내일(10/26 월)",
      range: null,
    });
    expect(needDay({ ...base, center: 3, early: 3, late: 3 }).text).toBe(
      "모레(10/27 화)",
    );
  });

  it("저녁 회차는 첫날이 내일이다", () => {
    expect(needDay({ ...base, firstDate: "2026-10-26", center: 3 }).text).toBe(
      "10/28(수)",
    );
  });

  it("기간 안에 없으면 그렇게 말한다", () => {
    expect(needDay({ ...base, center: null, early: null, late: null })).toEqual(
      { date: null, text: "3일 안에는 없음", range: null },
    );
  });

  it("빠르면·늦으면이 다르면 범위를 붙인다", () => {
    expect(needDay({ ...base, center: 2, early: 1, late: null }).range).toBe(
      "빠르면 오늘 · 늦으면 3일 안에는 없음",
    );
    expect(needDay({ ...base, center: 2, early: 0, late: 3 }).range).toBe(
      "빠르면 지금 · 늦으면 모레",
    );
  });
});

describe("markOutlookDays", () => {
  it("lead_day 순서로 앞 3일은 주 지표, 나머지는 참고로 표시한다", () => {
    const rows = [3, 1, 0, 2].map((lead) => ({ lead_day: lead }));
    expect(
      markOutlookDays(rows, 3).map((d) => [d.lead_day, d.reference]),
    ).toEqual([
      [0, false],
      [1, false],
      [2, false],
      [3, true],
    ]);
  });
});

describe("pickKcSet", () => {
  const sets = [
    { kc_set_id: "apple-k3", set_no: 3, is_default: true },
    { kc_set_id: "apple-k1", set_no: 1, is_default: false },
  ];

  it("주소창 번호가 있으면 그 재배 방식, 없거나 없는 번호면 기본값", () => {
    expect(pickKcSet(sets, 1)?.kc_set_id).toBe("apple-k1");
    expect(pickKcSet(sets, undefined)?.kc_set_id).toBe("apple-k3");
    expect(pickKcSet(sets, 9)?.kc_set_id).toBe("apple-k3");
    expect(pickKcSet([], 1)).toBeNull();
  });
});

describe("물 화면 주소창 (기준 날짜·발표 회차)", () => {
  it("날짜는 오늘보다 앞일 때만, 회차는 02·17만", async () => {
    const { parseWaterQuery } = await import("./water-outlook");
    const today = "2026-10-25";
    expect(parseWaterQuery({ d: "2026-10-20", run: "17" }, today)).toEqual({
      date: "2026-10-20",
      run: "17",
    });
    expect(parseWaterQuery({ d: "2026-10-25" }, today)).toEqual({
      date: null,
      run: null,
    });
    expect(parseWaterQuery({ d: "2026-10-26", run: "05" }, today)).toEqual({
      date: null,
      run: null,
    });
    expect(parseWaterQuery({ d: "2026-02-30" }, today)).toEqual({
      date: null,
      run: null,
    });
  });

  it("링크에 붙인다", async () => {
    const { withWaterQuery } = await import("./water-outlook");
    const s = { stationId: 101, crop: "apple" as const, kc: 1 };
    expect(withWaterQuery(s, { date: "2026-10-20" })).toBe(
      "/water?st=101&crop=apple&kc=1&d=2026-10-20",
    );
    expect(withWaterQuery(s, { run: "17" })).toBe(
      "/water?st=101&crop=apple&kc=1&run=17",
    );
    expect(withWaterQuery(s, {})).toBe("/water?st=101&crop=apple&kc=1");

    const commonSand = {
      stationId: 101,
      crop: "common" as const,
      soil: "sand" as const,
    };
    expect(withWaterQuery(commonSand, { date: "2026-10-20" })).toBe(
      "/water?st=101&crop=common&soil=sand&d=2026-10-20",
    );
    expect(
      withWaterQuery(
        { stationId: 101, crop: "common", soil: "loam" },
        { date: "2026-10-20" },
      ),
    ).toBe("/water?st=101&crop=common&d=2026-10-20");
  });

  it("날짜 표기", async () => {
    const { dayLabel, relDay } = await import("./water-outlook");
    expect(dayLabel("2026-10-25")).toBe("10월 25일 (일)");
    expect(relDay("2026-10-28", "2026-10-25")).toBe("글피");
    expect(relDay("2026-10-24", "2026-10-25")).toBe("어제");
    expect(relDay("2026-10-30", "2026-10-25")).toBeNull();
  });
});

describe("관측 기준 문구와 예상일 날 수", () => {
  it("observedBasis: 어제면 '어제까지', 아니면 날짜", async () => {
    const { observedBasis } = await import("./water-outlook");
    expect(observedBasis("2026-10-24", "2026-10-25")).toBe(
      "어제까지 관측 기준",
    );
    expect(observedBasis("2026-10-22", "2026-10-25")).toBe(
      "10월 22일까지 관측 기준",
    );
  });

  it("needInDays: 요약의 몇 번째 날 → 오늘부터 며칠", async () => {
    const { needInDays } = await import("./water-outlook");
    // 아침 회차: 첫날 = 오늘
    expect(needInDays(0, "2026-10-25", "2026-10-25")).toBe(0);
    expect(needInDays(1, "2026-10-25", "2026-10-25")).toBe(0);
    expect(needInDays(2, "2026-10-25", "2026-10-25")).toBe(1);
    // 저녁 회차: 첫날 = 내일
    expect(needInDays(1, "2026-10-26", "2026-10-25")).toBe(1);
    expect(needInDays(null, "2026-10-26", "2026-10-25")).toBeNull();
  });
});
