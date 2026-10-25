import type { Crop } from "./selection";
import type { WaterStatus } from "./water-status";

/**
 * 물 화면 판정 문구 (시안 규칙). 계산하지 않는다: DB가 준 그날 상태와
 * "관수 필요까지 며칠"만 보고 쉬운 말을 고른다.
 */

export type Verdict = {
  text: string;
  /** 휴면기 안내처럼 문구 아래 한 줄. */
  sub: string | null;
  /** 카드 바탕 색. */
  tone: WaterStatus;
  /** 오늘은 여유인데 다음 날 관수 필요면 둘째 배지 문구. */
  extra: string | null;
};

type VerdictInput = {
  status: WaterStatus;
  /** 기준 날부터 관수 필요까지 며칠 (0 = 그날, 1 = 다음 날 …). 3일 안에 없으면 null. */
  needIn: number | null;
  past: boolean;
  crop: Crop;
  /** 그해 작기 시작·끝 (YYYY-MM-DD). */
  seasonStart: string;
  seasonEnd: string;
  /** 기준 날짜 (YYYY-MM-DD). */
  date: string;
};

function monthDay(iso: string) {
  const [, m, d] = iso.split("-").map(Number);
  return `${m}월 ${d}일`;
}

function dormant(i: VerdictInput): Verdict {
  const start = (i.date > i.seasonEnd ? "내년 " : "") + monthDay(i.seasonStart);
  if (i.crop === "apple") {
    return {
      text: i.past ? "이날은 휴면기였어요" : "지금은 휴면기예요",
      sub: `사과나무가 겨울잠을 자는 중이에요. ${start}부터 다시 물을 계산해요.`,
      tone: "dormant",
      extra: null,
    };
  }
  return {
    text: i.past
      ? "이날은 배추 작기가 아니었어요"
      : "지금은 배추 작기가 아니에요",
    sub: `${start} 정식부터 물을 계산해요.`,
    tone: "dormant",
    extra: null,
  };
}

const LATER = {
  now: ["", "내일", "모레", "사흘 뒤"],
  past: ["", "다음날", "이틀 뒤", "사흘 뒤"],
};

export function waterVerdict(i: VerdictInput): Verdict {
  const v = (text: string, tone: WaterStatus, extra: string | null = null) => ({
    text,
    sub: null,
    tone,
    extra,
  });
  if (i.status === "dormant") return dormant(i);
  if (i.status === "wet") {
    return v(
      i.past
        ? "땅이 너무 젖었어요, 물을 주지 말아야 했어요"
        : "물 주지 마세요, 땅이 너무 젖었어요",
      "wet",
    );
  }
  if (i.status === "need" || i.needIn === 0) {
    return v(i.past ? "이날 물을 줘야 했어요" : "오늘 물 주세요", "need");
  }
  if (i.needIn != null && i.needIn <= 3) {
    const when = (i.past ? LATER.past : LATER.now)[i.needIn];
    const text = i.past
      ? `이날은 괜찮았어요, ${when} 물을 줘야 했어요`
      : `오늘은 괜찮아요, ${when} 물 주세요`;
    const extra =
      i.needIn === 1 ? (i.past ? "다음날 관수 필요" : "내일 관수 필요") : null;
    return v(text, i.needIn === 1 ? "need" : "caution", extra);
  }
  if (i.status === "normal") {
    return v(
      i.past
        ? "흙이 촉촉했어요, 물 주지 않아도 됐어요"
        : "흙이 촉촉해요, 물 주지 않아도 돼요",
      "normal",
    );
  }
  return v(
    i.past
      ? "여유가 있었어요, 3일 동안 괜찮았어요"
      : "아직 여유 있어요, 3일 동안 괜찮아요",
    "caution",
  );
}

/** 게이지 아래 한 줄. */
export function leftText(drMm: number, rawMm: number): string {
  return drMm > rawMm
    ? `관수 시작점을 ${Math.max(1, Math.round(drMm - rawMm))} mm 넘었어요`
    : `관수 시작점까지 ${Math.max(0, Math.round(rawMm - drMm))} mm 남았어요`;
}

export type MonthRow = {
  month: string;
  eto: number;
  /** 작물이 쓴 물이 하루도 없으면(휴면기·작기 아님) null. */
  etc: number | null;
  rain: number;
  /** 관수 필요였던 날 수. 휴면기 달은 null. */
  needDays: number | null;
};

type DayRow = {
  date: string;
  status: WaterStatus;
  etoMm: number | null;
  etcMm: number | null;
  rainMm: number | null;
};

/** 월별 요약: 일별 값을 달마다 더하기만 한다 (표시용 합계, 결정 0009). */
export function monthlySummary(rows: readonly DayRow[]): MonthRow[] {
  const groups = new Map<string, DayRow[]>();
  for (const r of rows) {
    const key = r.date.slice(0, 7);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const keys = [...groups.keys()].sort();
  return keys.map((key, i) => {
    const g = groups.get(key)!;
    const sum = (f: (r: DayRow) => number | null) =>
      Math.round(g.reduce((a, r) => a + (f(r) ?? 0), 0));
    const hasEtc = g.some((r) => r.etcMm != null);
    const [y, m] = key.split("-").map(Number);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const lastRow = Number(g.at(-1)!.date.slice(8));
    const partial = i === keys.length - 1 && lastRow < lastDay;
    return {
      month: `${m}월${partial ? ` ~${lastRow}일` : ""}`,
      eto: sum((r) => r.etoMm),
      etc: hasEtc ? sum((r) => r.etcMm) : null,
      rain: sum((r) => r.rainMm),
      needDays: hasEtc ? g.filter((r) => r.status === "need").length : null,
    };
  });
}
