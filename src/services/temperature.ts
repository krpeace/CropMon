import { monthDay } from "@/domain/datetime";
import {
  gddNumbers,
  heatDiff,
  heatVerdict,
  pickStages,
  reachDate,
  stageLag,
  type StageLag,
} from "@/domain/heat";
import { isBeforeSeason } from "@/domain/season";
import type { Selection } from "@/domain/selection";
import {
  CROP_DB_ID,
  extraCompareDateTag,
  koreanDate,
  observedBasis,
  summarizeObservedDates,
} from "@/domain/water-outlook";
import {
  createSeriesFinder,
  type HeatSeries,
  type SeriesLookup,
} from "@/infra/supabase/accum-series";
import {
  createHeatSource,
  type HeatRow,
  type HeatSource,
} from "@/infra/supabase/heat-source";
import { STATIONS } from "@/infra/stations";

import { readHeatLatest, type HeatLatest } from "./growth-latest";
import type { Station } from "./shell";

/**
 * 온도 화면에 필요한 값을 DB에서 읽어 화면용으로 정리한다 (데이터 계약 v1.4·v2.2, 결정 0013·0015·0032·0072).
 * 계산하지 않는다. 숫자는 반올림해 문구로 바꾸고, 단계 도달일은 표에서 처음 넘는 날을 찾기만 한다.
 */

export type StageCard = {
  /** "적산온도 1,000℃" */
  title: string;
  /** 올해 도달일 "4월 23일" 또는 "아직" */
  thisYear: string;
  /** "평년 4월 30일" */
  normal: string;
  reached: boolean;
  /** 날짜 옆 꼬리표 "5일 빠름". 올해·평년 도달일을 둘 다 모르면 null. */
  lag: StageLag | null;
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
  /** 평년 대비 적산온도 차이 (℃). 자료가 없으면 null. */
  diff: number | null;
  /** "+180℃" 또는 "자료 없음" */
  text: string;
  /** 기준일과 다른 예외 지점일 때 "M/D", 같거나 자료 없으면 null. */
  dateTag: string | null;
};

/**
 * 온도 자료 상태 (결정 0072). 화면 글자는 G1 이 정한다 — 지금은 구별만 해 둔다.
 * ok 정상 · beforeSeason 그 계열 누적 시작일 전(날짜로 정함) · noHeat 적산온도 안 냄(시설가온 등) ·
 * needSeasonType 작형이 필요함 · noData 시작일 뒤인데 줄이 없음("자료 없음") · error 읽지 못함
 */
export type HeatStatus =
  "ok" | "beforeSeason" | "noHeat" | "needSeasonType" | "noData" | "error";

export type TemperatureView = {
  status: HeatStatus;
  /** "어제까지 관측 기준" */
  basis: string | null;
  /** "평년보다 +180℃" · "평년과 같아요" · "자료 없음" */
  verdict: string;
  numbers: { thisYear: string; normal: string; diff: string } | null;
  /** 마지막 관측일 "2026-10-24". 올해 누적이 아직 없으면 null. */
  observedDate: string | null;
  /** 이 지점 heat_series_daily 를 마지막으로 올린 시각 (매일 09:20 heat-sun, 계약 v1.8). 모르면 null. */
  updatedAt: string | null;
  /** 계산에 쓴 기준온도 (℃) */
  baseTemp: number | null;
  /** "2016–2025" */
  normalPeriod: string | null;
  stages: StageCard[];
  days: HeatDay[];
  today: string;
  compare: CompareRow[];
  /** 지역 비교 기준일 안내 (전원 동일 과거일·혼재 시 후보 3). 전원 어제면 null. */
  compareNote: string | null;
  compareProblem: string | null;
  /** 자료를 보여 줄 수 없을 때 그 이유. 없으면 null. */
  problem: string | null;
  /** DB 조회 실패 여부 (실패 미캐시 판단용, 실패 시 true). */
  failed?: boolean;
};

const NO_DATA = "자료 없음";
const nf = (v: number) => Math.round(v).toLocaleString("ko-KR");

