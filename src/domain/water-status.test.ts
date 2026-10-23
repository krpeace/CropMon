import { describe, expect, it } from "vitest";

import { todayBadge } from "./water-status";

describe("todayBadge", () => {
  it("오늘 상태를 그대로 보여 준다", () => {
    expect(todayBadge("need", "ok")).toEqual({
      status: "need",
      label: "관수 필요",
    });
    expect(todayBadge("wet", "enough")).toEqual({
      status: "wet",
      label: "과습 경고",
    });
  });

  it("오늘은 여유인데 내일 관수 필요면 '내일 관수 필요'로 보여 준다", () => {
    expect(todayBadge("ok", "need")).toEqual({
      status: "need",
      label: "내일 관수 필요",
    });
    expect(todayBadge("enough", "need")).toEqual({
      status: "need",
      label: "내일 관수 필요",
    });
  });

  it("짧게 쓰면 '내일 관수'", () => {
    expect(todayBadge("ok", "need", "short").label).toBe("내일 관수");
  });

  it("오늘 이미 관수 필요면 내일과 상관없이 '관수 필요'", () => {
    expect(todayBadge("need", "need").label).toBe("관수 필요");
  });
});
