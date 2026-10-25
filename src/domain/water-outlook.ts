import type { Crop } from "./selection";

/**
 * 물 화면의 3일 전망 표시 규칙. 계산은 croplib-dp 가 하고, 여기서는 DB 값에 이름과 날짜만 붙인다.
 * 기준은 docs/DATA_CONTRACT.md 의 water_outlook, water_outlook_summary.
 */

/** 주소창 작물 이름 → DB 작물 번호(crops.crop_id). */
export const CROP_DB_ID: Record<Crop, string> = {
  apple: "apple",
  cabbage: "kimchi_cabbage",
};

const DAY = 86_400_000;
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026-10-25" + n일 */
export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY)
    .toISOString()
    .slice(0, 10);
}

/** 시각(시간대 포함) → 한국 날짜 "2026-10-25" */
export function koreanDate(timestamp: string): string {
  return new Date(Date.parse(timestamp) + 9 * 3_600_000)
    .toISOString()
    .slice(0, 10);
}

/** 주 지표 첫날: 아침 회차는 그날(D+0), 저녁 회차는 다음 날(D+1). */
export function firstMainDate(runAt: string, runName: string): string {
  const day = koreanDate(runAt);
  return runName === "저녁" ? addDays(day, 1) : day;
}

/** "2026-10-26" → "10/26 월" */
function shortDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${WEEKDAY[d.getUTCDay()]}`;
}

/** 날짜를 오늘·내일·모레로 부르고, 그 밖은 날짜만. */
function dayName(iso: string, today: string): string {
  const name = ["오늘", "내일", "모레"][
    (Date.parse(iso) - Date.parse(today)) / DAY
  ];
  const [md, wd] = shortDay(iso).split(" ");
  return name ? `${name}(${md} ${wd})` : `${md}(${wd})`;
}

export type NeedDay = {
  /** 예상 날짜. 지금 필요하거나 기간 안에 없으면 null. */
  date: string | null;
  text: string;
  /** 빠르면·늦으면이 중심과 다를 때만. */
  range: string | null;
};

type NeedInput = {
  center: number | null;
  early?: number | null;
  late?: number | null;
  firstDate: string;
  today: string;
  horizon: number;
};

function oneNeed(k: number | null, i: NeedInput, short: boolean) {
  if (k === 0) return { date: null, text: short ? "지금" : "지금 관수 필요" };
  if (k == null) return { date: null, text: `${i.horizon}일 안에는 없음` };
  const date = addDays(i.firstDate, k - 1);
  const text = dayName(date, i.today);
  return { date, text: short ? text.replace(/\(.*\)$/, "") : text };
}

/** 관수 필요 예상일(몇 번째 날) → 날짜와 문구. */
export function needDay(i: NeedInput): NeedDay {
  const { date, text } = oneNeed(i.center, i, false);
  const early = i.early === undefined ? i.center : i.early;
  const late = i.late === undefined ? i.center : i.late;
  const range =
    early === i.center && late === i.center
      ? null
      : `빠르면 ${oneNeed(early, i, true).text} · 늦으면 ${oneNeed(late, i, true).text}`;
  return { date, text, range };
}

/** 전망 날들을 lead_day 순서로 놓고, 앞 horizon 일은 주 지표, 나머지는 참고로 표시한다. */
export function markOutlookDays<T extends { lead_day: number }>(
  rows: readonly T[],
  horizon: number,
): (T & { reference: boolean })[] {
  return [...rows]
    .sort((a, b) => a.lead_day - b.lead_day)
    .map((r, i) => ({ ...r, reference: i >= horizon }));
}

/** 주소창 재배 방식 번호 → 재배 방식. 없거나 모르는 번호면 기본 재배 방식. */
export function pickKcSet<T extends { set_no: number; is_default: boolean }>(
  sets: readonly T[],
  kc: number | undefined,
): T | null {
  return (
    sets.find((s) => s.set_no === kc) ??
    sets.find((s) => s.is_default) ??
    sets[0] ??
    null
  );
}
