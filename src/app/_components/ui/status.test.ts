import { describe, expect, it } from "vitest";

import { STATUS_BADGE, STATUS_CARD, STATUS_DOT, STATUS_FILL } from "./status";

describe("'주의' 주황 테두리", () => {
  it("배지는 투명 바탕 + 주황 글자 + 주황 테두리", () => {
    expect(STATUS_BADGE.caution).toContain("bg-transparent");
    expect(STATUS_BADGE.caution).toContain("text-need-fg");
    expect(STATUS_BADGE.caution).toContain("ring-need-dot");
  });

  it("점은 속 빈 주황 테두리, 카드는 흰 카드", () => {
    expect(STATUS_DOT.caution).toContain("border-need-dot");
    expect(STATUS_DOT.caution).toContain("bg-transparent");
    expect(STATUS_CARD.caution).toBe("bg-card");
  });

  it("게이지·막대 채움은 주황 꽉 채움", () => {
    expect(STATUS_FILL.caution).toBe("bg-need-dot");
  });
});

describe("다른 상태는 그대로", () => {
  it("관수 필요·보통·과습·휴면기", () => {
    expect(STATUS_BADGE.need).toBe("bg-need-bg text-need-fg");
    expect(STATUS_BADGE.normal).toBe("bg-normal-bg text-normal-fg");
    expect(STATUS_BADGE.wet).toBe("bg-wet-bg text-wet-fg");
    expect(STATUS_BADGE.dormant).toBe("bg-dormant-bg text-dormant-fg");
    expect(STATUS_DOT.need).toBe("bg-need-dot");
    expect(STATUS_CARD.wet).toBe("bg-wet-card");
  });

  it("작물 공통 보통(fair)은 초록(ok-*)을 쓴다", () => {
    expect(STATUS_DOT.fair).toBe("bg-ok-dot");
    expect(STATUS_BADGE.fair).toBe("bg-ok-bg text-ok-fg");
    expect(STATUS_CARD.fair).toBe("bg-ok-card");
    expect(STATUS_FILL.fair).toBe("bg-ok-dot");
  });

  it("채움은 '주의' 말고는 점과 같다", () => {
    for (const st of Object.keys(STATUS_DOT) as (keyof typeof STATUS_DOT)[]) {
      if (st !== "caution") expect(STATUS_FILL[st]).toBe(STATUS_DOT[st]);
    }
  });
});
