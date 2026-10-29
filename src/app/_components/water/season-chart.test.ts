import { describe, expect, it } from "vitest";

import {
  dayIndexAt,
  hoverInfo,
  seasonChart,
  tipSide,
  yDr,
  yE,
} from "./season-chart";

const day = (
  date: string,
  status: "dormant" | "caution",
  dr: number | null,
  rain = 0,
) => ({
  date,
  etoMm: 3,
  etcMm: status === "dormant" ? null : 2,
  rainMm: rain,
  drMm: dr,
  status,
});

describe("seasonChart", () => {
  const rows = [
    day("2026-03-31", "dormant", null, 30),
    day("2026-04-01", "caution", 0),
    day("2026-04-02", "caution", 65),
  ];
  const c = seasonChart(rows, 65, 130, "2026-04-02");

  it("하루 1칸, 휴면기는 회색 구역, 부족한 물은 휴면기에서 끊는다", () => {
    expect(c.n).toBe(3);
    expect(c.off).toBe("M0 0H1V100H0Z");
    expect(c.dr).toBe("M1.5 100.00L2.5 53.00");
    expect(c.etc.startsWith("M1.5")).toBe(true);
  });

  it("비 막대는 위에서 아래로, 60 mm 가 48%", () => {
    expect(c.rain).toBe("M0.1 0h0.8v24.00h-0.8z");
  });

  it("관수 시작점 선과 고른 날 표시, 월 눈금", () => {
    expect(c.rawLine).toBe("M0 53.00H3");
    expect(c.sel).toBe(`${(2.5 / 3) * 100}%`);
    expect(c.months.map((m) => m.label)).toEqual(["3월", "4월"]);
    expect(yE(7.5)).toBe(8);
    // 오늘처럼 작기 자료에 없는 날은 마지막 날에 표시
    expect(seasonChart(rows, 65, 130, "2026-04-03").sel).toBe(c.sel);
  });
});

describe("dayIndexAt", () => {
  // 상자 폭 352 = 안쪽 300 + 좌우 눈금 칸 26px 씩
  it("눈금 칸을 뺀 안쪽에서 날짜 칸 번호를 찾는다", () => {
    expect(dayIndexAt(26, 352, 300)).toBe(0);
    expect(dayIndexAt(325.9, 352, 300)).toBe(299);
    expect(dayIndexAt(176, 352, 300)).toBe(150);
  });

  it("밖이면 양 끝 칸에 붙인다", () => {
    expect(dayIndexAt(10, 352, 300)).toBe(0);
    expect(dayIndexAt(400, 352, 300)).toBe(299);
  });

  it("날이 없으면 null", () => {
    expect(dayIndexAt(100, 352, 0)).toBeNull();
  });
});

describe("tipSide", () => {
  it("그래프 가운데를 넘으면 왼쪽", () => {
    expect(tipSide(10, 100)).toBe("right");
    expect(tipSide(60, 100)).toBe("left");
  });
});

describe("yDr", () => {
  it("0 은 바닥(100), 다 찬 값은 6 — 선 모양은 그대로", () => {
    expect(yDr(0, 130)).toBe(100);
    expect(yDr(130, 130)).toBeCloseTo(6);
    expect(yDr(65, 130)).toBe(53);
  });
});

describe("hoverInfo", () => {
  const full = {
    date: "2026-10-12",
    etoMm: 2.14,
    etcMm: 1.86,
    rainMm: 12,
    drMm: 38.4,
    status: "caution" as const,
  };

  it("값이 모두 있으면 4줄, 부족한 물 줄에 관수 시작점이 붙는다", () => {
    const h = hoverInfo(full, "apple", 65);
    expect(h.date).toBe("10월 12일 (월)");
    expect(h.status).toBe("caution");
    expect(h.rows.map((r) => r.label)).toEqual([
      "기준 증발산",
      "작물이 쓴 물",
      "비",
      "부족한 물",
    ]);
    expect(h.rows[3].value).toBe("38 mm / 관수 시작점 65 mm");
  });

  it("ETo·ETc 는 소수 첫째 자리, 비·부족한 물은 정수", () => {
    const h = hoverInfo(full, "apple", 65);
    expect(h.rows[0].value).toBe("2.1 mm");
    expect(h.rows[1].value).toBe("1.9 mm");
    expect(h.rows[2].value).toBe("12 mm");
    expect(h.rows[3].value).toBe("38 mm / 관수 시작점 65 mm");
  });

  it("정수 값의 ETo 도 소수 한 자리를 붙인다", () => {
    const h = hoverInfo({ ...full, etoMm: 3 }, "apple", 65);
    expect(h.rows[0].value).toBe("3.0 mm");
  });

  it("값이 없으면 '자료 없음' (관수 시작점도 붙이지 않는다)", () => {
    const h = hoverInfo({ ...full, etoMm: null, drMm: null }, "apple", 65);
    expect(h.rows[0].value).toBe("자료 없음");
    expect(h.rows[3].value).toBe("자료 없음");
  });

  it("휴면기 날의 ETc 는 작물별 이름, 상태는 DB 값 그대로", () => {
    const d = { ...full, etcMm: null, drMm: null, status: "dormant" as const };
    const apple = hoverInfo(d, "apple", 65);
    expect(apple.status).toBe("dormant");
    expect(apple.rows[1].value).toBe("휴면기");
    expect(hoverInfo(d, "cabbage", 29).rows[1].value).toBe("작기 아님");
  });
});

