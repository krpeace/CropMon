/**
 * 적산온도의 표시 규칙 (결정 0013·0015·0032). 종합·온도 화면이 함께 쓴다.
 * 적산온도·평년은 DB 값 그대로 쓰고, 여기서는 보여 주기 위해 올해와 평년의 차이(℃)·도달일 차(일)를 빼고
 * 문구로 바꾸며, 표에서 처음 넘는 날을 찾는다. 적산온도 자체를 계산하지는 않는다.
 */

const nf = (v: number) => Math.round(v).toLocaleString("ko-KR");

/**
 * 평년 대비 적산온도 차이 = 반올림한 올해 누적 − 반올림한 평년 누적 (같은 날).
 * "+1,234℃" · "-42℃" · "0℃". 올해나 평년이 비면 null (결정 0032).
 */
export function heatDiff(
  cum: number | null,
  normal: number | null,
): { value: number; text: string } | null {
  if (cum == null || normal == null) return null;
  const value = Math.round(cum) - Math.round(normal);
  return { value, text: value > 0 ? `+${nf(value)}℃` : `${nf(value)}℃` };
}

/** 생육 속도 큰 글씨: "평년보다 +180℃" · "평년보다 -42℃" · "평년과 같아요". 비면 "자료 없음". */
export function heatVerdict(cum: number | null, normal: number | null): string {
  const diff = heatDiff(cum, normal);
  if (!diff) return "자료 없음";
  return diff.value === 0 ? "평년과 같아요" : `평년보다 ${diff.text}`;
}

export type StageLag = { text: string; tone: "early" | "late" | "same" };

/**
 * 단계 도달일 비교 꼬리표: 평년 도달일 − 올해 도달일 (같은 해 날짜 차).
 * 기호 대신 글자를 쓴다: 위 "+℃"는 앞섬인데 날짜 차는 빠를수록 작아져 부호 뜻이 거꾸로 되기 때문.
 */
export function stageLag(
  thisYear: string | null,
  normal: string | null,
): StageLag | null {
  if (!thisYear || !normal) return null;
  const days = Math.round(
    (Date.parse(normal) - Date.parse(thisYear)) / 86_400_000,
  );
  if (days > 0) return { text: `${days}일 빠름`, tone: "early" };
  if (days < 0) return { text: `${-days}일 지연`, tone: "late" };
  return { text: "평년과 같음", tone: "same" };
}

/** 숫자 줄: 올해 · 평년 · 차이 (천 단위 쉼표). */
export function gddNumbers(cum: number, normal: number) {
  const diff = Math.round(cum) - Math.round(normal);
  return {
    thisYear: nf(cum),
    normal: nf(normal),
    diff: diff > 0 ? `+${nf(diff)}` : nf(diff),
  };
}

/** 값이 처음 threshold 이상이 되는 날. 아직이면 null. rows 는 날짜 순. */
export function reachDate<T extends { date: string }>(
  rows: readonly T[],
  value: (row: T) => number | null,
  threshold: number,
): string | null {
  for (const row of rows) {
    const v = value(row);
    if (v != null && v >= threshold) return row.date;
  }
  return null;
}

/** 단계 카드 두 개: 올해가 막 지난 단계와 다음 단계. 첫 단계 전이면 처음 둘, 다 지났으면 마지막 둘. */
export function pickStages(
  stages: readonly number[],
  cum: number | null,
): number[] {
  const s = [...stages].sort((a, b) => a - b);
  if (s.length <= 2) return s;
  const passed = cum == null ? -1 : s.filter((v) => v <= cum).length - 1;
  const i = Math.min(Math.max(passed, 0), s.length - 2);
  return [s[i], s[i + 1]];
}

/** "2026-04-23" → "4월 23일" */
export function monthDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일`;
}
