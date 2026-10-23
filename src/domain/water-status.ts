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
