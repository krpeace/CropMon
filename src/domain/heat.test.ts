import { describe, expect, it } from "vitest";

import {
  gddNumbers,
  heatDiff,
  heatVerdict,
  monthDay,
  pickStages,
  reachDate,
  stageLag,
} from "./heat";

describe("heatDiff", () => {
  it("평년 대비 차이: 부호·쉼표·℃", () => {
    expect(heatDiff(4165, 3985)).toEqual({ value: 180, text: "+180℃" });
    expect(heatDiff(1448, 1490)).toEqual({ value: -42, text: "-42℃" });
    expect(heatDiff(1000, 1000)).toEqual({ value: 0, text: "0℃" });
    expect(heatDiff(5234, 4000)).toEqual({ value: 1234, text: "+1,234℃" });
  });

  it("작은 차이도 숫자로 (묶지 않음)", () => {
    expect(heatDiff(1005, 1000)?.text).toBe("+5℃");
  });

  it("반올림한 뒤 뺀다 (179.5 → 180)", () => {
    expect(heatDiff(1179.5, 1000)).toEqual({ value: 180, text: "+180℃" });
    expect(heatDiff(1179.4, 1000)).toEqual({ value: 179, text: "+179℃" });
    expect(heatDiff(1000.4, 1000.4)?.text).toBe("0℃");
  });

  it("올해나 평년이 비면 null", () => {
    expect(heatDiff(null, 1000)).toBeNull();
    expect(heatDiff(1000, null)).toBeNull();
    expect(heatDiff(null, null)).toBeNull();
  });
});

describe("heatVerdict", () => {
  it("큰 글씨: 평년보다 +N℃ / -N℃ / 평년과 같아요", () => {
    expect(heatVerdict(4165, 3985)).toBe("평년보다 +180℃");
    expect(heatVerdict(1448, 1490)).toBe("평년보다 -42℃");
    expect(heatVerdict(1000, 1000)).toBe("평년과 같아요");
  });

  it("자료가 비면 '자료 없음'", () => {
    expect(heatVerdict(null, 1000)).toBe("자료 없음");
    expect(heatVerdict(1000, null)).toBe("자료 없음");
  });
});

describe("stageLag", () => {
  it("올해가 빠르면 'N일 빠름'", () => {
    expect(stageLag("2026-05-15", "2026-05-20")).toEqual({
      text: "5일 빠름",
      tone: "early",
    });
  });

  it("올해가 늦으면 'N일 지연'", () => {
    expect(stageLag("2026-07-21", "2026-07-15")).toEqual({
      text: "6일 지연",
      tone: "late",
    });
  });

  it("같은 날은 '평년과 같음'", () => {
    expect(stageLag("2026-07-15", "2026-07-15")).toEqual({
      text: "평년과 같음",
      tone: "same",
    });
  });

  it("달이 바뀌어도 날짜 차로 센다", () => {
    expect(stageLag("2026-06-28", "2026-07-03")?.text).toBe("5일 빠름");
  });

  it("올해나 평년이 비면 null", () => {
    expect(stageLag(null, "2026-07-15")).toBeNull();
    expect(stageLag("2026-07-15", null)).toBeNull();
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
