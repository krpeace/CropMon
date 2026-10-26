import { describe, expect, it } from "vitest";

import { FARM_SAMPLES } from "../mocks/farm";
import { farmMatch, SOILS } from "./farm-preview";

describe("farmMatch", () => {
  it("홍천군 내촌면 -> 지점 101, 18.0 km", () => {
    expect(farmMatch("홍천군 내촌면")).toEqual({
      stationId: 101,
      km: "18.0",
    });
  });

  it("태백시 -> 지점 216, 19.4 km", () => {
    expect(farmMatch("태백시")).toEqual({
      stationId: 216,
      km: "19.4",
    });
  });

  it("제주 서귀포시 -> 지점 189, 4.4 km", () => {
    expect(farmMatch("제주 서귀포시")).toEqual({
      stationId: 189,
      km: "4.4",
    });
  });

  it("강원도 춘천시 동면 -> 지점 101, 9.3 km", () => {
    expect(farmMatch("강원도 춘천시 동면")).toEqual({
      stationId: 101,
      km: "9.3",
    });
  });

  it("표에 없는 주소는 null을 반환한다", () => {
    expect(farmMatch("서울시 종로구 세종대로")).toBeNull();
    expect(farmMatch("")).toBeNull();
    expect(farmMatch("   ")).toBeNull();
  });
});

describe("FARM_SAMPLES", () => {
  it("총 240개의 키를 포함한다 (지점 10 x 작물 2 x 흙 12)", () => {
    const keys = Object.keys(FARM_SAMPLES);
    expect(keys.length).toBe(240);
  });

  it("모든 항목에 필수 칸이 존재한다", () => {
    for (const [key, sample] of Object.entries(FARM_SAMPLES)) {
      expect(key).toMatch(/^\d+\|(apple|cabbage)\|\d+$/);
      expect(sample.tone).toBeDefined();
      expect(sample.badge).toBeDefined();
      expect(sample.badgeTone).toBeDefined();
      expect(sample.title).toBeDefined();
      expect("sub" in sample).toBe(true);
      expect("shortage" in sample).toBe(true);
      expect(typeof sample.start).toBe("number");
      expect(typeof sample.fill).toBe("number");
      expect(sample.gaugeTone).toBeDefined();
      expect(sample.head).toBeDefined();
      expect(sample.times).toBeDefined();
      expect(sample.total).toBeDefined();
      expect(sample.needDays).toBeDefined();
      expect(Array.isArray(sample.months)).toBe(true);
      expect(sample.months.length).toBe(5);
    }
  });

  it("기준 키 101|apple|3 값이 시안 계산 결과와 일치한다", () => {
    expect(FARM_SAMPLES["101|apple|3"]).toEqual({
      tone: "need",
      badge: "내일 관수 필요",
      badgeTone: "need",
      title: "오늘은 괜찮아요, 내일 물 주세요",
      sub: null,
      shortage: 31,
      start: 35,
      fill: 39.7,
      gaugeTone: "ok",
      head: "2026 사과 농사, 물 줄 때를 80% 맞췄어요",
      times: "16번",
      total: "192 mm",
      needDays: "50일 중 40일",
      months: [0, 72, 84, 0, 0],
    });
  });
});

describe("SOILS", () => {
  it("12종의 흙 정보(한국어, 영문, TAW)를 포함한다", () => {
    expect(SOILS.length).toBe(12);
    expect(SOILS[0]).toEqual({
      id: 0,
      ko: "사토",
      en: "Sand",
      taw: 60,
    });
    expect(SOILS[3]).toEqual({
      id: 3,
      ko: "양토",
      en: "Loam",
      taw: 130,
    });
  });
});
