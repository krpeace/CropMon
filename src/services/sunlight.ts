import type { Selection } from "@/domain/selection";
import {
  lastMonthNote,
  lowestMonth,
  monthlySun,
  sunPercent,
  sunSummary,
} from "@/domain/sun";
import {
  koreanDate,
  observedBasis,
  summarizeObservedDates,
} from "@/domain/water-outlook";
import {
  createSunSource,
  type SunRow,
  type SunSource,
} from "@/infra/supabase/sun-source";
import { STATIONS } from "@/infra/stations";

import { readSunLatest, type SunLatest } from "./growth-latest";
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
  /** 기준일과 다른 예외 지점일 때 "M/D", 같거나 자료 없으면 null. */
  dateTag: string | null;
};

export type SunlightView = {
  /** data: 자료 있음 · notMeasured: 그 지점 sun_daily 줄이 없음 (햇빛을 재지 않음) · error: 읽지 못함 */
  kind: "data" | "notMeasured" | "error";
  basis: string | null;
  /** "올해 햇빛은 평년의 96%" 또는 "자료 없음" */
  verdict: string;
  numbers: { thisYear: string; normal: string } | null;
  /** 마지막 관측일 "2026-10-24". 올해 누적이 아직 없으면 null. */
  observedDate: string | null;
  /** 이 지점 sun_daily 를 마지막으로 올린 시각 (매일 09:20 heat-sun, 계약 v1.8). 모르면 null. */
  updatedAt: string | null;
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
  /** 지역 비교 기준일 안내 (전원 동일 과거일·혼재 시 후보 3). 전원 어제면 null. */
  compareNote: string | null;
  compareProblem: string | null;
  problem: string | null;
  /** DB 조회 실패 여부 (실패 미캐시 판단용, 실패 시 true). */
  failed?: boolean;
};

const NO_DATA = "자료 없음";
const LOW_PCT = 95;
const nf = (v: number) => Math.round(v).toLocaleString("ko-KR");

type Deps = { createSource?: () => SunSource; now?: () => Date };
type Main = Omit<
  SunlightView,
  "today" | "compare" | "compareNote" | "compareProblem"
>;

const EMPTY: Main = {
  kind: "error",
  basis: null,
  verdict: NO_DATA,
  numbers: null,
  observedDate: null,
  updatedAt: null,
  summary: null,
  normalPeriod: null,
  days: [],
  months: [],
  monthNote: null,
  problem: null,
  failed: false,
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
    const [rows, updatedAt] = await Promise.all([
      db.year(String(station.id), Number(today.slice(0, 4))),
      readUpdatedAt(db, station.id),
    ]);
    // 햇빛을 재지 않는 지점은 DB 에 줄이 없거나 올해 유효 값(rs_cum_mj)이 모두 비어 있다 (stations.ts 가 아니라 DB 기준)
    if (!rows.some((r) => r.rs_cum_mj != null)) {
      return { ...EMPTY, kind: "notMeasured" };
    }
    return { ...mainView(rows, today), updatedAt };
  } catch (error) {
    console.error("[sunlight] DB 읽기 실패:", error);
    return {
      ...EMPTY,
      problem: "햇빛 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
      failed: true,
    };
  }
}

/** 올린 시각만 못 읽어도 화면 자료는 보여 준다 (갱신 시각만 "자료 없음"). */
async function readUpdatedAt(db: SunSource, stationId: number) {
  try {
    return await db.lastUpdated(String(stationId));
  } catch (error) {
    console.error("[sunlight] 계산 시각 읽기 실패:", error);
    return null;
  }
}

function mainView(rows: SunRow[], today: string): Omit<Main, "updatedAt"> {
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
    observedDate: last?.date ?? null,
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

/** 대표 10개 지점 적산일사 지역 비교 + 후보 3 기준일 안내를 만든다 (`detail-cache` 폴백 공용). */
export function buildSunCompare(
  found: Record<number, SunLatest>,
  selectedId: number,
  today: string,
): { compare: SunCompareRow[]; compareNote: string | null } {
  const reps = STATIONS.filter((s) => s.isRepresentative);
  const pcts = reps.map((s) => {
    const r = found[s.id];
    return sunPercent(r?.cum ?? null, r?.normal ?? null);
  });
  const { note, tags } = summarizeObservedDates(
    reps.map((s, i) => (pcts[i] != null ? (found[s.id]?.date ?? null) : null)),
    today,
  );
  return {
    compare: reps.map((s, i) => {
      const pct = pcts[i] ?? null;
      return {
        id: s.id,
        name: s.name,
        selected: s.id === selectedId,
        pct,
        text: pct == null ? NO_DATA : `${pct}%`,
        dateTag: pct != null ? (tags[i] ?? null) : null,
      };
    }),
    compareNote: note,
  };
}

async function readCompare(
  db: SunSource | null,
  selectedId: number,
  today: string,
): Promise<Pick<SunlightView, "compare" | "compareNote" | "compareProblem">> {
  try {
    if (!db) throw new Error("DB 연결 정보 없음");
    const found = await readSunLatest(db, today);
    return {
      ...buildSunCompare(found, selectedId, today),
      compareProblem: null,
    };
  } catch (error) {
    console.error("[sunlight] 지역 비교 읽기 실패:", error);
    return {
      compare: [],
      compareNote: null,
      compareProblem:
        "지역 비교 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    };
  }
}
