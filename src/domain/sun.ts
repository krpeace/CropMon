/**
 * 햇빛 화면의 표시 규칙 (결정 0013·0016). 적산일사·평년은 DB 값 그대로 쓰고,
 * 여기서는 비율 %, 달마다 더하기(표시용 합계, 결정 0009 와 같은 예외), 가장 적은 달 고르기, 문구만 한다.
 */

/** 평년 대비 % = 올해 누적 ÷ 평년 누적 (반올림). 값이 없거나 평년이 0 이면 null. */
export function sunPercent(
  cum: number | null,
  normal: number | null,
): number | null {
  if (cum == null || normal == null || normal <= 0) return null;
  return Math.round((cum / normal) * 100);
}

export type SunMonth = {
  month: number;
  thisYear: number;
  normal: number;
  /** 평년 대비 %. 평년이 0 이면 null. */
  pct: number | null;
};

type DayRow = {
  date: string;
  rs_day_mj: number | null;
  rs_normal_day_mj: number | null;
};

/** 1월부터 마지막 관측일이 든 달까지, 달마다 그날 값을 더한다 (마지막 관측일까지만, 빈 날은 건너뜀). */
export function monthlySun(
  rows: readonly DayRow[],
  lastDate: string,
): SunMonth[] {
  const sums = new Map<number, { thisYear: number; normal: number }>();
  for (const r of rows) {
    if (r.date > lastDate) break;
    const m = Number(r.date.slice(5, 7));
    const s = sums.get(m) ?? { thisYear: 0, normal: 0 };
    s.thisYear += r.rs_day_mj ?? 0;
    s.normal += r.rs_normal_day_mj ?? 0;
    sums.set(m, s);
  }
  return [...sums].map(([month, s]) => ({
    month,
    thisYear: s.thisYear,
    normal: s.normal,
    pct: sunPercent(s.thisYear, s.normal),
  }));
}

/** 평년 대비가 가장 낮은 달. 고를 달이 없으면 null. */
export function lowestMonth(months: readonly SunMonth[]): SunMonth | null {
  let low: SunMonth | null = null;
  for (const m of months) {
    if (m.pct != null && (low?.pct == null || m.pct < low.pct)) low = m;
  }
  return low;
}

/** 시안 설명 한 줄: "평년보다 조금 적었어요. 3월이 가장 적었어요 (평년의 85%)." */
export function sunSummary(pct: number, low: SunMonth | null): string {
  const rel =
    pct >= 98 && pct <= 102
      ? "평년과 비슷했어요."
      : pct < 98
        ? "평년보다 조금 적었어요."
        : "평년보다 조금 많았어요.";
  if (!low || low.pct == null) return rel;
  return `${rel} ${low.month}월이 가장 적었어요 (평년의 ${low.pct}%).`;
}

/** 마지막 달 막대 아래 설명: "10월은 24일까지" */
export function lastMonthNote(lastDate: string): string {
  const [, m, d] = lastDate.split("-").map(Number);
  return `${m}월은 ${d}일까지`;
}
