import type { Selection } from "@/domain/selection";
import {
  lastMonthNote,
  lowestMonth,
  monthlySun,
  sunPercent,
  sunSummary,
} from "@/domain/sun";
import { koreanDate, observedBasis } from "@/domain/water-outlook";
import {
  createSunSource,
  type SunRow,
  type SunSource,
} from "@/infra/supabase/sun-source";
import { STATIONS } from "@/infra/stations";

import { readSunLatest } from "./growth-latest";
import type { Station } from "./shell";
import type { HeatDay } from "./temperature";

/**
 * 햇빛 화면에 필요한 값을 DB에서 읽어 화면용으로 정리한다 (데이터 계약 v1.4, 결정 0013·0016).
 * 계산하지 않는다. 평년 대비 %·월별 합·가장 적은 달은 표시용 순수 함수(src/domain/sun.ts)로만 만든다.
 */

export type SunMonthBar = {
  /** "1월" */
  label: string;
  thisYear: number;
  normal: number;
  /** 막대 위 평년 대비 "96%" */
  pct: string;
  /** 95% 미만이면 주황 글씨 */
  low: boolean;
};

export type SunCompareRow = {
  id: number;
  name: string;
  selected: boolean;
  /** 평년 대비 %. 자료가 없으면 null. */
  pct: number | null;
  /** "96%" 또는 "자료 없음" */
  text: string;
};

export type SunlightView = {
  /** data: 자료 있음 · notMeasured: 그 지점 sun_daily 줄이 없음 (햇빛을 재지 않음) · error: 읽지 못함 */
  kind: "data" | "notMeasured" | "error";
  basis: string | null;
  /** "올해 햇빛은 평년의 96%" 또는 "자료 없음" */
  verdict: string;
  numbers: { thisYear: string; normal: string } | null;
  /** "평년보다 조금 적었어요. 3월이 가장 적었어요 (평년의 85%)." */
  summary: string | null;
  /** "2016–2025" */
  normalPeriod: string | null;
  days: HeatDay[];
  today: string;
  months: SunMonthBar[];
  /** "10월은 24일까지" */
  monthNote: string | null;
  compare: SunCompareRow[];
  compareProblem: string | null;
  problem: string | null;
};

const NO_DATA = "자료 없음";
const LOW_PCT = 95;
const nf = (v: number) => Math.round(v).toLocaleString("ko-KR");

type Deps = { createSource?: () => SunSource; now?: () => Date };
type Main = Omit<SunlightView, "today" | "compare" | "compareProblem">;

const EMPTY: Main = {
  kind: "error",
  basis: null,
  verdict: NO_DATA,
  numbers: null,
  summary: null,
  normalPeriod: null,
  days: [],
  months: [],
  monthNote: null,
  problem: null,
};

export async function getSunlightView(
  selection: Selection,
  station: Station,
  { createSource = () => createSunSource(), now = () => new Date() }: Deps = {},
): Promise<SunlightView> {
  const today = koreanDate(now().toISOString());
  let db: SunSource | null = null;
  try {
    db = createSource();
  } catch (error) {
    console.error("[sunlight] DB 연결 준비 실패:", error);
  }

  const [main, compare] = await Promise.all([
    readMain(db, station, today),
    readCompare(db, selection.stationId, today),
  ]);
  return { ...main, ...compare, today };
}

async function readMain(
  db: SunSource | null,
  station: Station,
  today: string,
): Promise<Main> {
  try {
    if (!db) throw new Error("DB 연결 정보 없음");
    const rows = await db.year(String(station.id), Number(today.slice(0, 4)));
    // 햇빛을 재지 않는 지점은 DB 에 줄이 없다 (stations.ts 의 measuresSunlight 가 아니라 DB 기준)
    if (rows.length === 0) return { ...EMPTY, kind: "notMeasured" };
    return mainView(rows, today);
  } catch (error) {
    console.error("[sunlight] DB 읽기 실패:", error);
    return {
      ...EMPTY,
      problem: "햇빛 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    };
  }
}

function mainView(rows: SunRow[], today: string): Main {
  const first = rows[0];
  const last = rows.findLast((r) => r.rs_cum_mj != null) ?? null;
  const pct = sunPercent(
    last?.rs_cum_mj ?? null,
    last?.rs_normal_cum_mj ?? null,
  );
  const months = last ? monthlySun(rows, last.date) : [];

  return {
    kind: "data",
    basis: last ? observedBasis(last.date, today) : null,
    verdict: pct == null ? NO_DATA : `올해 햇빛은 평년의 ${pct}%`,
    numbers:
      last?.rs_cum_mj != null && last.rs_normal_cum_mj != null
        ? { thisYear: nf(last.rs_cum_mj), normal: nf(last.rs_normal_cum_mj) }
        : null,
    summary: pct == null ? null : sunSummary(pct, lowestMonth(months)),
    normalPeriod: `${first.normal_from}–${first.normal_to}`,
    days: rows.map((r) => ({
      date: r.date,
      cum: r.rs_cum_mj,
      normalCum: r.rs_normal_cum_mj,
    })),
    months: months.map((m) => ({
      label: `${m.month}월`,
      thisYear: Math.round(m.thisYear),
      normal: Math.round(m.normal),
      pct: m.pct == null ? "—" : `${m.pct}%`,
      low: m.pct != null && m.pct < LOW_PCT,
    })),
    monthNote: last ? lastMonthNote(last.date) : null,
    problem: null,
  };
}

async function readCompare(
  db: SunSource | null,
  selectedId: number,
  today: string,
): Promise<Pick<SunlightView, "compare" | "compareProblem">> {
  try {
    if (!db) throw new Error("DB 연결 정보 없음");
    const found = await readSunLatest(db, today);
    return {
      compare: STATIONS.filter((s) => s.isRepresentative).map((s) => {
        const r = found[s.id];
        const pct = sunPercent(r?.cum ?? null, r?.normal ?? null);
        return {
          id: s.id,
          name: s.name,
          selected: s.id === selectedId,
          pct,
          text: pct == null ? NO_DATA : `${pct}%`,
        };
      }),
      compareProblem: null,
    };
  } catch (error) {
    console.error("[sunlight] 지역 비교 읽기 실패:", error);
    return { compare: [], compareProblem: "지역 비교 자료를 읽지 못했어요." };
  }
}
