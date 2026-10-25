import { heatChart } from "../temperature/heat-chart";

/**
 * 햇빛 화면 그래프 좌표 (시안 그대로). 값은 바꾸지 않고 좌표로만 옮긴다.
 * 적산일사 누적 그래프는 적산온도와 같은 모양이라 같은 좌표 함수를 쓴다 (1,000 단위, 올해·평년·오늘·월 눈금).
 */
export const sunChart = heatChart;

/** 월별 막대 높이(%): 모든 달의 올해·평년 중 가장 큰 값을 100 으로. */
export function monthBars(
  months: readonly { thisYear: number; normal: number }[],
) {
  const max = Math.max(0, ...months.flatMap((m) => [m.thisYear, m.normal]));
  return months.map((m) => ({
    thisYear: max > 0 ? (m.thisYear / max) * 100 : 0,
    normal: max > 0 ? (m.normal / max) * 100 : 0,
  }));
}

/** 지역 비교 막대: 85% 가 0, 110% 가 끝 (시안 눈금). 평년(100%) 세로선은 60% 자리. */
const FROM = 85;
const SPAN = 25;
export const SUN_NORMAL_LINE = ((100 - FROM) / SPAN) * 100;

export function sunCompareBar(pct: number | null): number {
  if (pct == null) return 0;
  return Math.max(3, Math.min(100, ((pct - FROM) / SPAN) * 100));
}