type Deps = {
  createSource?: () => HeatSource;
  /** 작물 → 적산 계열 찾기 (crop_accum_series 뷰). 시험에서는 가짜를 넣는다. */
  findSeries?: (cropId: string) => Promise<SeriesLookup>;
  now?: () => Date;
};

type Main = Omit<
  TemperatureView,
  "today" | "compare" | "compareNote" | "compareProblem"
>;

const EMPTY: Main = {
  status: "error",
  basis: null,
  verdict: NO_DATA,
  numbers: null,
  observedDate: null,
  updatedAt: null,
  baseTemp: null,
  normalPeriod: null,
  stages: [],
  days: [],
  problem: null,
  failed: false,
};

export async function getTemperatureView(
  selection: Selection,
  station: Station,
  {
    createSource = () => createHeatSource(),
    findSeries = (cropId) => createSeriesFinder().find(cropId),
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

  // 계열은 한 번만 찾아 본문과 지역 비교가 함께 쓴다. 못 읽으면 둘 다 읽기 실패와 같은 쪽으로 간다.
  const lookup: Lookup = findSeries(cropId).then(
    (l) => ({ ok: true as const, l }),
    (e: unknown) => ({ ok: false as const, e }),
  );
  const [main, compare] = await Promise.all([
    readMain(db, station, cropId, today, lookup),
    readCompare(db, selection.stationId, today, lookup),
  ]);
  return { ...main, ...compare, today };
}

type Lookup = Promise<
  { ok: true; l: SeriesLookup } | { ok: false; e: unknown }
>;

/** 읽을 계열이 있으면 그 계열, 없으면(작형 필요 · 안 냄 · 작기 전) 그 이유를 담은 본문. */
function pickHeat(
  l: SeriesLookup,
  today: string,
): { series: HeatSeries } | { main: Main } {
  if (l.kind === "needSeasonType") {
    return {
      main: {
        ...EMPTY,
        status: "needSeasonType",
        problem: "작형을 먼저 골라 주세요.",
      },
    };
  }
  if (l.kind !== "ok") throw new Error("적산 계열을 찾지 못했어요");
  if (!l.heat) {
    return {
      main: {
        ...EMPTY,
        status: "noHeat",
        problem: "이 작형은 적산온도를 계산하지 않아요.",
      },
    };
  }
  if (isBeforeSeason(today, l.heat.cumStartMmdd)) {
    return {
      main: {
        ...EMPTY,
        status: "beforeSeason",
        problem: "아직 작기 전이에요.",
      },
    };
  }
  return { series: l.heat };
}

async function readMain(
  db: HeatSource | null,
  station: Station,
  cropId: string,
  today: string,
  lookup: Lookup,
): Promise<Main> {
  const year = Number(today.slice(0, 4));
  try {
    if (!db) throw new Error("DB 연결 정보 없음");
    const looked = await lookup;
    if (!looked.ok) throw looked.e;
    const picked = pickHeat(looked.l, today);
    if ("main" in picked) return picked.main;
    const series = picked.series;
    const [rows, stages, updatedAt] = await Promise.all([
      db.year(String(station.id), series, year),
      db.stages(cropId),
      readUpdatedAt(db, station.id, series),
    ]);
    if (rows.length === 0) {
      return {
        ...EMPTY,
        status: "noData",
        problem: `이 지역·작물의 ${year} 적산온도가 아직 없어요.`,
      };
    }
    return { ...mainView(rows, stages ?? [], today), updatedAt };
  } catch (error) {
    console.error("[temperature] DB 읽기 실패:", error);
    return {
      ...EMPTY,
      problem: "온도 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
      failed: true,
    };
  }
}

/** 올린 시각만 못 읽어도 화면 자료는 보여 준다 (갱신 시각만 "자료 없음"). */
async function readUpdatedAt(
  db: HeatSource,
  stationId: number,
  series: HeatSeries,
) {
  try {
    return await db.lastUpdated(String(stationId), series);
  } catch (error) {
    console.error("[temperature] 계산 시각 읽기 실패:", error);
    return null;
  }
}

function mainView(
  rows: HeatRow[],
  stages: number[],
  today: string,
): Omit<Main, "updatedAt"> {
  // 마지막 관측일 = 올해 누적이 있는 마지막 줄 (앞날 줄은 평년 값만 있다)
  const last = rows.findLast((r) => r.gdd_cum != null) ?? null;
  const cum = last?.gdd_cum ?? null;
  const first = rows[0];

  return {
    status: "ok",
    basis: last ? observedBasis(last.date, today) : null,
    verdict: heatVerdict(cum, last?.gdd_normal_cum ?? null),
    numbers:
      cum != null && last?.gdd_normal_cum != null
        ? gddNumbers(cum, last.gdd_normal_cum)
        : null,
    observedDate: last?.date ?? null,
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
    title: `적산온도 ${nf(stage)}℃`,
    thisYear: mine ? monthDay(mine) : "아직",
    normal: normal ? `평년 ${monthDay(normal)}` : "평년에는 닿지 않아요",
    reached: mine != null,
    lag: stageLag(mine, normal),
  };
}

/** 대표 10개 지점 적산온도 지역 비교 + 후보 3 기준일 안내를 만든다 (`detail-cache` 폴백 공용). 대표 밖 지점이면 맨 위에 붙인다 (#79). */
export function buildHeatCompare(
  found: Record<number, HeatLatest>,
  selectedId: number,
  today: string,
): { compare: CompareRow[]; compareNote: string | null } {
  const reps = STATIONS.filter((s) => s.isRepresentative);
  const selectedNonRep = reps.some((s) => s.id === selectedId)
    ? null
    : (STATIONS.find((s) => s.id === selectedId) ?? null);
  const repDates = reps.map((s) => {
    const h = found[s.id];
    return h && heatDiff(h.cum, h.normal) ? h.date : null;
  });
  const { note, tags } = summarizeObservedDates(repDates, today);
  const toRow = (
    s: (typeof STATIONS)[number],
    tag: string | null,
  ): CompareRow => {
    const h = found[s.id];
    const diff = h ? heatDiff(h.cum, h.normal) : null;
    return {
      id: s.id,
      name: s.name,
      selected: s.id === selectedId,
      diff: diff?.value ?? null,
      text: diff?.text ?? NO_DATA,
      dateTag: diff ? tag : null,
    };
  };
  const compare = reps.map((s, i) => toRow(s, tags[i] ?? null));
  if (selectedNonRep) {
    compare.unshift(
      toRow(
        selectedNonRep,
        extraCompareDateTag(
          found[selectedNonRep.id]?.date ?? null,
          repDates,
          today,
        ),
      ),
    );
  }
  return { compare, compareNote: note };
}

async function readCompare(
  db: HeatSource | null,
  selectedId: number,
  today: string,
  lookup: Lookup,
): Promise<
  Pick<TemperatureView, "compare" | "compareNote" | "compareProblem">
> {
  try {
    if (!db) throw new Error("DB 연결 정보 없음");
    const looked = await lookup;
    if (!looked.ok) throw looked.e;
    const l = looked.l;
    if (l.kind === "notFound") throw new Error("적산 계열을 찾지 못했어요");
    // 적산온도를 안 내거나 작형이 필요하면 읽을 계열이 없어 지역 비교는 비운다
    if (l.kind === "needSeasonType" || !l.heat)
      return { compare: [], compareNote: null, compareProblem: null };
    const series = l.heat;
    const isRep = STATIONS.some(
      (s) => s.id === selectedId && s.isRepresentative,
    );
    const [found, extra] = await Promise.all([
      readHeatLatest(db, series, today),
      isRep
        ? Promise.resolve<Record<number, HeatLatest>>({})
        : readHeatLatest(db, series, today, "rep", [selectedId]).catch(
            (error) => {
              console.error(
                "[temperature] 선택 지점 지역 비교 읽기 실패:",
                error,
              );
              return {};
            },
          ),
    ]);
    return {
      ...buildHeatCompare({ ...found, ...extra }, selectedId, today),
      compareProblem: null,
    };
  } catch (error) {
    console.error("[temperature] 지역 비교 읽기 실패:", error);
    return {
      compare: [],
      compareNote: null,
      compareProblem:
        "지역 비교 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
    };
  }
}
