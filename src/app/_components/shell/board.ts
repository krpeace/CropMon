import { cacheLife } from "next/cache";
import { connection } from "next/server";

import type { Crop } from "@/domain/selection";
import { getHomeGrowth } from "@/services/growth-latest";
import { getStationBoard } from "@/services/station-status";

/**
 * 지점 판정 표 (헤더 점 색 + 종합 화면). 모든 쪽에 나오므로 DB 를 매번 읽지 않고 5분 동안 같은 값을 쓴다.
 * 판정은 하루 두 번(02·17시 회차) 바뀌므로 5분이면 충분하다 (결정 0010·0011).
 */
async function cached() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  return getStationBoard();
}

export async function loadBoard() {
  // 배포용으로 만들 때(build) 미리 읽어 두지 않고, 첫 요청 때 읽어 5분 동안 쓴다
  await connection();
  return cached();
}

/**
 * 종합 화면 온도·햇빛 카드와 전국 표의 적산온도·적산일사 (결정 0017). 헤더는 쓰지 않으므로 판정 표와 따로 둔다.
 * 하루 한 번 바뀌는 값이라 판정 표처럼 5분 동안 같은 값을 쓴다 (작물마다 한 벌).
 */
async function cachedGrowth(crop: Crop) {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  return getHomeGrowth(crop);
}

export async function loadGrowth(crop: Crop) {
  await connection();
  return cachedGrowth(crop);
}
