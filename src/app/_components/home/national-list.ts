/**
 * 휴대폰 전국 종합 목록(1b)의 화면 전용 값. 새 값을 계산하지 않고, 이미 있는 숫자를 막대 길이로만 옮긴다.
 * heat-chart.ts · sun-chart.ts 와 같은 방식.
 */

export const NATIONAL_TABS = ["water", "days", "heat", "sun"] as const;
export type NationalTab = (typeof NATIONAL_TABS)[number];
export const NATIONAL_TAB_DEFAULT: NationalTab = "water";

/** 고른 탭을 브라우저에 기억해 두는 이름. */
export const NATIONAL_TAB_KEY = "cropmon-national-tab";

/** 저장된 글자를 탭으로 읽는다. 잘못된 값은 기본 탭("물"). */
export function parseSavedTab(value: string | null): NationalTab {
  return NATIONAL_TABS.find((t) => t === value) ?? NATIONAL_TAB_DEFAULT;
}

const DAY_PCT = 2; // 하루당 막대 폭(%)
const MIN_PCT = 1.5;
const MAX_PCT = 50; // 가운데에서 한쪽 끝까지

/** 온도 막대: 가운데 0 기준, 빠름은 오른쪽·늦음은 왼쪽. 값이 없으면 null. */
export function heatBar(
  leadDays: number | null,
): { side: "left" | "right"; pct: number } | null {
  if (leadDays == null) return null;
  const pct = Math.min(
    MAX_PCT,
    Math.max(MIN_PCT, Math.abs(leadDays) * DAY_PCT),
  );
  return { side: leadDays < 0 ? "left" : "right", pct };
}

const SUN_FROM = 80;
const SUN_SPAN = 40;
/** 햇빛 막대 폭(%): 80% = 0, 120% = 꽉 참. 3~100% 로 자른다. */
export function sunBar(sunPct: number | null): number | null {
  if (sunPct == null) return null;
  return Math.min(100, Math.max(3, ((sunPct - SUN_FROM) / SUN_SPAN) * 100));
}
/** 가운데 선(평년 100%) 자리(%). */
export const SUN_BAR_NORMAL_LINE = ((100 - SUN_FROM) / SUN_SPAN) * 100;
