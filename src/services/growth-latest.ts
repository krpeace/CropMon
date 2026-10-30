import type { Crop } from "@/domain/selection";
import { addDays, CROP_DB_ID, koreanDate } from "@/domain/water-outlook";
import {
  createHeatSource,
  type HeatLatestRow,
  type HeatSource,
} from "@/infra/supabase/heat-source";
import {
  createSunSource,
  type SunLatestRow,
  type SunSource,
} from "@/infra/supabase/sun-source";
import { STATIONS } from "@/infra/stations";

/**
 * 지점 10곳의 마지막 관측일 적산온도·적산일사 (결정 0013·0032). 온도·햇빛 화면의 지역 비교와 종합 화면이 같이 쓴다.
 * 10곳을 한 번에(`in`) 어제 날짜로 읽고, 어제 값이 없는 지점만 최근 14일에서 마지막 관측일을 보충한다.
 * 계산하지 않는다 (DB 값 그대로).
 */

export type HeatLatest = {
  cum: number | null;
  normal: number | null;
};
export type SunLatest = { cum: number | null; normal: number | null };

/** 종합 화면용: 읽기에 실패한 쪽은 ok 가 false 이고 빈 표. */
export type HomeGrowth = {
  heatOk: boolean;
  sunOk: boolean;
  heat: Record<number, HeatLatest>;
  sun: Record<number, SunLatest>;
};

/** 어제 값이 없는 지점은 이만큼 거슬러 올라가 마지막 관측일을 찾는다. */
const LOOKBACK_DAYS = 14;
const REP_STATIONS = STATIONS.filter((s) => s.isRepresentative);

/** 어제 + 빠진 지점 보충. 지점마다 올해 값(has)이 있는 마지막 줄을 남긴다. */
async function latestRows<T extends { stn_id: string }>(
  today: string,
  has: (r: T) => boolean,
  onDate: (ids: string[], date: string) => Promise<T[]>,
  recent: (ids: string[], from: string, until: string) => Promise<T[]>,
): Promise<Map<string, T>> {
  const yesterday = addDays(today, -1);
  const ids = REP_STATIONS.map((s) => String(s.id));
  const found = new Map<string, T>();
  for (const r of await onDate(ids, yesterday))
    if (has(r)) found.set(r.stn_id, r);
  const missing = ids.filter((id) => !found.has(id));
  if (missing.length > 0) {
    const from = addDays(yesterday, -(LOOKBACK_DAYS - 1));
    // 날짜 순이므로 나중 줄이 앞 줄을 덮어 지점마다 마지막 관측일이 남는다
    for (const r of await recent(missing, from, yesterday)) {
      if (has(r)) found.set(r.stn_id, r);
    }
  }
  return found;
}

export async function readHeatLatest(
  db: HeatSource,
  cropId: string,
  today: string,
): Promise<Record<number, HeatLatest>> {
  const rows = await latestRows<HeatLatestRow>(
    today,
    (r) => r.gdd_cum != null,
    (ids, date) => db.onDate(ids, cropId, date),
    (ids, from, until) => db.recent(ids, cropId, from, until),
  );
  const out: Record<number, HeatLatest> = {};
  for (const [id, r] of rows) {
    out[Number(id)] = { cum: r.gdd_cum, normal: r.gdd_normal_cum };
  }
  return out;
}

export async function readSunLatest(
  db: SunSource,
  today: string,
): Promise<Record<number, SunLatest>> {
  const rows = await latestRows<SunLatestRow>(
    today,
    (r) => r.rs_cum_mj != null,
    (ids, date) => db.onDate(ids, date),
    (ids, from, until) => db.recent(ids, from, until),
  );
  const out: Record<number, SunLatest> = {};
  for (const [id, r] of rows) {
    out[Number(id)] = { cum: r.rs_cum_mj, normal: r.rs_normal_cum_mj };
  }
  return out;
}

type Deps = {
  createHeat?: () => HeatSource;
  createSun?: () => SunSource;
  now?: () => Date;
};

/** 종합 화면 온도·햇빛 카드와 전국 표. 한쪽이 실패해도 다른 쪽은 남는다. 던지지 않는다. */
export async function getHomeGrowth(
  crop: Crop,
  {
    createHeat = () => createHeatSource(),
    createSun = () => createSunSource(),
    now = () => new Date(),
  }: Deps = {},
): Promise<HomeGrowth> {
  const today = koreanDate(now().toISOString());
  const [heat, sun] = await Promise.all([
    attempt("적산온도", () =>
      readHeatLatest(createHeat(), CROP_DB_ID[crop], today),
    ),
    attempt("적산일사", () => readSunLatest(createSun(), today)),
  ]);
  return {
    heatOk: heat != null,
    sunOk: sun != null,
    heat: heat ?? {},
    sun: sun ?? {},
  };
}

async function attempt<T>(name: string, read: () => Promise<T>) {
  try {
    return await read();
  } catch (error) {
    console.error(`[home] ${name} 읽기 실패:`, error);
    return null;
  }
}
