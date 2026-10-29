import type { SoilWaterStatus } from "@/domain/soil-water";
import type { WaterStatus } from "@/domain/water-status";

export type AnyWaterStatus = WaterStatus | SoilWaterStatus;

/**
 * 물 판정 상태별 토큰 이름. Tailwind 가 찾을 수 있게 이름을 통째로 적는다.
 * 점: '주의'(caution)만 속 빈 주황 테두리. 게이지·막대처럼 꽉 채우는 곳은 STATUS_FILL.
 */
export const STATUS_DOT: Record<AnyWaterStatus, string> = {
  need: "bg-need-dot",
  caution: "border-need-dot border-2 bg-transparent",
  normal: "bg-normal-dot",
  wet: "bg-wet-dot",
  dormant: "bg-dormant-dot",
  pool: "bg-wet-dot",
  ample: "bg-normal-dot",
  fair: "bg-ok-dot",
  dry: "bg-need-dot",
  very_dry: "bg-very-dry-dot",
  winter: "bg-dormant-dot",
};

/** 배지: '주의'는 투명 바탕 + 주황 글자 + 주황 테두리. 나머지는 옅은 바탕 + 진한 글자 (과습·물 고임은 꽉 채운 파랑 + 흰 글자). */
export const STATUS_BADGE: Record<AnyWaterStatus, string> = {
  need: "bg-need-bg text-need-fg",
  caution: "ring-need-dot bg-transparent text-need-fg ring-[1.5px] ring-inset",
  normal: "bg-normal-bg text-normal-fg",
  wet: "bg-wet-bg text-wet-fg",
  dormant: "bg-dormant-bg text-dormant-fg",
  pool: "bg-wet-bg text-wet-fg",
  ample: "bg-normal-bg text-normal-fg",
  fair: "bg-ok-bg text-ok-fg",
  dry: "bg-need-bg text-need-fg",
  very_dry: "bg-very-dry-bg text-very-dry-fg",
  winter: "bg-dormant-bg text-dormant-fg",
};

/** 물 판정 카드 바탕: 상태 색으로 아주 옅게. '주의'는 상태 색 없이 흰 카드 (주황 테두리 배지와 겹치지 않게). */
export const STATUS_CARD: Record<AnyWaterStatus, string> = {
  need: "bg-need-card",
  caution: "bg-card",
  normal: "bg-normal-card",
  wet: "bg-wet-card",
  dormant: "bg-dormant-card",
  pool: "bg-wet-card",
  ample: "bg-normal-card",
  fair: "bg-ok-card",
  dry: "bg-need-card",
  very_dry: "bg-very-dry-card",
  winter: "bg-dormant-card",
};

/** 게이지·막대 채움: 속을 비울 수 없는 곳. '주의'만 점과 달리 주황으로 꽉 채운다. */
export const STATUS_FILL: Record<AnyWaterStatus, string> = {
  ...STATUS_DOT,
  caution: "bg-need-dot",
};
