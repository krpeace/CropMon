import type { WaterStatus } from "@/domain/water-status";

/** 물 판정 상태별 토큰 이름. Tailwind 가 찾을 수 있게 이름을 통째로 적는다. */
export const STATUS_DOT: Record<WaterStatus, string> = {
  need: "bg-need-dot",
  ok: "bg-ok-dot",
  enough: "bg-enough-dot",
  wet: "bg-wet-dot",
  dormant: "bg-dormant-dot",
};
