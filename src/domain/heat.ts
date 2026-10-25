/**
 * 온도 화면의 표시 규칙 (결정 0013·0015). 적산온도·평년·"며칠 빠른가"는 DB 값 그대로 쓰고,
 * 여기서는 문구로 바꾸거나 표에서 처음 넘는 날을 찾기만 한다 (계산하지 않음).
 */

const nf = (v: number) => Math.round(v).toLocaleString("ko-KR");

/** 생육 속도 큰 글씨. lead_days 가 비면 올해 누적과 평년 한 해 합(12/31)을 견줘 본다. */
export function leadVerdict(
  lead: number | null,
  cum: number | null,
  normalAnnual: number | null,
): string {
  if (lead == null) {
    // 올해가 평년 한 해 치를 이미 넘으면 "평년이 언제 닿는가"를 찾을 수 없다 (태백처럼)
    if (cum != null && normalAnnual != null && cum > normalAnnual) {
      return "평년 한 해 치를 넘었어요";
    }
    return "자료 없음";
  }
  if (lead > 0) return `평년보다 생육 ${lead}일 빠름`;
  if (lead < 0) return `평년보다 생육 ${-lead}일 늦음`;
  return "생육이 평년과 비슷해요";
}

/** 지역 비교 막대 옆: "+5일", "-2일", "0일". 비면 null. */
export function leadShort(lead: number | null): string | null {
  if (lead == null) return null;
  return lead > 0 ? `+${lead}일` : `${lead}일`;
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