describe("작물 공통 그래프", () => {
  const soil = (
    date: string,
    status: "winter" | "fair" | "dry" | "very_dry" | null,
    dr: number | null,
    awPct: number | null,
    rain = 0,
  ) => ({
    date,
    etoMm: 3.4,
    etcMm: null,
    rainMm: rain,
    drMm: dr,
    awPct,
    status,
  });
  const rows = [
    soil("2026-02-28", "winter", null, null),
    soil("2026-03-01", "fair", 0, 100),
    soil("2026-03-02", "dry", 38, 42),
    soil("2026-03-03", "very_dry", 52, 20, 30),
  ];
  const c = seasonChart(rows, 26, 65, "2026-03-03", true);
  const num = (pct: string) => Number.parseFloat(pct);

  it("ETc 선은 비어 있고, 겨울철은 휴면기처럼 회색 음영", () => {
    expect(c.etc).toBe("");
    expect(c.off).toBe("M0 0H1V100H0Z");
    expect(c.dr.startsWith("M1.5 100.00")).toBe(true);
  });

  it("건조 시작(60%)·매우 건조 시작(30%) 기준선은 RAW 와 0.7×TAW 자리", () => {
    expect(c.rawLine).toBe("M0 62.40H4");
    expect(c.veryDryLine).toBe("M0 34.20H4");
    expect(c.dryBand).toBe("M0 62.40H4V34.20H0Z");
    expect(c.veryDryBand).toBe("M0 34.20H4V6.00H0Z");
  });

  it("오른쪽 눈금은 남은 물 100·60·30·0 %, 왼쪽 눈금은 0·RAW·30% 지점·TAW mm", () => {
    expect(c.pctTicks.map((t) => t.t)).toEqual(["100%", "60%", "30%", "0%"]);
    expect(c.pctTicks.map((t) => num(t.top))).toEqual([
      100,
      expect.closeTo(62.4),
      expect.closeTo(34.2),
      expect.closeTo(6),
    ]);
    expect(c.drTicks.map((t) => t.t)).toEqual(["65", "46", "26", "0"]);
  });

  it("사과·배추는 오른쪽 % 눈금이 없고 눈금 모양도 그대로", () => {
    const apple = seasonChart(rows, 26, 65, "2026-03-03");
    expect(apple.drTicks.map((t) => t.t)).toEqual(["65", "26", "0"]);
    expect(apple.pctTicks).toEqual([]);
  });
});

describe("hoverInfo (작물 공통)", () => {
  const day = {
    date: "2026-03-02",
    etoMm: 3.42,
    etcMm: null,
    rainMm: 12,
    drMm: 38.4,
    awPct: 41.6,
    status: "dry" as const,
  };

  it("ETc 줄 없이 증발 수요·비·부족한 물·흙 속 남은 물 4줄", () => {
    const h = hoverInfo(day, "common", 26);
    expect(h.status).toBe("dry");
    expect(h.statusLabel).toBe("건조");
    expect(h.rows.map((r) => r.label)).toEqual([
      "증발 수요",
      "비",
      "부족한 물",
      "흙 속 남은 물",
    ]);
    expect(h.rows.map((r) => r.value)).toEqual([
      "3.4 mm",
      "12 mm",
      "38 mm / 건조 시작 26 mm",
      "42%",
    ]);
  });

  it("겨울철이면 값 대신 '겨울철', 줄이 없으면 '자료 없음'", () => {
    const winter = hoverInfo(
      { ...day, drMm: null, awPct: null, status: "winter" },
      "common",
      26,
    );
    expect(winter.statusLabel).toBe("겨울철");
    expect(winter.rows[2].value).toBe("겨울철");
    expect(winter.rows[3].value).toBe("겨울철");
    const none = hoverInfo(
      { ...day, etoMm: null, drMm: null, awPct: null, status: null },
      "common",
      26,
    );
    expect(none.statusLabel).toBe("자료 없음");
    expect(none.rows[0].value).toBe("자료 없음");
    expect(none.rows[2].value).toBe("자료 없음");
    expect(none.rows[3].value).toBe("자료 없음");
  });
});
