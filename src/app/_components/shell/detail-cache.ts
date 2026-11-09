import { cacheLife } from "next/cache";

import { heatDiff } from "@/domain/heat";
import type { Selection } from "@/domain/selection";
import { sunPercent } from "@/domain/sun";
import type { WaterQuery } from "@/domain/water-outlook";
import { STATIONS } from "@/infra/stations";
import type { Station } from "@/services/shell";
import {
  getSunlightView,
  type SunCompareRow,
  type SunlightView,
} from "@/services/sunlight";
import {
  getTemperatureView,
  type CompareRow,
  type TemperatureView,
} from "@/services/temperature";
import { getWaterView, type WaterView } from "@/services/water";

import { fetchHomeHeat, fetchHomeSun } from "./board";

/**
 * 물 화면 DB 읽기. DB 장애 시 Error를 던져 Next.js 캐시 저장을 취소한다 (결정 0040).
 */
export async function fetchWater(
  selection: Selection,
  station: Station,
  query: WaterQuery,
  today: string,
): Promise<WaterView> {
  const view = await getWaterView(selection, station, query, {
    now: () => new Date(`${today}T00:00:00+09:00`),
  });
  if (
    view.problem === "물 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요."
  ) {
    throw new Error(
      `[water] DB 읽기 실패 (지점 ${station.id}, 작물 ${selection.crop})`,
    );
  }
  return view;
}

/**
 * 온도 화면 DB 읽기. DB 장애 시 Error를 던져 Next.js 캐시 저장을 취소한다 (결정 0040).
 */
export async function fetchTemperature(
  selection: Selection,
  station: Station,
  today: string,
): Promise<TemperatureView> {
  const view = await getTemperatureView(selection, station, {
    now: () => new Date(`${today}T00:00:00+09:00`),
  });
  if (
    view.problem ===
    "온도 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요."
  ) {
    throw new Error(
      `[temperature] DB 읽기 실패 (지점 ${station.id}, 작물 ${selection.crop})`,
    );
  }
  return view;
}

/**
 * 햇빛 화면 DB 읽기. DB 장애 시 Error를 던져 Next.js 캐시 저장을 취소한다 (결정 0040).
 * 센서가 없는 지점(notMeasured)은 정상 판정이므로 에러를 던지지 않고 정상 반환한다.
 */
export async function fetchSunlight(
  selection: Selection,
  station: Station,
  today: string,
): Promise<SunlightView> {
  const view = await getSunlightView(selection, station, {
    now: () => new Date(`${today}T00:00:00+09:00`),
  });
  if (
    view.problem ===
    "햇빛 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요."
  ) {
    throw new Error(`[sunlight] DB 읽기 실패 (지점 ${station.id})`);
  }
  return view;
}

/**
 * 물 화면 캐시 함수 (30분 유지, 실패 미캐시, SWR 지원).
 * 오늘 날짜(today)를 인자로 받아 캐시 열쇠에 포함한다.
 */
async function cachedWater(
  selection: Selection,
  station: Station,
  query: WaterQuery,
  today: string,
): Promise<WaterView> {
  "use cache";
  void today;
  cacheLife({ stale: 1800, revalidate: 1800, expire: 86400 });
  return fetchWater(selection, station, query, today);
}

/**
 * 온도 화면 캐시 함수 (30분 유지, 실패 미캐시, SWR 지원).
 * 오늘 날짜(today)를 인자로 받아 캐시 열쇠에 포함한다.
 */
async function cachedTemperature(
  selection: Selection,
  station: Station,
  today: string,
): Promise<TemperatureView> {
  "use cache";
  void today;
  cacheLife({ stale: 1800, revalidate: 1800, expire: 86400 });
  return fetchTemperature(selection, station, today);
}

/**
 * 햇빛 화면 캐시 함수 (30분 유지, 실패 미캐시, SWR 지원).
 * 오늘 날짜(today)를 인자로 받아 캐시 열쇠에 포함한다.
 */
async function cachedSunlight(
  selection: Selection,
  station: Station,
  today: string,
): Promise<SunlightView> {
  "use cache";
  void today;
  cacheLife({ stale: 1800, revalidate: 1800, expire: 86400 });
  return fetchSunlight(selection, station, today);
}

