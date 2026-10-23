/** 물 판정 상태. 색은 tokens.css 의 --color-<상태>-* 를 쓴다. */
export const WATER_STATUSES = [
  "need",
  "ok",
  "enough",
  "wet",
  "dormant",
] as const;
export type WaterStatus = (typeof WATER_STATUSES)[number];

export const WATER_STATUS_LABEL: Record<WaterStatus, string> = {
  need: "관수 필요",
  ok: "아직 여유",
  enough: "토양 수분 충분",
  wet: "과습 경고",
  dormant: "휴면기",
};

export type StatusBadge = { status: WaterStatus; label: string };

/**
 * 오늘 배지. 오늘은 여유(아직 여유·토양 수분 충분)인데 내일 관수가 필요하면 미리 알려 준다.
 * 표처럼 좁은 곳은 "short"로 "내일 관수"라고 줄여 쓴다.
 */
export function todayBadge(
  today: WaterStatus,
  tomorrow: WaterStatus,
  size: "full" | "short" = "full",
): StatusBadge {
  if ((today === "ok" || today === "enough") && tomorrow === "need") {
    return {
      status: "need",
      label: size === "short" ? "내일 관수" : "내일 관수 필요",
    };
  }
  return { status: today, label: WATER_STATUS_LABEL[today] };
}
