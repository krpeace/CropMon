import { cacheLife } from "next/cache";
import { connection } from "next/server";

import { getStationStatuses } from "@/services/station-status";

import { SiteHeader } from "./SiteHeader";

/**
 * 지점별 오늘 물 판정. 헤더는 모든 쪽에 나오므로 DB 를 매번 읽지 않고 5분 동안 같은 값을 쓴다.
 * 판정은 하루 두 번(02·17시 회차) 바뀌므로 5분이면 충분하다 (결정 0010).
 */
async function cachedStatuses() {
  "use cache";
  cacheLife({ stale: 60, revalidate: 300, expire: 3600 });
  return getStationStatuses();
}

/** 판정을 서버에서 읽어 헤더(브라우저 쪽)에 넘긴다. layout 에서 <Suspense> 안에 둔다. */
export async function SiteHeaderWithStatus() {
  // 배포용으로 만들 때(build) 미리 읽어 두지 않고, 첫 요청 때 읽어 5분 동안 쓴다
  await connection();
  return <SiteHeader statuses={await cachedStatuses()} />;
}
