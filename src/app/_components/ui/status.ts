import type { WaterStatus } from "@/domain/water-status";

/** 물 판정 상태별 토큰 이름. Tailwind 가 찾을 수 있게 이름을 통째로 적는다. */
export const STATUS_DOT: Record<WaterStatus, string> = {
  need: "bg-need-dot",
  ok: "bg-ok-dot",
  enough: "bg-enough-dot",
  wet: "bg-wet-dot",
  dormant: "bg-dormant-dot",
};

/** 배지: 옅은 바탕 + 진한 글자 (과습은 꽉 채운 파랑 + 흰 글자). */
export const STATUS_BADGE: Record<WaterStatus, string> = {
  need: "bg-need-bg text-need-fg",
  ok: "bg-ok-bg text-ok-fg",
  enough: "bg-enough-bg text-enough-fg",
  wet: "bg-wet-bg text-wet-fg",
  dormant: "bg-dormant-bg text-dormant-fg",
};

/** 물 판정 카드 바탕: 상태 색으로 아주 옅게. */
export const STATUS_CARD: Record<WaterStatus, string> = {
  need: "bg-need-card",
  ok: "bg-ok-card",
  enough: "bg-enough-card",
  wet: "bg-wet-card",
  dormant: "bg-dormant-card",
};
