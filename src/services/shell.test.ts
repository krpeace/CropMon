import { describe, expect, it } from "vitest";

import {
  getHomeMeta,
  getPageMeta,
  getStation,
  listStationChips,
} from "./shell";

describe("listStationChips", () => {
  it("지점 10곳을 시안 순서대로 돌려준다", () => {
    const chips = listStationChips("apple");
    expect(chips.map((c) => c.name)).toEqual([
      "춘천",
      "태백",
      "수원",
      "청주",
      "서산",
      "전주",
      "광주",
      "안동",
      "진주",
      "서귀포",
    ]);
  });

  it("작물마다 오늘 물 판정을 붙인다", () => {
    const apple = listStationChips("apple");
    const cabbage = listStationChips("cabbage");
    expect(apple.find((c) => c.id === 131)?.status).toBe("need");
    expect(cabbage.find((c) => c.id === 131)?.status).toBe("caution");
  });
});

describe("getStation", () => {
  it("없는 지점 번호는 null 이다", () => {
    expect(getStation(999)).toBeNull();
  });
});

describe("getPageMeta", () => {
  const chuncheon = getStation(101)!;
  const taebaek = getStation(216)!;

  it("물 화면은 단기예보와 물수지를 자료로 적는다", () => {
    expect(getPageMeta("water", chuncheon)).toEqual({
      source: "기상청 ASOS 춘천(101) · 단기예보 · FAO-56 물수지",
      issue: "8월 12일 17시 단기예보",
      updated: "8월 12일 17:42",
      short: "17시 예보 · 17:42 갱신",
    });
  });

  it("햇빛을 재지 않는 지점은 햇빛 화면이 모두 '자료 없음'이다", () => {
    expect(getPageMeta("sunlight", taebaek)).toEqual({
      source: "기상청 ASOS 태백(216) 일사 관측 · 자료 없음",
      issue: "자료 없음",
      updated: "자료 없음",
      short: "자료 없음",
    });
  });

  it("햇빛을 재는 지점은 일사 관측 갱신 시각을 쓴다", () => {
    expect(getPageMeta("sunlight", chuncheon).short).toBe(
      "8월 12일 06:10 갱신",
    );
  });

  it("준비 중인 토양·도매시장은 '자료 없음'이다", () => {
    expect(getPageMeta("soil", chuncheon).short).toBe("자료 없음");
    expect(getPageMeta("market", chuncheon).updated).toBe("자료 없음");
  });

  it("내 농장은 고른 지역과 상관없이 밭 주소의 지점을 쓴다", () => {
    expect(getPageMeta("my-farm", taebaek)).toEqual({
      source: "기상청 ASOS 춘천(101) · 내 밭 기록(CSV)",
      issue: "8월 12일 17시 단기예보",
      updated: "8월 12일 17:42 (미리보기)",
      short: "8월 12일 17:42 갱신",
    });
  });
});

describe("getHomeMeta", () => {
  it("갱신 시각, 지점, 자료를 한 줄로 적는다", () => {
    expect(getHomeMeta(getStation(136)!)).toBe(
      "8월 12일 17:42 갱신 · 기상청 ASOS 안동(136) · 단기예보",
    );
  });
});
