/**
 * 토양수분 상태. DB(데이터 계약 v1)의 status 코드와 같다. 색은 tokens.css 의 --color-<상태>-* 를 쓴다.
 * 조건은 docs/DATA_CONTRACT.md "상태 판정" 참고. 판정은 croplib-dp 가 하고, 화면은 이름만 붙인다.
 */
export const WATER_STATUSES = [
  "need",
  "caution",
  "normal",
  "wet",
  "dormant",
] as const;
export type WaterStatus = (typeof WATER_STATUSES)[number];

export const WATER_STATUS_LABEL: Record<WaterStatus, string> = {
  need: "관수 필요",
  caution: "주의",
  normal: "보통",
  wet: "과습",
  dormant: "휴면기",
};

export type StatusBadge = { status: WaterStatus; label: string };

/**
 * 오늘 배지. 오늘은 관수가 필요 없는데(보통·주의) 내일 관수가 필요하면 미리 알려 준다.
 * 표처럼 좁은 곳은 "short"로 "내일 관수"라고 줄여 쓴다.
 */
export function todayBadge(
  today: WaterStatus,
  tomorrow: WaterStatus,
  size: "full" | "short" = "full",
): StatusBadge {
  if ((today === "caution" || today === "normal") && tomorrow === "need") {
    return {
      status: "need",
      label: size === "short" ? "내일 관수" : "내일 관수 필요",
    };
  }
  return { status: today, label: WATER_STATUS_LABEL[today] };
}
