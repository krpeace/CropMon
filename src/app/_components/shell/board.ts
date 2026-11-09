import { cacheLife } from "next/cache";
import { connection } from "next/server";

import { koreanDate } from "@/domain/water-outlook";
import type { Crop } from "@/domain/selection";
import { STATIONS } from "@/infra/stations";
import { getHomeGrowth, type HomeGrowth } from "@/services/growth-latest";
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
 * 종합 화면 생육(온도·햇빛) DB 읽기. 실패 시 Error를 던져 Next.js 캐시 저장을 취소한다.
 */
export async function fetchHomeGrowth(crop: Crop): Promise<HomeGrowth> {
  const growth = await getHomeGrowth(crop, { stationScope: "active" });
  if (!growth.heatOk || !growth.sunOk) {
    throw new Error(
      `[growth] 생육 자료 DB 읽기 실패 (heatOk=${growth.heatOk}, sunOk=${growth.sunOk})`,
    );
  }
  return growth;
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
 * 종합 화면 온도·햇빛 카드와 전국 표의 적산온도·적산일사 (결정 0017·0038). 헤더는 쓰지 않으므로 판정 표와 따로 둔다.
 * 오늘 날짜(today)를 인자로 받아 캐시 열쇠에 포함한다.
 * 하루 한 번 바뀌는 값이라 판정 표처럼 30분 동안 같은 값을 쓴다 (작물마다 한 벌).
 */
async function cachedGrowth(crop: Crop, today: string) {
  "use cache";
  void today;
  cacheLife({ stale: 1800, revalidate: 1800, expire: 86400 });
  return fetchHomeGrowth(crop);
}

export async function loadGrowth(crop: Crop) {
  await connection();
  const today = koreanDate(new Date().toISOString());
  try {
    return await cachedGrowth(crop, today);
  } catch (error) {
    console.error("[growth] 생육 자료 캐시 로드 실패 (폴백 반환):", error);
    return { heatOk: false, sunOk: false, heat: {}, sun: {} };
  }
}
