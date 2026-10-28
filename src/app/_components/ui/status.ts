import type { SoilWaterStatus } from "@/domain/soil-water";
import type { WaterStatus } from "@/domain/water-status";

export type AnyWaterStatus = WaterStatus | SoilWaterStatus;

/** 물 판정 상태별 토큰 이름. Tailwind 가 찾을 수 있게 이름을 통째로 적는다. */
export const STATUS_DOT: Record<AnyWaterStatus, string> = {
  need: "bg-need-dot",
  caution: "bg-caution-dot",
  normal: "bg-normal-dot",
  wet: "bg-wet-dot",
  dormant: "bg-dormant-dot",
  pool: "bg-wet-dot",
  ample: "bg-normal-dot",
  fair: "bg-caution-dot",
  dry: "bg-need-dot",
  very_dry: "bg-very-dry-dot",
  winter: "bg-dormant-dot",
};

/** 배지: 옅은 바탕 + 진한 글자 (과습·물 고임은 꽉 채운 파랑 + 흰 글자). */
export const STATUS_BADGE: Record<AnyWaterStatus, string> = {
  need: "bg-need-bg text-need-fg",
  caution: "bg-caution-bg text-caution-fg",
  normal: "bg-normal-bg text-normal-fg",
  wet: "bg-wet-bg text-wet-fg",
  dormant: "bg-dormant-bg text-dormant-fg",
  pool: "bg-wet-bg text-wet-fg",
  ample: "bg-normal-bg text-normal-fg",
  fair: "bg-caution-bg text-caution-fg",
  dry: "bg-need-bg text-need-fg",
  very_dry: "bg-very-dry-bg text-very-dry-fg",
  winter: "bg-dormant-bg text-dormant-fg",
};

/** 물 판정 카드 바탕: 상태 색으로 아주 옅게. */
export const STATUS_CARD: Record<AnyWaterStatus, string> = {
  need: "bg-need-card",
  caution: "bg-caution-card",
  normal: "bg-normal-card",
  wet: "bg-wet-card",
  dormant: "bg-dormant-card",
  pool: "bg-wet-card",
  ample: "bg-normal-card",
  fair: "bg-caution-card",
  dry: "bg-need-card",
  very_dry: "bg-very-dry-card",
  winter: "bg-dormant-card",
};
