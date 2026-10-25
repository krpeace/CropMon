import { CROPS, type Crop } from "@/domain/selection";
import {
  addDays,
  CROP_DB_ID,
  firstMainDate,
  koreanDate,
  needInDays,
} from "@/domain/water-outlook";
import { WATER_STATUSES, type WaterStatus } from "@/domain/water-status";
import { STATIONS } from "@/infra/stations";
import {
  createStatusSource,
  type RunRefRow,
  type StatusSource,
} from "@/infra/supabase/status-source";

/**
 * 지점 10곳 × 작물의 오늘 물 판정 (지역 칩 점 색·종합 화면, 결정 0010·0011).
 * 물 화면 ①과 같은 기준: 기본 재배 방식 조건의 최신 회차 출발 상태,
 * 회차가 없으면 최근 7일 안의 마지막 관측 물수지, 둘 다 없으면 null("자료 없음").
 */

export type StationWater = {
  status: WaterStatus;
  drMm: number | null;
  rawMm: number;
  tawMm: number;
  seasonStart: string;
  seasonEnd: string;
  /** 마지막 관측 물수지 날. 없으면 null. */
  observedDate: string | null;
  /** 단기예보가 있으면 관수 필요까지 며칠(오늘 0)과 오늘 다음 3일 판정. 없으면 null (관측 기준). */
  forecast: {
    needIn: number | null;
    days: { date: string; status: WaterStatus }[];
  } | null;
};

/** 갱신 시각: 예보 지점은 회차가 끝난 시각과 발표 시(02·17), 그 밖은 ASOS 받은 시각. */
export type StationUpdated = { at: string; runHour: "02" | "17" | null } | null;

export type StationBoard = {
  ok: boolean;
  water: Record<Crop, Record<number, StationWater | null>>;
  updated: Record<number, StationUpdated>;
};

export type StationStatuses = Record<Crop, Record<number, WaterStatus | null>>;

type Deps = { createSource?: () => StatusSource; now?: () => Date };

const RECENT_RUNS = 40; // 지점 10곳 × 하루 2회 × 이틀
const RECENT_DAYS = 7;
/** 이보다 오래된 회차는 예보로 쓰지 않는다 (관측 기준으로 돌린다). */
const RUN_MAX_AGE_H = 36;

function code(v: string | undefined): WaterStatus | null {
  return (WATER_STATUSES as readonly string[]).includes(v ?? "")
    ? (v as WaterStatus)
    : null;
}

function emptyBoard(ok: boolean): StationBoard {
  const blank = <T>() =>
    Object.fromEntries(STATIONS.map((s) => [s.id, null])) as Record<
      number,
      T | null
    >;
  return {
    ok,
    water: { apple: blank<StationWater>(), cabbage: blank<StationWater>() },
    updated: blank<NonNullable<StationUpdated>>(),
  };
}

function runHour(r: RunRefRow): "02" | "17" {
  return r.run_name === "저녁" ? "17" : "02";
}

export async function getStationBoard({
  createSource = () => createStatusSource(),
  now = () => new Date(),
}: Deps = {}): Promise<StationBoard> {
  try {
    const db = createSource();
    const at = now();
    const today = koreanDate(at.toISOString());
    const since = addDays(today, -RECENT_DAYS);
    const scen = await db.defaultScenarios(Number(today.slice(0, 4)));
    const runs = await db.recentRuns(RECENT_RUNS);
    const latest = new Map<string, RunRefRow>(); // 지점 → 최신 회차 (runs 는 새것부터)
    for (const r of runs) {
      const fresh =
        at.getTime() - Date.parse(r.run_at) <= RUN_MAX_AGE_H * 3_600_000;
      if (fresh && !latest.has(r.stn_id)) latest.set(r.stn_id, r);
    }
    const runIds = [...latest.values()].map((r) => r.run_id);
    const ids = scen.map((s) => s.scenario_id);
    const none = Promise.resolve([]);
    const [sums, bal, days, weather] = await Promise.all([
      runIds.length && ids.length ? db.summaries(runIds, ids) : none,
      ids.length ? db.recentBalance(ids, since) : none,
      runIds.length && ids.length ? db.outlookDays(runIds, ids) : none,
      db.recentWeather(since),
    ]);
    const newestFirst = <T extends { date: string }>(xs: T[]) =>
      [...xs].sort((a, b) => (a.date < b.date ? 1 : -1));

    const board = emptyBoard(true);
    for (const s of STATIONS) {
      const run = latest.get(String(s.id));
      if (run?.finished_at) {
        board.updated[s.id] = { at: run.finished_at, runHour: runHour(run) };
      } else {
        const w = newestFirst(
          weather.filter((x) => x.stn_id === String(s.id)),
        )[0];
        board.updated[s.id] = w ? { at: w.fetched_at, runHour: null } : null;
      }
    }
    for (const crop of CROPS) {
      for (const sc of scen.filter((x) => x.crop_id === CROP_DB_ID[crop])) {
        const stn = Number(sc.stn_id);
        if (!(stn in board.water[crop])) continue;
        const run = latest.get(sc.stn_id);
        const sum = run
          ? sums.find(
              (x) =>
                x.run_id === run.run_id && x.scenario_id === sc.scenario_id,
            )
          : undefined;
        const last = newestFirst(
          bal.filter((b) => b.scenario_id === sc.scenario_id),
        )[0];
        const status = code(sum?.status_start) ?? code(last?.status);
        if (!status) continue;
        let forecast: StationWater["forecast"] = null;
        if (run && sum) {
          const first = firstMainDate(run.run_at, run.run_name);
          forecast = {
            needIn: needInDays(sum.need_center_in, first, today),
            days: days
              .filter(
                (d) =>
                  d.run_id === run.run_id &&
                  d.scenario_id === sc.scenario_id &&
                  d.target_date > today,
              )
              .sort((a, b) => a.lead_day - b.lead_day)
              .slice(0, 3)
              .flatMap((d) => {
                const st = code(d.status);
                return st ? [{ date: d.target_date, status: st }] : [];
              }),
          };
        }
        board.water[crop][stn] = {
          status,
          drMm: sum ? sum.dr_start_mm : (last?.dr_mm ?? null),
          rawMm: sc.raw_mm,
          tawMm: sc.taw_mm,
          seasonStart: sc.season_start,
          seasonEnd: sc.season_end,
          observedDate: last?.date ?? null,
          forecast,
        };
      }
    }
    return board;
  } catch (error) {
    console.error("[status] 지점 판정 읽기 실패:", error);
    return emptyBoard(false);
  }
}

/** 헤더 지역 칩 점 색: 상태만. */
export function statusesOf(board: StationBoard): StationStatuses {
  const pick = (crop: Crop) =>
    Object.fromEntries(
      STATIONS.map((s) => [s.id, board.water[crop][s.id]?.status ?? null]),
    ) as Record<number, WaterStatus | null>;
  return { apple: pick("apple"), cabbage: pick("cabbage") };
}

/** 이 지점의 마지막 ASOS 관측일과 받은 시각 (온도·햇빛 자료 상자). 실패하면 null. */
export async function getObserved(
  stationId: number,
  { createSource = () => createStatusSource() }: Deps = {},
): Promise<{ date: string; fetchedAt: string } | null> {
  try {
    const row = await createSource().lastObserved(String(stationId));
    return row ? { date: row.date, fetchedAt: row.fetched_at } : null;
  } catch (error) {
    console.error("[status] 관측 시각 읽기 실패:", error);
    return null;
  }
}
