import { cacheLife } from "next/cache";
import { connection } from "next/server";

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
