import { describe, expect, it } from "vitest";

import {
  gddNumbers,
  leadShort,
  leadVerdict,
  monthDay,
  pickStages,
  reachDate,
} from "./heat";

describe("leadVerdict", () => {
  it("빠름·늦음·비슷 (DB 의 lead_days 그대로)", () => {
    expect(leadVerdict(20, 4165, 4300)).toBe("평년보다 생육 20일 빠름");
    expect(leadVerdict(-2, 1448, 2600)).toBe("평년보다 생육 2일 늦음");
    expect(leadVerdict(0, 1000, 2600)).toBe("생육이 평년과 비슷해요");
  });

  it("lead_days 가 비었고 올해 누적이 평년 한 해 합보다 크면 '평년 한 해 치를 넘었어요'", () => {
    expect(leadVerdict(null, 2700, 2600)).toBe("평년 한 해 치를 넘었어요");
  });

  it("lead_days 가 비었고 그 밖이면 '자료 없음'", () => {
    expect(leadVerdict(null, 2500, 2600)).toBe("자료 없음");
    expect(leadVerdict(null, null, 2600)).toBe("자료 없음");
    expect(leadVerdict(null, 2700, null)).toBe("자료 없음");
  });
});

describe("leadShort", () => {
  it("지역 비교 막대 옆 짧은 글", () => {
    expect(leadShort(5)).toBe("+5일");
    expect(leadShort(-2)).toBe("-2일");
    expect(leadShort(0)).toBe("0일");
    expect(leadShort(null)).toBeNull();
  });
});

describe("gddNumbers", () => {
  it("천 단위 쉼표와 차이(+/-)", () => {
    expect(gddNumbers(4165.4, 3973.2)).toEqual({
      thisYear: "4,165",
      normal: "3,973",
      diff: "+192",
    });
    expect(gddNumbers(1448, 1482)).toEqual({
      thisYear: "1,448",
      normal: "1,482",
      diff: "-34",
    });
    expect(gddNumbers(1000, 1000).diff).toBe("0");
  });
});

describe("reachDate", () => {
  const rows = [
    { date: "2026-04-21", v: 980 },
    { date: "2026-04-22", v: null },
    { date: "2026-04-23", v: 1000 },
    { date: "2026-04-24", v: 1012 },
  ];

  it("처음 그 값 이상인 날", () => {
    expect(reachDate(rows, (r) => r.v, 1000)).toBe("2026-04-23");
    expect(reachDate(rows, (r) => r.v, 990)).toBe("2026-04-23");
  });

  it("아직 닿지 않았으면 null", () => {
    expect(reachDate(rows, (r) => r.v, 1500)).toBeNull();
  });
});

describe("pickStages", () => {
  const S = [500, 1000, 1500, 2000];

  it("올해가 막 지난 단계와 다음 단계", () => {
    expect(pickStages(S, 1200)).toEqual([1000, 1500]);
    expect(pickStages(S, 1000)).toEqual([1000, 1500]);
  });

  it("아직 첫 단계 전이면 처음 두 단계", () => {
    expect(pickStages(S, 300)).toEqual([500, 1000]);
    expect(pickStages(S, null)).toEqual([500, 1000]);
  });

  it("마지막 단계를 넘었으면 마지막 두 단계", () => {
    expect(pickStages(S, 2400)).toEqual([1500, 2000]);
  });

  it("순서가 섞여 와도 작은 것부터 본다, 단계가 없으면 빈 목록", () => {
    expect(pickStages([1500, 500, 1000], 700)).toEqual([500, 1000]);
    expect(pickStages([], 700)).toEqual([]);
    expect(pickStages([500], 700)).toEqual([500]);
  });
});

describe("monthDay", () => {
  it("'4월 23일'", () => {
    expect(monthDay("2026-04-23")).toBe("4월 23일");
  });
});
