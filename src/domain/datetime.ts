import { NBSP } from "./display";

// 오전/오후 표기는 기기(ICU)마다 "PM"처럼 다르게 나올 수 있어 직접 붙인다.
const KOREA_PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

/** ISO 시각을 한국 시간 "2026년 10월 22일 오후 3:05" 꼴로 보여 준다. */
export function formatKoreanDateTime(iso: string | null | undefined): string {
  if (!iso) return "자료 없음";
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return "자료 없음";

  const parts = Object.fromEntries(
    KOREA_PARTS.formatToParts(time).map((part) => [part.type, part.value]),
  );
  const hour = Number(parts.hour);
  const period = hour < 12 ? "오전" : "오후";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;

  return `${parts.year}년 ${parts.month}월 ${parts.day}일 ${period} ${hour12}:${parts.minute}`;
}

/** 시각 → 한국 시각 조각 (발표 "10월 25일 02시", 갱신 "02:41" 표시용). 읽을 수 없으면 null. */
export function koreanClock(iso: string | null | undefined) {
  if (!iso) return null;
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return null;
  const parts = Object.fromEntries(
    KOREA_PARTS.formatToParts(time).map((part) => [part.type, part.value]),
  );
  return {
    month: Number(parts.month),
    day: Number(parts.day),
    hour: parts.hour.padStart(2, "0"),
    minute: parts.minute,
  };
}

// ── 아래: 날짜(YYYY-MM-DD) 한국어 표기 (이슈 #153, 결정 0048). 시각 표기(위)는 그대로 ──

const NO_DATA = "자료 없음";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** "YYYY-MM-DD" 를 읽는다. 형식이 틀리거나 없는 날짜(2월 30일 등)면 null. */
function parseIsoDate(
  iso: string | null | undefined,
): { year: number; month: number; day: number } | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(year, month - 1, day));
  if (
    t.getUTCFullYear() !== year ||
    t.getUTCMonth() !== month - 1 ||
    t.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

/**
 * "2026-04-23" → "4월 23일". 기본은 일반 공백(기존 출력 그대로), `tied` 면 줄바꿈 금지 공백.
 * heat.ts · water-verdict.ts 에 따로 있던 것을 여기 한 곳으로 모았다.
 */
export function monthDay(iso: string, opts: { tied?: boolean } = {}): string {
  const [, m, d] = iso.split("-").map(Number);
  return opts.tied ? `${m}월${NBSP}${d}일` : `${m}월 ${d}일`;
}

/** 요일("일"~"토"). 입력은 "YYYY-MM-DD" — 날짜만 보므로 시간대 때문에 하루 밀리지 않는다. 읽을 수 없으면 null. */
export function weekdayKo(iso: string | null | undefined): string | null {
  const p = parseIsoDate(iso);
  if (!p) return null;
  return WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];
}

/**
 * "2026년 8월 12일 (수)" (조각 사이는 줄바꿈 금지 공백).
 * `year: false` 면 연도를 빼고, `weekday: false` 면 요일을 뺀다. 해를 넘는 작기 표기는 호출하는 쪽이 고른다.
 * 읽을 수 없으면 "자료 없음".
 */
export function koreanDate(
  iso: string | null | undefined,
  opts: { year?: boolean; weekday?: boolean } = {},
): string {
  const p = parseIsoDate(iso);
  if (!p) return NO_DATA;
  const { year = true, weekday = true } = opts;
  const parts: string[] = [];
  if (year) parts.push(`${p.year}년`);
  parts.push(`${p.month}월`, `${p.day}일`);
  if (weekday) parts.push(`(${weekdayKo(iso)})`);
  return parts.join(NBSP);
}

/** 상순(1~10일) · 중순(11~20일) · 하순(21일~말일). 읽을 수 없으면 null. */
export function tenDayPeriod(
  iso: string | null | undefined,
): "상순" | "중순" | "하순" | null {
  const p = parseIsoDate(iso);
  if (!p) return null;
  if (p.day <= 10) return "상순";
  if (p.day <= 20) return "중순";
  return "하순";
}

/** "2027년 6월 하순". `year: false` 면 "6월 하순". 읽을 수 없으면 "자료 없음". */
export function koreanPeriod(
  iso: string | null | undefined,
  opts: { year?: boolean } = {},
): string {
  const p = parseIsoDate(iso);
  if (!p) return NO_DATA;
  const { year = true } = opts;
  const parts = year ? [`${p.year}년`] : [];
  parts.push(`${p.month}월`, tenDayPeriod(iso)!);
  return parts.join(NBSP);
}
