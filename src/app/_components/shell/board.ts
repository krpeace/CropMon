import { cacheLife } from "next/cache";
import { connection } from "next/server";

import type { Crop } from "@/domain/selection";
import { CROP_DB_ID, koreanDate } from "@/domain/water-outlook";
import { STATIONS } from "@/infra/stations";
import { createHeatSource } from "@/infra/supabase/heat-source";
import { createSunSource } from "@/infra/supabase/sun-source";
import {
  readHeatLatest,
  readSunLatest,
  type HeatLatest,
  type HomeGrowth,
  type SunLatest,
} from "@/services/growth-latest";
import {
  emptyBoard,
  getStationBoard,
  type StationBoard,
} from "@/services/station-status";

const ACTIVE_STATIONS = STATIONS.filter((s) => s.isActive);

/**
 * 지점 판정 표 DB 읽기. 실패 시 Error를 던져 Next.js 캐시 저장을 취소한다 (결정 0038·0040).
 */
export async function fetchStationBoard(): Promise<StationBoard> {
  const board = await getStationBoard({ stationScope: "active" });
  if (!board.ok) {
    throw new Error("[board] 지점 판정 DB 읽기 실패 (board.ok=false)");
  }
  return board;
}

/**
 * 종합 화면 적산온도 DB 읽기. 실패 시 Error를 던져 Next.js 캐시 저장을 취소한다 (결정 0017·0038·0040).
 */
export async function fetchHomeHeat(
  crop: Crop,
  today: string,
): Promise<Record<number, HeatLatest>> {
  return readHeatLatest(createHeatSource(), CROP_DB_ID[crop], today, "active");
}

/**
 * 종합 화면 적산일사 DB 읽기. 실패 시 Error를 던져 Next.js 캐시 저장을 취소한다 (결정 0017·0038·0040).
 */
export async function fetchHomeSun(
  today: string,
): Promise<Record<number, SunLatest>> {
  return readSunLatest(createSunSource(), today, "active");
}

/**
 * 지점 판정 표 (헤더 점 색 + 종합 화면). 모든 쪽에 나오므로 DB 를 매번 읽지 않고 30분 동안 같은 값을 쓴다.
 * 오늘 날짜(today)를 인자로 받아 캐시 열쇠에 포함한다.
 * 판정은 하루 두 번(02·17시 회차) 바뀌므로 30분이면 충분하며, 하루 최대 DB 읽기 상한은 48회로 제한된다 (결정 0010·0011·0038).
 */
async function cached(today: string) {
  "use cache";
  void today;
  cacheLife({ stale: 1800, revalidate: 1800, expire: 86400 });
  return fetchStationBoard();
}

export async function loadBoard() {
  // 배포용으로 만들 때(build) 미리 읽어 두지 않고, 첫 요청 때 읽어 30분 동안 쓴다
  await connection();
  const today = koreanDate(new Date().toISOString());
  try {
    return await cached(today);
  } catch (error) {
    console.error("[board] 판정 표 캐시 로드 실패 (폴백 반환):", error);
    return emptyBoard(false, ACTIVE_STATIONS, ACTIVE_STATIONS);
  }
}

/**
 * 종합 화면 적산온도 캐시 (작물마다 한 벌, 30분).
 * 실패 시 Error가 던져져 캐시 저장이 취소된다.
 */
async function cachedHeat(crop: Crop, today: string) {
  "use cache";
  cacheLife({ stale: 1800, revalidate: 1800, expire: 86400 });
  return fetchHomeHeat(crop, today);
}

/**
 * 종합 화면 적산일사 캐시 (작물 무관, 30분).
 * 실패 시 Error가 던져져 캐시 저장이 취소된다.
 */
async function cachedSun(today: string) {
  "use cache";
  cacheLife({ stale: 1800, revalidate: 1800, expire: 86400 });
  return fetchHomeSun(today);
}

/**
 * 종합 화면 생육 자료(온도·햇빛).
 * 결정 0017 원칙: 적산온도와 적산일사를 따로 캐시·조회하여 한쪽이 실패해도 다른 쪽은 정상 표출한다.
 * 실패한 쪽만 에러가 throw되어 캐시되지 않고 다음 요청에서 다시 읽는다.
 */
export async function loadGrowth(crop: Crop): Promise<HomeGrowth> {
  await connection();
  const today = koreanDate(new Date().toISOString());

  const [heatResult, sunResult] = await Promise.allSettled([
    cachedHeat(crop, today),
    cachedSun(today),
  ]);

  const heatOk = heatResult.status === "fulfilled";
  const sunOk = sunResult.status === "fulfilled";

  if (!heatOk) {
    console.error("[growth] 적산온도 캐시 읽기 실패:", heatResult.reason);
  }
  if (!sunOk) {
    console.error("[growth] 적산일사 캐시 읽기 실패:", sunResult.reason);
  }

  return {
    heatOk,
    sunOk,
    heat: heatResult.status === "fulfilled" ? heatResult.value : {},
    sun: sunResult.status === "fulfilled" ? sunResult.value : {},
  };
}
