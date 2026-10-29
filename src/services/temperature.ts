import {
  gddNumbers,
  leadShort,
  leadVerdict,
  monthDay,
  pickStages,
  reachDate,
} from "@/domain/heat";
import type { Selection } from "@/domain/selection";
import { CROP_DB_ID, koreanDate, observedBasis } from "@/domain/water-outlook";
import {
  createHeatSource,
  type HeatRow,
  type HeatSource,
} from "@/infra/supabase/heat-source";
import { STATIONS } from "@/infra/stations";

import { readHeatLatest } from "./growth-latest";
import type { Station } from "./shell";

/**
 * 온도 화면에 필요한 값을 DB에서 읽어 화면용으로 정리한다 (데이터 계약 v1.4, 결정 0013·0015).
 * 계산하지 않는다. 숫자는 반올림해 문구로 바꾸고, 단계 도달일은 표에서 처음 넘는 날을 찾기만 한다.
 */

export type StageCard = {
  /** "적산온도 1,000 ℃·일" */
  title: string;
  /** 올해 도달일 "4월 23일" 또는 "아직" */
  thisYear: string;
  /** "평년 4월 30일" */
  normal: string;
  reached: boolean;
};

/** 그래프용 날짜별 값. 올해는 관측한 날까지만. */
export type HeatDay = {
  date: string;
  cum: number | null;
  normalCum: number | null;
};

export type CompareRow = {
  id: number;
  name: string;
  selected: boolean;
  lead: number | null;
  /** "+5일" 또는 "자료 없음" */
  text: string;
};

export type TemperatureView = {
  /** "어제까지 관측 기준" */
  basis: string | null;
  /** "평년보다 생육 20일 빠름" 또는 "자료 없음" */
  verdict: string;
  numbers: { thisYear: string; normal: string; diff: string } | null;
  /** 계산에 쓴 기준온도 (℃) */
  baseTemp: number | null;
  /** "2016–2025" */
  normalPeriod: string | null;
  stages: StageCard[];
  days: HeatDay[];
  today: string;
  compare: CompareRow[];
  compareProblem: string | null;
  /** 자료를 보여 줄 수 없을 때 그 이유. 없으면 null. */
  problem: string | null;
};

const NO_DATA = "자료 없음";
const nf = (v: number) => Math.round(v).toLocaleString("ko-KR");

type Deps = { createSource?: () => HeatSource; now?: () => Date };

type Main = Omit<TemperatureView, "today" | "compare" | "compareProblem">;

const EMPTY: Main = {
  basis: null,
  verdict: NO_DATA,
  numbers: null,
  baseTemp: null,
  normalPeriod: null,
  stages: [],
  days: [],
  problem: null,
};

export async function getTemperatureView(
  selection: Selection,
  station: Station,
  {
    createSource = () => createHeatSource(),
    now = () => new Date(),
  }: Deps = {},
): Promise<TemperatureView> {
  const today = koreanDate(now().toISOString());
  const cropId = CROP_DB_ID[selection.crop];
  let db: HeatSource | null = null;
  try {
    db = createSource();
  } catch (error) {
    console.error("[temperature] DB 연결 준비 실패:", error);
  }

  const [main, compare] = await Promise.all([
    readMain(db, station, cropId, today),
    readCompare(db, selection.stationId, cropId, today),
  ]);
  return { ...main, ...compare, today };
}

async function readMain(
  db: HeatSource | null,
  station: Station,
  cropId: string,
  today: string,
): Promise<Main> {
  const year = Number(today.slice(0, 4));
  try {
    if (!db) throw new Error("DB 연결 정보 없음");
    const [rows, stages] = await Promise.all([
      db.year(String(station.id), cropId, year),
      db.stages(cropId),
    ]);
    if (rows.length === 0) {
      return {
        ...EMPTY,
        problem:
          station.isRepresentative === false
            ? "이 지점은 아직 물 계산을 하지 않아요. 가까운 대표 지점을 골라 보세요"
            : `이 지역·작물의 ${year} 적산온도가 아직 없어요.`,
      };
    }
    return mainView(rows, stages ?? [], today);
  } catch (error) {
    console.error("[temperature] DB 읽기 실패:", error);
    return {
      ...EMPTY,
      problem: "온도 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    };
  }
}

function mainView(rows: HeatRow[], stages: number[], today: string): Main {
  // 마지막 관측일 = 올해 누적이 있는 마지막 줄 (앞날 줄은 평년 값만 있다)
  const last = rows.findLast((r) => r.gdd_cum != null) ?? null;
  const annual = rows.at(-1)?.gdd_normal_cum ?? null;
  const cum = last?.gdd_cum ?? null;
  const first = rows[0];

  return {
    basis: last ? observedBasis(last.date, today) : null,
    verdict: leadVerdict(last?.lead_days ?? null, cum, annual),
    numbers:
      cum != null && last?.gdd_normal_cum != null
        ? gddNumbers(cum, last.gdd_normal_cum)
        : null,
    baseTemp: first.t_base_c,
    normalPeriod: `${first.normal_from}–${first.normal_to}`,
    stages: pickStages(stages, cum).map((s) => stageCard(rows, s)),
    days: rows.map((r) => ({
      date: r.date,
      cum: r.gdd_cum,
      normalCum: r.gdd_normal_cum,
    })),
    problem: null,
  };
}

function stageCard(rows: HeatRow[], stage: number): StageCard {
  const mine = reachDate(rows, (r) => r.gdd_cum, stage);
  const normal = reachDate(rows, (r) => r.gdd_normal_cum, stage);
  return {
    title: `적산온도 ${nf(stage)} ℃·일`,
    thisYear: mine ? monthDay(mine) : "아직",
    normal: normal ? `평년 ${monthDay(normal)}` : "평년에는 닿지 않아요",
    reached: mine != null,
  };
}

async function readCompare(
  db: HeatSource | null,
  selectedId: number,
  cropId: string,
  today: string,
): Promise<Pick<TemperatureView, "compare" | "compareProblem">> {
  try {
    if (!db) throw new Error("DB 연결 정보 없음");
    const found = await readHeatLatest(db, cropId, today);
    return {
      compare: STATIONS.filter((s) => s.isRepresentative).map((s) => {
        const lead = found[s.id]?.lead ?? null;
        return {
          id: s.id,
          name: s.name,
          selected: s.id === selectedId,
          lead,
          text: leadShort(lead) ?? NO_DATA,
        };
      }),
      compareProblem: null,
    };
  } catch (error) {
    console.error("[temperature] 지역 비교 읽기 실패:", error);
    return { compare: [], compareProblem: "지역 비교 자료를 읽지 못했어요." };
  }
}
