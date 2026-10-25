import { statusesOf } from "@/services/station-status";

import { loadBoard } from "./board";
import { SiteHeader } from "./SiteHeader";

/** 지점 판정을 서버에서 읽어 헤더(브라우저 쪽)에 넘긴다. layout 에서 <Suspense> 안에 둔다. */
export async function SiteHeaderWithStatus() {
  return <SiteHeader statuses={statusesOf(await loadBoard())} />;
}
