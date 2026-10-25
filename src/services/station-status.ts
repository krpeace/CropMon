import { CROPS, type Crop } from "@/domain/selection";
import { addDays, CROP_DB_ID, koreanDate } from "@/domain/water-outlook";
import { WATER_STATUSES, type WaterStatus } from "@/domain/water-status";
import { STATIONS } from "@/infra/stations";
import {
  createStatusSource,
  type StatusSource,
} from "@/infra/supabase/status-source";

/**
 * 지점 10곳 × 작물의 오늘 물 판정 (지역 칩 점 색, 결정 0010).
 * 물 화면 ①과 같은 기준: 기본 재배 방식 조건의 최신 회차 출발 상태,
 * 회차가 없으면 최근 7일 안의 마지막 관측 물수지, 둘 다 없으면 null("자료 없음").
 */

export type StationStatuses = Record<Crop, Record<number, WaterStatus | null>>;

type Deps = { createSource?: () => StatusSource; now?: () => Date };

const RECENT_RUNS = 40; // 지점 10곳 × 하루 2회 × 이틀
const BALANCE_DAYS = 7;

function code(v: string | undefined): WaterStatus | null {
  return (WATER_STATUSES as readonly string[]).includes(v ?? "")
    ? (v as WaterStatus)
    : null;
}

function emptyStatuses(): StationStatuses {
  const blank = () =>
    Object.fromEntries(STATIONS.map((s) => [s.id, null])) as Record<
      number,
      WaterStatus | null
    >;
  return { apple: blank(), cabbage: blank() };
}

export async function getStationStatuses({
  createSource = () => createStatusSource(),
  now = () => new Date(),
}: Deps = {}): Promise<StationStatuses> {
  const out = emptyStatuses();
  try {
    const db = createSource();
    const today = koreanDate(now().toISOString());
    const scen = await db.defaultScenarios(Number(today.slice(0, 4)));
    if (scen.length === 0) return out;
    const runs = await db.recentRuns(RECENT_RUNS);
    const latest = new Map<string, number>(); // 지점 → 최신 회차 (runs 는 새것부터)
    for (const r of runs)
      if (!latest.has(r.stn_id)) latest.set(r.stn_id, r.run_id);
    const ids = scen.map((s) => s.scenario_id);
    const [sums, bal] = await Promise.all([
      latest.size
        ? db.summaries([...latest.values()], ids)
        : Promise.resolve([]),
      db.recentBalance(ids, addDays(today, -BALANCE_DAYS)),
    ]);
    const lastBal = new Map<string, string>(); // 조건 → 마지막 관측 판정 (새것부터)
    for (const b of [...bal].sort((a, b) => (a.date < b.date ? 1 : -1))) {
      if (!lastBal.has(b.scenario_id)) lastBal.set(b.scenario_id, b.status);
    }
    for (const crop of CROPS) {
      for (const s of scen.filter((x) => x.crop_id === CROP_DB_ID[crop])) {
        const stn = Number(s.stn_id);
        if (!(stn in out[crop])) continue;
        const run = latest.get(s.stn_id);
        const sum = sums.find(
          (x) => x.run_id === run && x.scenario_id === s.scenario_id,
        );
        out[crop][stn] =
          code(sum?.status_start) ?? code(lastBal.get(s.scenario_id));
      }
    }
    return out;
  } catch (error) {
    console.error("[status] 지점 판정 읽기 실패:", error);
    return emptyStatuses();
  }
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
