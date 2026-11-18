import { describe, expect, it } from "vitest";

import {
  formatKoreanDateTime,
  koreanClock,
  koreanDate,
  koreanPeriod,
  monthDay,
  tenDayPeriod,
  weekdayKo,
} from "./datetime";

const N = " "; // 줄바꿈 금지 공백

describe("formatKoreanDateTime", () => {
  it("한국 시간으로 날짜와 시각을 보여 준다", () => {
    expect(formatKoreanDateTime("2026-10-22T06:05:00Z")).toBe(
      "2026년 10월 22일 오후 3:05",
    );
  });

  it("한국 날짜가 바뀌는 시각도 맞게 보여 준다", () => {
    expect(formatKoreanDateTime("2026-10-22T15:30:00Z")).toBe(
      "2026년 10월 23일 오전 12:30",
    );
  });

  it("값이 없거나 읽을 수 없으면 '자료 없음'", () => {
    expect(formatKoreanDateTime(null)).toBe("자료 없음");
    expect(formatKoreanDateTime("잘못된 값")).toBe("자료 없음");
  });
});

describe("koreanClock", () => {
  it("발표·갱신 표시에 쓰는 한국 시각 조각", () => {
    expect(koreanClock("2026-10-24T17:41:09+00:00")).toEqual({
      month: 10,
      day: 25,
      hour: "02",
      minute: "41",
    });
  });

  it("읽을 수 없으면 null", () => {
    expect(koreanClock("잘못된 값")).toBeNull();
  });
});

// ── 아래: 이슈 #153 공통 날짜 표시 (입력은 YYYY-MM-DD 문자열) ──

// heat.test.ts 에 있던 시험을 같은 단언 그대로 옮겨 왔다 (monthDay 가 heat.ts 에서 datetime.ts 로 이동)
describe("monthDay", () => {
  it("'4월 23일'", () => {
    expect(monthDay("2026-04-23")).toBe("4월 23일");
  });

  it("기본은 일반 공백(기존 출력 그대로), { tied: true } 는 줄바꿈 금지 공백", () => {
    expect(monthDay("2026-08-12")).toBe("8월 12일");
    expect(monthDay("2026-08-12", { tied: true })).toBe(`8월${N}12일`);
  });

  it("한 자리 월·일에 0을 붙이지 않는다", () => {
    expect(monthDay("2027-01-01")).toBe("1월 1일");
  });
});

describe("weekdayKo — 시간대 때문에 하루 밀리지 않는다", () => {
  it("2026-11-18 은 수요일, 2026-08-12 도 수요일", () => {
    expect(weekdayKo("2026-11-18")).toBe("수");
    expect(weekdayKo("2026-08-12")).toBe("수");
  });

  it("일주일 전부", () => {
    const days = [
      "2026-11-15",
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
    ];
    expect(days.map(weekdayKo)).toEqual([
      "일",
      "월",
      "화",
      "수",
      "목",
      "금",
      "토",
    ]);
  });

  it("윤일 2028-02-29 는 화요일, 해가 바뀌는 날", () => {
    expect(weekdayKo("2028-02-29")).toBe("화");
    expect(weekdayKo("2026-12-31")).toBe("목");
    expect(weekdayKo("2027-01-01")).toBe("금");
  });

  it("없는 날짜·형식이 틀린 값은 null", () => {
    for (const bad of [
      "2026-13-01",
      "2026-02-30",
      "2027-02-29",
      "2026-8-12",
      "",
      "abc",
      "2026-08-12T00:00:00Z",
    ]) {
      expect(weekdayKo(bad), bad).toBeNull();
    }
    expect(weekdayKo(null)).toBeNull();
    expect(weekdayKo(undefined)).toBeNull();
  });
});

