import { describe, expect, it } from "vitest";

import {
  nextInRotation,
  parseSelection,
  rotationPosition,
  withSelection,
} from "./selection";

const IDS = [101, 216, 119] as const;

describe("parseSelection", () => {
  it("주소창에 값이 없으면 첫 지점과 사과를 고른다", () => {
    expect(parseSelection({}, IDS)).toEqual({ stationId: 101, crop: "apple" });
  });

  it("주소창의 지점 번호와 작물을 읽는다", () => {
    expect(parseSelection({ st: "216", crop: "cabbage" }, IDS)).toEqual({
      stationId: 216,
      crop: "cabbage",
    });
  });

  it("URLSearchParams 도 읽는다", () => {
    const params = new URLSearchParams("st=119&crop=cabbage");
    expect(parseSelection(params, IDS)).toEqual({
      stationId: 119,
      crop: "cabbage",
    });
  });

  it("없는 지점이나 작물은 기본값으로 돌린다", () => {
    expect(parseSelection({ st: "999", crop: "rice" }, IDS)).toEqual({
      stationId: 101,
      crop: "apple",
    });
    expect(parseSelection({ st: "춘천", crop: "" }, IDS)).toEqual({
      stationId: 101,
      crop: "apple",
    });
  });

  it("같은 이름이 여러 번 오면 첫 값을 쓴다", () => {
    expect(
      parseSelection({ st: ["216", "119"], crop: ["cabbage"] }, IDS),
    ).toEqual({ stationId: 216, crop: "cabbage" });
  });
});

describe("withSelection", () => {
  it("주소 뒤에 지점과 작물을 붙인다", () => {
    expect(withSelection("/water", { stationId: 136, crop: "cabbage" })).toBe(
      "/water?st=136&crop=cabbage",
    );
  });

  it("선택값이 아직 없으면 주소만 돌려준다", () => {
    expect(withSelection("/water", null)).toBe("/water");
  });
});

describe("자동 전환 순서", () => {
  it("사과로 지점을 차례로 돌고, 끝나면 배추로 넘어간다", () => {
    expect(nextInRotation({ stationId: 101, crop: "apple" }, IDS)).toEqual({
      stationId: 216,
      crop: "apple",
    });
    expect(nextInRotation({ stationId: 119, crop: "apple" }, IDS)).toEqual({
      stationId: 101,
      crop: "cabbage",
    });
  });

  it("배추 마지막 지점 다음은 사과 첫 지점이다", () => {
    expect(nextInRotation({ stationId: 119, crop: "cabbage" }, IDS)).toEqual({
      stationId: 101,
      crop: "apple",
    });
  });

  it("몇 번째인지 1부터 센다 (사과 먼저, 배추 나중)", () => {
    expect(rotationPosition({ stationId: 101, crop: "apple" }, IDS)).toBe(1);
    expect(rotationPosition({ stationId: 119, crop: "apple" }, IDS)).toBe(3);
    expect(rotationPosition({ stationId: 216, crop: "cabbage" }, IDS)).toBe(5);
  });
});
