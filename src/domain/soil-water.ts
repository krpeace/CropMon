/**
 * 작물 공통(토양만 본 물 상태, DB soil_water_daily) 표시 규칙 (데이터 계약 v1.5, 결정 0020·0023).
 * 판정과 숫자(남은 물 %, 7일 합, 건조까지 남은 날)는 croplib-dp 가 계산해 DB 에 넣은 값을 그대로 쓰고,
 * 여기서는 상태 이름·설명·계산근거 문구만 붙인다.
 */
export const SOIL_WATER_STATUSES = [
  "pool",
  "ample",
  "fair",
  "dry",
  "very_dry",
  "winter",
] as const;
export type SoilWaterStatus = (typeof SOIL_WATER_STATUSES)[number];

export const SOIL_WATER_LABEL: Record<SoilWaterStatus, string> = {
  pool: "물 고임",
  ample: "충분",
  fair: "보통",
  dry: "건조",
  very_dry: "매우 건조",
  winter: "겨울철",
};

export const SOIL_WATER_DESC: Record<SoilWaterStatus, string> = {
  pool: "비가 토양이 담을 수 있는 양을 넘었어요. 배수가 나쁜 밭은 물이 고일 수 있어요.",
  ample: "토양에 물이 넉넉해요.",
  fair: "물이 줄고 있지만 아직 부족하지 않아요.",
  dry: "토양이 말라 식물이 물을 쓰기 어려워지기 시작했어요.",
  very_dry: "식물이 쓸 수 있는 물이 거의 남지 않았어요.",
  winter: "12~2월은 판정하지 않아요.",
};

export const SOIL_WATER_NO_DATA_DESC = "이 날짜의 기상 관측 자료가 없어요.";

export type SoilStatusInfo = {
  status: SoilWaterStatus | null;
  label: string;
  description: string;
};

export function isSoilWaterStatus(
  value: string | null | undefined,
): value is SoilWaterStatus {
  return SOIL_WATER_STATUSES.some((s) => s === value);
}

/** DB status 코드(6종) 또는 줄 없음(null)에 맞는 이름과 한 줄 설명을 돌려준다. */
export function soilWaterStatusInfo(
  status: SoilWaterStatus | null,
): SoilStatusInfo {
  if (!status) {
    return {
      status: null,
      label: "자료 없음",
      description: SOIL_WATER_NO_DATA_DESC,
    };
  }
  return {
    status,
    label: SOIL_WATER_LABEL[status],
    description: SOIL_WATER_DESC[status],
  };
}

/** fair(보통)이고 days_to_dry 가 있을 때만 건조 단계 예고 문구를 돌려준다. */
export function soilDaysToDryText(
  status: SoilWaterStatus | null,
  daysToDry: number | null,
): string | null {
  if (status !== "fair" || daysToDry == null) return null;
  return `비가 오지 않으면 약 ${daysToDry}일 뒤 건조 단계에 들어가요.`;
}

const BASE_BASIS =
  "토양 깊이 50 cm, 비가 없으면 하루 증발 수요(ETo)만큼 물이 빠진다고 가정했어요. 경사지 유출과 지하수는 반영하지 않았어요. 토양 속 남은 물 = (TAW − Dr) ÷ TAW × 100, FAO-56 식(84)~(88)·Table 19.";

const ESTIMATED_NOTE = "Saxton & Rawls (2006) 식으로 추정한 값이에요.";

/** 물 화면 작물 공통 계산근거 말풍선 문구. 추정 토성 3종이면 Saxton & Rawls 안내를 더한다. */
export function soilBasisText(isEstimated: boolean): string {
  return isEstimated ? `${BASE_BASIS} ${ESTIMATED_NOTE}` : BASE_BASIS;
}

/** 12~2월 날짜인지 판별한다 ("YYYY-MM-DD"). */
export function isWinterDate(isoDate: string): boolean {
  const month = Number(isoDate.slice(5, 7));
  return month === 12 || month === 1 || month === 2;
}

export const SOIL_LEGEND_BASE: readonly SoilWaterStatus[] = [
  "pool",
  "ample",
  "fair",
  "dry",
  "very_dry",
];

/** 작물 공통 범례 단계: 기본 5단계, 오늘이 겨울(12~2월)이면 겨울철을 더한다. */
export function soilLegendStatuses(
  isWinter: boolean,
): readonly SoilWaterStatus[] {
  return isWinter ? [...SOIL_LEGEND_BASE, "winter"] : SOIL_LEGEND_BASE;
}