describe("koreanDate — '2026년 8월 12일 (수)' (조각 사이 줄바꿈 금지 공백)", () => {
  it("기본: 연도 + 요일", () => {
    expect(koreanDate("2026-08-12")).toBe(`2026년${N}8월${N}12일${N}(수)`);
  });

  it("연도를 빼거나 요일을 뺄 수 있다", () => {
    expect(koreanDate("2026-08-12", { year: false })).toBe(
      `8월${N}12일${N}(수)`,
    );
    expect(koreanDate("2026-08-12", { weekday: false })).toBe(
      `2026년${N}8월${N}12일`,
    );
    expect(koreanDate("2026-08-12", { year: false, weekday: false })).toBe(
      `8월${N}12일`,
    );
  });

  it("해를 넘는 표기: 12월 31일 → 1월 1일", () => {
    expect(koreanDate("2026-12-31")).toBe(`2026년${N}12월${N}31일${N}(목)`);
    expect(koreanDate("2027-01-01")).toBe(`2027년${N}1월${N}1일${N}(금)`);
  });

  it("2월 28일 · 2028년 2월 29일", () => {
    expect(koreanDate("2027-02-28", { weekday: false })).toBe(
      `2027년${N}2월${N}28일`,
    );
    expect(koreanDate("2028-02-29")).toBe(`2028년${N}2월${N}29일${N}(화)`);
  });

  it("일반 공백이 하나도 남지 않는다", () => {
    expect(koreanDate("2026-08-12")).not.toMatch(/ /);
  });

  it("읽을 수 없으면 '자료 없음'", () => {
    expect(koreanDate("2026-02-30")).toBe("자료 없음");
    expect(koreanDate(null)).toBe("자료 없음");
    expect(koreanDate("잘못된 값")).toBe("자료 없음");
  });
});

describe("tenDayPeriod — 상순 1~10일, 중순 11~20일, 하순 21일~말일", () => {
  it("경계: 10일은 상순, 11일은 중순, 20일은 중순, 21일은 하순", () => {
    expect(tenDayPeriod("2027-06-01")).toBe("상순");
    expect(tenDayPeriod("2027-06-10")).toBe("상순");
    expect(tenDayPeriod("2027-06-11")).toBe("중순");
    expect(tenDayPeriod("2027-06-20")).toBe("중순");
    expect(tenDayPeriod("2027-06-21")).toBe("하순");
  });

  it("말일까지 하순: 30일 · 31일 · 2월 28일 · 2028년 2월 29일 · 12월 31일", () => {
    expect(tenDayPeriod("2027-04-30")).toBe("하순");
    expect(tenDayPeriod("2027-05-31")).toBe("하순");
    expect(tenDayPeriod("2027-02-28")).toBe("하순");
    expect(tenDayPeriod("2028-02-29")).toBe("하순");
    expect(tenDayPeriod("2026-12-31")).toBe("하순");
  });

  it("없는 날짜는 null", () => {
    expect(tenDayPeriod("2027-02-29")).toBeNull();
    expect(tenDayPeriod(null)).toBeNull();
  });
});

describe("koreanPeriod — '2027년 6월 하순'", () => {
  it("연도를 붙인다 (기본)", () => {
    expect(koreanPeriod("2027-06-25")).toBe(`2027년${N}6월${N}하순`);
  });

  it("연도를 뺀다 — 해를 넘는 작기 표기에서 호출하는 쪽이 고른다", () => {
    expect(koreanPeriod("2027-06-25", { year: false })).toBe(`6월${N}하순`);
  });

  it("해가 바뀌는 경계: 12월 31일은 12월 하순, 1월 1일은 1월 상순", () => {
    expect(koreanPeriod("2026-12-31")).toBe(`2026년${N}12월${N}하순`);
    expect(koreanPeriod("2027-01-01")).toBe(`2027년${N}1월${N}상순`);
  });

  it("일반 공백이 남지 않고, 읽을 수 없으면 '자료 없음'", () => {
    expect(koreanPeriod("2027-06-25")).not.toMatch(/ /);
    expect(koreanPeriod("2027-13-01")).toBe("자료 없음");
  });
});
