import { describe, expect, it } from "vitest";

import { nearestStations } from "./nearby";

const SAMPLE = [
  { id: 268, name: "진도군", lat: 34.47296, lon: 126.25846 },
  { id: 175, name: "진도(첨찰산)", lat: 34.47219, lon: 126.32383 },
  { id: 261, name: "해남", lat: 34.55375, lon: 126.56907 },
  { id: 165, name: "목포", lat: 34.81732, lon: 126.38151 },
  { id: 170, name: "완도", lat: 34.3959, lon: 126.70182 },
  { id: 259, name: "강진군", lat: 34.64457, lon: 126.78407 },
  { id: 260, name: "장흥", lat: 34.68886, lon: 126.91951 },
];

describe("nearestStations", () => {
  it("진도군(268) 기준 가까운 순으로 정렬되고 자기 자신은 제외한다", () => {
    const result = nearestStations(SAMPLE[0], SAMPLE, 4);
    expect(result.map((r) => r.item.id)).toEqual([175, 261, 165, 170]);
    expect(Math.round(result[0].km)).toBe(6);
    expect(Math.round(result[1].km)).toBe(30);
    expect(Math.round(result[2].km)).toBe(40);
    expect(Math.round(result[3].km)).toBe(42);
  });

  it("후보가 n보다 적으면 있는 만큼만 돌려준다", () => {
    const result = nearestStations(SAMPLE[0], SAMPLE.slice(0, 3), 5);
    expect(result.map((r) => r.item.id)).toEqual([175, 261]);
  });

  it("후보가 자기 자신뿐이면 빈 배열을 돌려준다", () => {
    expect(nearestStations(SAMPLE[0], [SAMPLE[0]], 2)).toEqual([]);
  });
});
