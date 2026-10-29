import { describe, expect, it } from "vitest";

import {
  todayBadge,
  WATER_STATUS_LABEL,
  WATER_STATUS_SHORT,
} from "./water-status";

describe("WATER_STATUS_SHORT", () => {
  it("3일 캡슐용 두 글자 이름", () => {
    expect(WATER_STATUS_SHORT).toEqual({
      need: "관수",
      caution: "주의",
      normal: "보통",
      wet: "과습",
      dormant: "휴면",
    });
  });
});

describe("WATER_STATUS_LABEL", () => {
  it("데이터 계약 v1 의 토양수분 상태 이름을 쓴다", () => {
    expect(WATER_STATUS_LABEL).toEqual({
      need: "관수 필요",
      caution: "주의",
      normal: "보통",
      wet: "과습",
      dormant: "휴면기",
    });
  });
});

describe("todayBadge", () => {
  it("오늘 상태를 그대로 보여 준다", () => {
    expect(todayBadge("need", "caution")).toEqual({
      status: "need",
      label: "관수 필요",
    });
    expect(todayBadge("wet", "normal")).toEqual({
      status: "wet",
      label: "과습",
    });
  });

  it("오늘은 보통·주의인데 내일 관수 필요면 '내일 관수 필요'로 보여 준다", () => {
    expect(todayBadge("caution", "need")).toEqual({
      status: "need",
      label: "내일 관수 필요",
    });
    expect(todayBadge("normal", "need")).toEqual({
      status: "need",
      label: "내일 관수 필요",
    });
  });

  it("짧게 쓰면 '내일 관수'", () => {
    expect(todayBadge("caution", "need", "short").label).toBe("내일 관수");
  });

  it("오늘 이미 관수 필요면 내일과 상관없이 '관수 필요'", () => {
    expect(todayBadge("need", "need").label).toBe("관수 필요");
  });
});