function emptyWaterFallback(station: Station): WaterView {
  return {
    meta: {
      source: `기상청 ASOS ${station.name}(${station.id}) · 단기예보 · FAO-56 물수지`,
      issue: "자료 없음",
      updated: "자료 없음",
      short: "자료 없음",
    },
    cultivation: [],
    soils: [],
    scenarioId: null,
    day: null,
    now: null,
    commonNow: null,
    outlook: null,
    season: [],
    months: [],
    rawMm: null,
    tawMm: null,
    problem: "물 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
  };
}

async function fallbackTemperature(
  selection: Selection,
  today: string,
): Promise<TemperatureView> {
  let compare: CompareRow[] = [];
  try {
    const heatMap = await fetchHomeHeat(selection.crop, today);
    compare = STATIONS.filter((s) => s.isRepresentative).map((s) => {
      const h = heatMap[s.id];
      const diff = h ? heatDiff(h.cum, h.normal) : null;
      return {
        id: s.id,
        name: s.name,
        selected: s.id === selection.stationId,
        diff: diff?.value ?? null,
        text: diff?.text ?? "자료 없음",
      };
    });
  } catch {
    compare = [];
  }
  return {
    basis: null,
    verdict: "자료 없음",
    numbers: null,
    observedDate: null,
    updatedAt: null,
    baseTemp: null,
    normalPeriod: null,
    stages: [],
    days: [],
    today,
    compare,
    compareProblem: null,
    problem: "온도 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
  };
}

async function fallbackSunlight(
  selection: Selection,
  today: string,
): Promise<SunlightView> {
  let compare: SunCompareRow[] = [];
  try {
    const sunMap = await fetchHomeSun(today);
    compare = STATIONS.filter((s) => s.isRepresentative).map((s) => {
      const r = sunMap[s.id];
      const pct = sunPercent(r?.cum ?? null, r?.normal ?? null);
      return {
        id: s.id,
        name: s.name,
        selected: s.id === selection.stationId,
        pct,
        text: pct == null ? "자료 없음" : `${pct}%`,
      };
    });
  } catch {
    compare = [];
  }
  return {
    kind: "error",
    basis: null,
    verdict: "자료 없음",
    numbers: null,
    observedDate: null,
    updatedAt: null,
    summary: null,
    normalPeriod: null,
    days: [],
    today,
    months: [],
    monthNote: null,
    compare,
    compareProblem: null,
    problem: "햇빛 자료를 불러오지 못했어요. 잠시 뒤 다시 확인해 주세요.",
  };
}

/**
 * 물 화면 데이터 로드 (캐시 실패 시 안전한 폴백 반환).
 */
export async function loadWater(
  selection: Selection,
  station: Station,
  query: WaterQuery,
  today: string,
): Promise<WaterView> {
  try {
    return await cachedWater(selection, station, query, today);
  } catch (error) {
    console.error("[water] 캐시 로드 실패 (폴백 반환):", error);
    return emptyWaterFallback(station);
  }
}

/**
 * 온도 화면 데이터 로드 (캐시 실패 시 안전한 폴백 반환, 결정 0017: 지역 비교는 보여 줌).
 */
export async function loadTemperature(
  selection: Selection,
  station: Station,
  today: string,
): Promise<TemperatureView> {
  try {
    return await cachedTemperature(selection, station, today);
  } catch (error) {
    console.error("[temperature] 캐시 로드 실패 (폴백 반환):", error);
    return fallbackTemperature(selection, today);
  }
}

/**
 * 햇빛 화면 데이터 로드 (캐시 실패 시 안전한 폴백 반환, 결정 0017: 지역 비교는 보여 줌).
 */
export async function loadSunlight(
  selection: Selection,
  station: Station,
  today: string,
): Promise<SunlightView> {
  try {
    return await cachedSunlight(selection, station, today);
  } catch (error) {
    console.error("[sunlight] 캐시 로드 실패 (폴백 반환):", error);
    return fallbackSunlight(selection, today);
  }
}
