/**
 * 예시 값. 시안(design/prototype) 기준일 2026년 8월 12일 종합 화면의 온도·햇빛 값을 옮겨 적었다.
 * 적산온도·적산일사는 아직 DB 에 없어(온1), 종합 화면은 이 값을 "예시" 표시와 함께 보여 준다 (결정 0011).
 * 물 판정은 DB 값을 쓴다 (src/services/station-status.ts).
 */
export type MockHome = {
  stationId: number;
  /** 평년보다 생육이 며칠 빠른가 (음수면 늦음). */
  leadDays: number;
  /** 적산온도 GDD (℃·일), 1월 1일부터. */
  gdd: { thisYear: number; normal: number };
  /** 적산일사 (MJ/m²). 일사를 재지 않는 지점은 null. */
  sunlight: {
    percentOfNormal: number;
    thisYear: number;
    normal: number;
  } | null;
};

export const MOCK_HOME: readonly MockHome[] = [
  {
    stationId: 101,
    leadDays: 3,
    gdd: { thisYear: 1972, normal: 1910 },
    sunlight: { percentOfNormal: 96, thisYear: 3218, normal: 3352 },
  },
  {
    stationId: 216,
    leadDays: -2,
    gdd: { thisYear: 1448, normal: 1482 },
    sunlight: null,
  },
  {
    stationId: 119,
    leadDays: 4,
    gdd: { thisYear: 2120, normal: 2035 },
    sunlight: { percentOfNormal: 98, thisYear: 3351, normal: 3419 },
  },
  {
    stationId: 131,
    leadDays: 5,
    gdd: { thisYear: 2213, normal: 2104 },
    sunlight: { percentOfNormal: 101, thisYear: 3487, normal: 3453 },
  },
  {
    stationId: 129,
    leadDays: 2,
    gdd: { thisYear: 1966, normal: 1925 },
    sunlight: { percentOfNormal: 97, thisYear: 3251, normal: 3352 },
  },
  {
    stationId: 146,
    leadDays: 4,
    gdd: { thisYear: 2245, normal: 2158 },
    sunlight: { percentOfNormal: 99, thisYear: 3385, normal: 3419 },
  },
  {
    stationId: 156,
    leadDays: 6,
    gdd: { thisYear: 2296, normal: 2168 },
    sunlight: { percentOfNormal: 103, thisYear: 3556, normal: 3453 },
  },
  {
    stationId: 136,
    leadDays: 5,
    gdd: { thisYear: 2140, normal: 2033 },
    sunlight: { percentOfNormal: 104, thisYear: 3660, normal: 3520 },
  },
  {
    stationId: 192,
    leadDays: 4,
    gdd: { thisYear: 2134, normal: 2052 },
    sunlight: { percentOfNormal: 100, thisYear: 3352, normal: 3352 },
  },
  {
    stationId: 189,
    leadDays: 7,
    gdd: { thisYear: 2745, normal: 2598 },
    sunlight: { percentOfNormal: 94, thisYear: 2993, normal: 3184 },
  },
];
